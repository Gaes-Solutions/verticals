mod types;

use axum::{routing::post, Json, Router};
use serde_json::json;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use types::Ticket;

const LISTEN_ADDR: &str = "127.0.0.1:9876";

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    info!("GaesSoft Print Bridge — escuchando en {LISTEN_ADDR}");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/status", axum::routing::get(status))
        .route("/print/ticket", post(print_ticket))
        .layer(cors);

    let addr: SocketAddr = LISTEN_ADDR.parse().expect("dirección de escucha inválida");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("no se pudo abrir el puerto local del print-bridge");
    axum::serve(listener, app).await.expect("axum::serve falló");
}

async fn status() -> Json<serde_json::Value> {
    Json(json!({
        "service": "gaespos-print-bridge",
        "version": env!("CARGO_PKG_VERSION"),
        "status": "ok"
    }))
}

async fn print_ticket(Json(ticket): Json<Ticket>) -> Json<serde_json::Value> {
    let descripcion = match &ticket {
        Ticket::Venta(v) => format!("venta {}", v.venta.folio),
        Ticket::Corte(c) => format!("corte {} #{}", c.corte.tipo, c.corte.numero),
    };
    info!("recibido print/ticket: {descripcion}");
    // TODO 1.6.b: implementar render ESC/POS via escpos-rs y mandar al device USB seleccionado.
    Json(json!({ "ok": true, "queued": descripcion }))
}
