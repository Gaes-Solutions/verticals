mod types;
mod render;
use axum::{body::Bytes, extract::{DefaultBodyLimit, State}, http::{header, HeaderMap, HeaderValue, Method, StatusCode}, routing::{get, post}, Json, Router};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::{io::AsyncWriteExt, sync::Mutex};
use tower_http::cors::CorsLayer;
use types::Ticket;
struct Config { token: String, destination: Destination, jobs: PathBuf, columns: usize, cut: bool, lock: Mutex<()> }
enum Destination { Tcp(SocketAddr), Spool(String) }
type Reply = (StatusCode, Json<Value>);
fn response(code: StatusCode, message: &str) -> Reply { (code, Json(json!({"message": message}))) }
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = std::env::var("GAES_PRINT_TOKEN").map_err(|_| "Configura GAES_PRINT_TOKEN con al menos 32 caracteres aleatorios")?;
    if token.len() < 32 { return Err("Token demasiado corto".into()); }
    let origin: HeaderValue = std::env::var("GAES_PRINT_ORIGIN")?.parse()?;
    let destination = if let Ok(address) = std::env::var("GAES_PRINT_TCP") { Destination::Tcp(address.parse()?) } else {
        let name = std::env::var("GAES_PRINT_SPOOL")?;
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || "_-.".contains(c)) { return Err("Nombre de impresora invalido".into()); }
        Destination::Spool(name)
    };
    let jobs = PathBuf::from(std::env::var("GAES_PRINT_JOBS")?);
    if !jobs.is_absolute() { return Err("GAES_PRINT_JOBS debe ser una ruta absoluta persistente".into()); }
    tokio::fs::create_dir_all(&jobs).await?;
    prune_accepted_jobs(&jobs).await;
    let columns = std::env::var("GAES_PRINT_COLUMNS").unwrap_or("32".into()).parse()?;
    if columns != 32 && columns != 48 { return Err("Columnas: 32 o 48".into()); }
    let state = Arc::new(Config { token, destination, jobs, columns, cut: std::env::var("GAES_PRINT_CUT").as_deref() == Ok("1"), lock: Mutex::new(()) });
    let cors = CorsLayer::new().allow_origin(origin).allow_methods([Method::GET, Method::POST]).allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::HeaderName::from_static("idempotency-key")])
        // Chrome pide este permiso para que una pagina publica hable con 127.0.0.1 (Private Network Access).
        .allow_private_network(true);
    let app = Router::new().route("/status", get(status)).route("/print/ticket", post(print_ticket)).layer(DefaultBodyLimit::max(256*1024)).layer(cors).with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:9876").await?;
    eprintln!("GaesSoft Print Bridge 0.2.0 en 127.0.0.1:9876");
    axum::serve(listener, app).await?; Ok(())
}
// Solo se borran impresiones confirmadas y viejas; las inciertas se conservan para revisarlas.
async fn prune_accepted_jobs(dir: &std::path::Path) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else { return };
    let Some(limit) = std::time::SystemTime::now().checked_sub(Duration::from_secs(30 * 24 * 60 * 60)) else { return };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let old = entry.metadata().await.ok().and_then(|m| m.modified().ok()).is_some_and(|t| t < limit);
        if !old { continue; }
        let path = entry.path();
        if tokio::fs::read_to_string(&path).await.is_ok_and(|c| c.starts_with("accepted:")) { let _ = tokio::fs::remove_file(&path).await; }
    }
}
fn authorized(headers: &HeaderMap, state: &Config) -> bool {
    let expected = format!("Bearer {}", state.token);
    // Compare digests to avoid exposing token length/prefix through early return.
    let actual = headers.get(header::AUTHORIZATION).map(|h| h.as_bytes()).unwrap_or(b"");
    let a = Sha256::digest(actual); let b = Sha256::digest(expected.as_bytes());
    a.iter().zip(b.iter()).fold(0u8, |difference, (x,y)| difference | (x ^ y)) == 0
}
async fn status(State(state): State<Arc<Config>>, headers: HeaderMap) -> Reply {
    if !authorized(&headers, &state) { return response(StatusCode::UNAUTHORIZED, "Vincula la impresora con su clave local"); }
    (StatusCode::OK, Json(json!({"service":"gaespos-print-bridge", "version":"0.2.0", "status":"configured", "columns":state.columns})))
}
async fn send(config: &Config, bytes: &[u8]) -> std::io::Result<()> {
    match &config.destination {
        Destination::Tcp(address) => { let mut stream = tokio::net::TcpStream::connect(address).await?; stream.write_all(bytes).await?; stream.shutdown().await }
        Destination::Spool(name) => {
            let mut child = tokio::process::Command::new("lp").args(["-d", name, "-o", "raw"]).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true).spawn()?;
            if let Some(mut stdin) = child.stdin.take() { stdin.write_all(bytes).await?; stdin.shutdown().await?; }
            if child.wait().await?.success() { Ok(()) } else { Err(std::io::Error::other("El spooler rechazo el ticket")) }
        }
    }
}
async fn print_ticket(State(state): State<Arc<Config>>, headers: HeaderMap, body: Bytes) -> Reply {
    // La clave se revisa antes de leer el ticket: sin clave no se procesa nada del cuerpo.
    if !authorized(&headers, &state) { return response(StatusCode::UNAUTHORIZED, "Clave local invalida"); }
    let ticket: Ticket = match serde_json::from_slice(&body) { Ok(t) => t, Err(_) => return response(StatusCode::UNPROCESSABLE_ENTITY, "Ticket invalido") };
    let key = headers.get("idempotency-key").and_then(|v| v.to_str().ok()).unwrap_or("");
    if key.len() != 36 || !key.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return response(StatusCode::BAD_REQUEST, "Falta identificador de impresion"); }
    let bytes = match render::render(&ticket, state.columns, state.cut) { Ok(b) => b, Err(e) => return response(StatusCode::UNPROCESSABLE_ENTITY, e) };
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let _guard = state.lock.lock().await;
    let job = state.jobs.join(key);
    if let Ok(existing) = tokio::fs::read_to_string(&job).await {
        if existing == format!("accepted:{hash}") { return (StatusCode::OK, Json(json!({"ok":true,"state":"accepted","jobId":key}))); }
        return response(StatusCode::CONFLICT, "Envio previo incierto o identificador usado; revisa el papel antes de solicitar otra copia");
    }
    let reservation = async {
        let mut file = tokio::fs::OpenOptions::new().write(true).create_new(true).open(&job).await?;
        file.write_all(format!("sending:{hash}").as_bytes()).await?; file.sync_all().await
    }.await;
    if reservation.is_err() { return response(StatusCode::SERVICE_UNAVAILABLE, "No se pudo registrar la impresion; no se envio"); }
    match tokio::time::timeout(Duration::from_secs(10), send(&state, &bytes)).await {
        Ok(Ok(())) => {
            // A failed journal update leaves an uncertain job; never auto-send it again.
            let result = async { let mut file = tokio::fs::OpenOptions::new().write(true).truncate(true).open(&job).await?; file.write_all(format!("accepted:{hash}").as_bytes()).await?; file.sync_all().await }.await;
            if result.is_err() { return response(StatusCode::CONFLICT, "Envio realizado; registro local incierto. Revisa la impresora"); }
            (StatusCode::OK, Json(json!({"ok":true,"state":"accepted","jobId":key,"message":"Enviado a la impresora; comprueba el papel"})))
        }
        _ => response(StatusCode::CONFLICT, "No se pudo confirmar el envio. Revisa la impresora antes de pedir otra copia"),
    }
}
