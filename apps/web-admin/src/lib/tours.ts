export interface TourStep {
  /** Sección a la que navegar antes de este paso (dispara "gaes-nav"). */
  seccion?: string;
  /** data-tour del elemento a resaltar. Si falta, el paso solo muestra texto. */
  anchor?: string;
  /** data-tour de un botón que se hace click para abrir un diálogo/modal antes
   * de resaltar `anchor` (que suele estar dentro de ese diálogo). */
  abrir?: string;
  titulo: string;
  texto: string;
}

export interface TourDef {
  id: string;
  nombre: string;
  descripcion: string;
  pasos: TourStep[];
  /** Se ofrece solo una vez de forma automática (con opción de deshabilitar). */
  autoOnce?: boolean;
}

export const TOURS: TourDef[] = [
  {
    id: "bienvenida",
    nombre: "Recorrido de bienvenida",
    descripcion: "Un vistazo rápido a las partes clave de tu panel.",
    autoOnce: true,
    pasos: [
      {
        titulo: "¡Bienvenido a GaesSoft! 👋",
        texto:
          "Te doy un recorrido de 30 segundos por lo principal. Puedes salir cuando quieras y retomarlo desde Ayuda.",
      },
      {
        seccion: "inicio",
        anchor: "nav-inicio",
        titulo: "Tu guía de inicio",
        texto:
          "Aquí tienes los pasos para dejar tu negocio listo. Se van palomeando solos conforme los completas.",
      },
      {
        anchor: "nav-productos",
        titulo: "Tus productos",
        texto: "Desde aquí cargas y administras todo lo que vendes.",
      },
      {
        anchor: "nav-ayuda",
        titulo: "Ayuda cuando la necesites",
        texto:
          "En Ayuda encuentras el manual y puedes volver a lanzar cualquier recorrido guiado como este.",
      },
      {
        titulo: "¡Listo para empezar! 🎉",
        texto: "Cuando quieras, te acompaño paso a paso a crear tu primer producto.",
      },
    ],
  },
  {
    id: "crear-producto",
    nombre: "Crear tu primer producto",
    descripcion: "Te llevo de la mano para dar de alta un producto.",
    pasos: [
      {
        seccion: "productos",
        anchor: "nav-productos",
        titulo: "Entra a Productos",
        texto: "Aquí vive tu catálogo. Ya te llevé a esta sección.",
      },
      {
        anchor: "prod-nuevo",
        titulo: "Agrega uno nuevo",
        texto: "Toca “+ Nuevo producto”. (Ahora te abro el formulario para mostrarte cómo.)",
      },
      {
        abrir: "prod-nuevo",
        anchor: "prod-f-nombre",
        titulo: "1) El nombre",
        texto: "Escribe aquí cómo se llama el producto. Es lo único obligatorio junto al precio.",
      },
      {
        anchor: "prod-f-precio",
        titulo: "2) El precio de venta",
        texto: "Aquí va a cuánto lo vendes. Con nombre y precio ya puedes cobrarlo.",
      },
      {
        anchor: "prod-f-sku",
        titulo: "3) Código de barras (opcional)",
        texto: "Si lo escaneas en caja, captura aquí su clave/código. Si no, déjalo vacío.",
      },
      {
        anchor: "prod-f-guardar",
        titulo: "4) ¡Guarda! ✅",
        texto: "Toca Guardar y tu producto queda listo para venderse en el POS y en línea.",
      },
    ],
  },
  {
    id: "dar-entrada-inventario",
    nombre: "Dar entrada a inventario",
    descripcion: "Te guío para registrar mercancía que entra a tu almacén.",
    pasos: [
      {
        seccion: "inventario",
        anchor: "nav-inventario",
        titulo: "Entra a Inventario",
        texto: "Aquí ves y ajustas las existencias de cada producto. Ya te traje a esta sección.",
      },
      {
        anchor: "inv-nuevo",
        titulo: "Registra una entrada",
        texto: "Toca “+ Entrada de inventario”. (Ahora te abro la ventana para mostrarte.)",
      },
      {
        abrir: "inv-nuevo",
        anchor: "inv-f-buscar",
        titulo: "1) Busca el producto",
        texto: "Escribe el nombre o código y elígelo de la lista que aparece.",
      },
      {
        titulo: "2) Cantidad y guardar",
        texto:
          "Una vez elegido, escribe cuántas piezas entraron y el motivo (compra, ajuste…), y toca Guardar.",
      },
      {
        titulo: "¡Guardado! ✅",
        texto: "Tu stock se actualiza al instante y queda registrado el movimiento.",
      },
    ],
  },
  {
    id: "dar-alta-usuario",
    nombre: "Dar de alta a alguien de tu equipo",
    descripcion: "Crea una cuenta para un cajero, vendedor u otro colaborador.",
    pasos: [
      {
        seccion: "usuarios",
        anchor: "nav-usuarios",
        titulo: "Entra a Usuarios y permisos",
        texto: "Aquí administras a tu equipo. Ya te traje a esta sección.",
      },
      {
        anchor: "user-nuevo",
        titulo: "Agrega un usuario",
        texto: "Toca “+ Nuevo usuario”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "user-nuevo",
        anchor: "user-f-nombre",
        titulo: "1) Su nombre",
        texto: "El nombre de la persona de tu equipo.",
      },
      {
        anchor: "user-f-email",
        titulo: "2) Su correo",
        texto: "Con este correo iniciará sesión.",
      },
      {
        anchor: "user-f-pass",
        titulo: "3) Una contraseña",
        texto: "Ponle una contraseña temporal; luego él puede cambiarla.",
      },
      {
        anchor: "user-f-crear",
        titulo: "4) ¡Crea el usuario! ✅",
        texto:
          "Elige su rol y toca Crear usuario. El sistema solo le mostrará lo que su rol permite.",
      },
    ],
  },
  {
    id: "dar-alta-cliente-mayoreo",
    nombre: "Dar de alta un cliente de mayoreo",
    descripcion: "Registra a quién le vendes al por mayor, con su crédito.",
    pasos: [
      {
        seccion: "clientes-b2b",
        anchor: "nav-clientes-b2b",
        titulo: "Entra a Clientes de mayoreo",
        texto: "Aquí van tus clientes B2B. Ya te traje a esta sección.",
      },
      {
        anchor: "cli-nuevo",
        titulo: "Agrega un cliente",
        texto: "Toca “+ Nuevo cliente”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "cli-nuevo",
        anchor: "cli-f-razon",
        titulo: "1) Razón social",
        texto: "El nombre fiscal del cliente (como aparece en su RFC).",
      },
      {
        anchor: "cli-f-rfc",
        titulo: "2) RFC",
        texto: "Su RFC. Junto al régimen fiscal, son obligatorios para facturarle.",
      },
      {
        anchor: "cli-f-crear",
        titulo: "3) ¡Crea el cliente! ✅",
        texto: "Toca Crear cliente. Puedes fijarle su lista de precios y días de crédito.",
      },
    ],
  },
  {
    id: "crear-lista-precios",
    nombre: "Crear una lista de precios",
    descripcion: "Define precios especiales (mayoreo, por cliente…).",
    pasos: [
      {
        seccion: "precios",
        anchor: "nav-precios",
        titulo: "Entra a Listas de precios",
        texto: "Aquí creas precios distintos al normal. Ya te traje a esta sección.",
      },
      {
        anchor: "precio-nuevo",
        titulo: "Crea una lista",
        texto: "Toca “+ Nueva lista”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "precio-nuevo",
        anchor: "precio-f-codigo",
        titulo: "1) Un código",
        texto: "Una clave corta para identificarla, ej. MAYOREO.",
      },
      {
        anchor: "precio-f-nombre",
        titulo: "2) Su nombre",
        texto: "Cómo la verás, ej. “Precio de mayoreo”.",
      },
      {
        anchor: "precio-f-crear",
        titulo: "3) ¡Créala! ✅",
        texto:
          "Toca Crear. Luego le pones el precio especial a cada producto y la asignas a clientes.",
      },
    ],
  },
  {
    id: "crear-comision",
    nombre: "Configurar una comisión",
    descripcion: "Define cuánto gana un vendedor por vender o cobrar.",
    pasos: [
      {
        seccion: "comisiones",
        anchor: "nav-comisiones",
        titulo: "Entra a Comisiones",
        texto: "Aquí defines las comisiones de tu equipo. Ya te traje a esta sección.",
      },
      {
        anchor: "com-nuevo",
        titulo: "Crea una regla",
        texto: "Toca “+ Nueva regla”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "com-nuevo",
        anchor: "com-f-nombre",
        titulo: "1) Nómbrala",
        texto: "Un nombre para identificar la regla, ej. “Comisión general”.",
      },
      {
        anchor: "com-f-pct",
        titulo: "2) El porcentaje",
        texto:
          "Cuánto gana el vendedor, ej. 5. A la derecha eliges si es sobre la venta o el cobro.",
      },
      {
        anchor: "com-f-crear",
        titulo: "3) ¡Crea la regla! ✅",
        texto: "Toca Crear regla. El vendedor gana su comisión automáticamente en cada venta.",
      },
    ],
  },
  {
    id: "crear-cobro",
    nombre: "Cobrar con un link de pago",
    descripcion: "Genera un link para cobrarle a un cliente por WhatsApp.",
    pasos: [
      {
        seccion: "cobros",
        anchor: "nav-cobros",
        titulo: "Entra a Cobros / Links",
        texto: "Aquí generas links de pago. Ya te traje a esta sección.",
      },
      {
        anchor: "cobro-nuevo",
        titulo: "Crea un cobro",
        texto: "Toca “+ Nuevo cobro”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "cobro-nuevo",
        anchor: "cobro-f-concepto",
        titulo: "1) El concepto",
        texto: "Por qué le cobras, ej. “Anticipo pedido #123”.",
      },
      {
        anchor: "cobro-f-monto",
        titulo: "2) El monto",
        texto: "Cuánto va a pagar.",
      },
      {
        anchor: "cobro-f-crear",
        titulo: "3) ¡Genera el link! ✅",
        texto:
          "Toca Crear cobro; se genera un link que le mandas por WhatsApp. Al pagar, te enteras.",
      },
    ],
  },
  {
    id: "crear-promocion",
    nombre: "Crear una promoción",
    descripcion: "Descuentos automáticos para vender más.",
    pasos: [
      {
        seccion: "promociones",
        anchor: "nav-promociones",
        titulo: "Entra a Promociones",
        texto: "Aquí creas ofertas que se aplican solas al cobrar. Ya te traje a esta sección.",
      },
      {
        anchor: "promo-nuevo",
        titulo: "Crea una promo",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "promo-nuevo",
        anchor: "promo-f-nombre",
        titulo: "1) Nómbrala",
        texto: "Un nombre para tu promo, ej. “2x1 fin de semana”.",
      },
      {
        anchor: "promo-f-tipo",
        titulo: "2) El tipo de oferta",
        texto:
          "Elige 2x1, % de descuento o precio especial. Según lo que elijas, aparecen abajo los campos para definir el descuento (cantidades o porcentaje).",
      },
      {
        anchor: "promo-f-crear",
        titulo: "3) ¡Créala! ✅",
        texto:
          "Elige a qué productos aplica y su vigencia, y toca Crear promoción. Se aplica sola al cobrar, en el POS y en línea.",
      },
    ],
  },
  {
    id: "crear-orden-compra",
    nombre: "Levantar una orden de compra",
    descripcion: "Pídele mercancía a tu proveedor.",
    pasos: [
      {
        seccion: "compras",
        anchor: "nav-compras",
        titulo: "Entra a Compras (OC)",
        texto: "Aquí registras lo que le compras a tus proveedores. Ya te traje a esta sección.",
      },
      {
        anchor: "compra-nuevo",
        titulo: "Nueva orden",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "compra-nuevo",
        anchor: "compra-f-rfc",
        titulo: "1) RFC del proveedor",
        texto: "Escribe el RFC de tu proveedor (a quién le compras la mercancía).",
      },
      {
        anchor: "compra-f-proveedor",
        titulo: "2) Razón social",
        texto: "El nombre o razón social del proveedor.",
      },
      {
        anchor: "compra-f-sucursal",
        titulo: "3) Sucursal destino",
        texto: "Elige a qué sucursal llegará la mercancía.",
      },
      {
        anchor: "compra-f-buscar",
        titulo: "4) Agrega los productos",
        texto:
          "Busca cada producto y tócalo para agregarlo; luego escribe su cantidad y su costo de compra.",
      },
      {
        anchor: "compra-f-crear",
        titulo: "5) ¡Crea la orden! ✅",
        texto:
          "Toca Crear orden. Cuando llegue la mercancía, la marcas como recibida y tu inventario sube solo.",
      },
    ],
  },
  {
    id: "crear-automatizacion",
    nombre: "Crear una automatización",
    descripcion: "Mensajes automáticos a tus clientes (WhatsApp, etc.).",
    pasos: [
      {
        seccion: "automatizaciones",
        anchor: "nav-automatizaciones",
        titulo: "Entra a Automatizaciones",
        texto: "Aquí configuras mensajes que se envían solos. Ya te traje a esta sección.",
      },
      {
        anchor: "auto-nuevo",
        titulo: "Crea una",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "auto-nuevo",
        anchor: "auto-f-evento",
        titulo: "1) El disparador",
        texto: "Elige qué la dispara: ej. tras una compra o un carrito abandonado.",
      },
      {
        anchor: "auto-f-campana",
        titulo: "2) El mensaje",
        texto: "Elige la plantilla o campaña que se enviará cuando ocurra el disparador.",
      },
      {
        anchor: "auto-f-crear",
        titulo: "3) ¡Actívala! ✅",
        texto: "Toca crear. A partir de ahí trabaja sola por ti, enviando el mensaje cuando toca.",
      },
    ],
  },
  {
    id: "registrar-cobro-cxc",
    nombre: "Registrar lo que te debe un cliente",
    descripcion: "Anota una venta a crédito para llevar el control de lo que te deben.",
    pasos: [
      {
        seccion: "cxc",
        anchor: "nav-cxc",
        titulo: "Entra a Cuentas por cobrar",
        texto: "Aquí llevas el control de lo que te deben. Ya te traje a esta sección.",
      },
      {
        anchor: "cxc-nuevo",
        titulo: "Registra una cuenta por cobrar",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "cxc-nuevo",
        anchor: "cxc-f-cliente",
        titulo: "1) El cliente",
        texto: "Busca y elige al cliente que te debe.",
      },
      {
        anchor: "cxc-f-monto",
        titulo: "2) El monto",
        texto: "Cuánto te debe en total.",
      },
      {
        anchor: "cxc-f-dias",
        titulo: "3) Días de crédito",
        texto: "En cuántos días vence el pago (ej. 30).",
      },
      {
        anchor: "cxc-f-crear",
        titulo: "4) ¡Regístrala! ✅",
        texto:
          "Toca Crear. Cuando el cliente te pague, registras el abono desde su fila y su saldo baja solo.",
      },
    ],
  },
  {
    id: "activar-huella",
    nombre: "Activar entrar con huella",
    descripcion: "Entra sin contraseña, solo con tu huella o Face ID.",
    pasos: [
      {
        seccion: "seguridad",
        anchor: "nav-seguridad",
        titulo: "Entra a Seguridad",
        texto: "Aquí proteges tu cuenta. Ya te traje a esta sección.",
      },
      {
        anchor: "huella-activar",
        titulo: "Activa tu huella",
        texto: "Toca “Activar huella en este dispositivo”.",
      },
      {
        titulo: "Confirma con tu dedo",
        texto: "Tu teléfono te pedirá tu huella o Face ID; confírmalo.",
      },
      {
        titulo: "¡Listo! ✅",
        texto: "La próxima vez que salgas, entrarás con tu huella sin escribir la contraseña.",
      },
    ],
  },
  {
    id: "agregar-tarjeta",
    nombre: "Guardar tu tarjeta de pago",
    descripcion: "Registra la tarjeta con la que se cobra tu plan.",
    pasos: [
      {
        seccion: "suscripcion",
        anchor: "nav-suscripcion",
        titulo: "Entra a Mi suscripción",
        texto: "Aquí está tu plan y tu método de pago. Ya te traje a esta sección.",
      },
      {
        anchor: "tarjeta-agregar",
        titulo: "Agrega tu tarjeta",
        texto: "Toca “+ Agregar tarjeta”.",
      },
      {
        titulo: "Captura tu tarjeta",
        texto: "Ingresa el número, vencimiento y CVC en el campo seguro de Stripe.",
      },
      { titulo: "¡Guardada! ✅", texto: "Tu plan se cobrará automáticamente con esa tarjeta." },
    ],
  },
  guia(
    "importador",
    "Carga masiva de productos",
    "Sirve para dar de alta MUCHOS productos (o clientes) de un jalón con un archivo de Excel, en vez de uno por uno. Ya te traje aquí.",
    [
      {
        anchor: "imp-descargar",
        titulo: "1) Descarga la plantilla",
        texto:
          "Toca “Descargar plantilla”. Se baja un Excel con las columnas correctas (nombre, precio, código…). Úsalo siempre como base.",
      },
      {
        titulo: "2) Llénala en Excel",
        texto:
          "Abre ese archivo y captura tus productos: un renglón por producto. No cambies los títulos de las columnas ni borres las obligatorias (marcadas con *).",
      },
      {
        anchor: "imp-archivo",
        titulo: "3) Sube tu archivo",
        texto:
          "Toca “Elegir archivo” y selecciona el Excel que llenaste. Verás una vista previa de lo que se va a cargar.",
      },
      {
        anchor: "imp-importar",
        titulo: "4) ¡Impórtalos! ✅",
        texto:
          "Si alguna fila sale en rojo le falta un dato: corrígela en tu Excel y vuelve a subirlo. Cuando estén todas bien, toca “Importar” y se cargan de una vez.",
      },
    ],
  ),
  guia(
    "etiquetas",
    "Etiquetas y códigos de barras",
    "Sirve para imprimir etiquetas con código de barras (escaneable en el POS) y QR para pegar en tus productos. Ya te traje aquí.",
    [
      {
        anchor: "etq-buscar",
        titulo: "1) Busca el producto",
        texto:
          "Escribe el nombre o SKU. En la lista que aparece, toca “Agregar” en cada producto que quieras etiquetar.",
      },
      {
        titulo: "2) Ajusta la cantidad",
        texto:
          "En el panel “A imprimir” (a la derecha) escribe cuántas etiquetas quieres de cada producto.",
      },
      {
        anchor: "etq-tamano",
        titulo: "3) Elige el tamaño",
        texto:
          "Escoge el tamaño de etiqueta según tu hoja o rollo, y marca si quieres incluir el precio o el código QR.",
      },
      {
        anchor: "etq-imprimir",
        titulo: "4) ¡Imprime! ✅",
        texto:
          "Revisa la vista previa de abajo y toca “Imprimir”. Se abre el diálogo de impresión de tu navegador.",
      },
    ],
  ),
  guia(
    "inventario-iq",
    "Inteligencia de inventario",
    "Te dice qué conviene reponer y qué casi no se vende, para no quedarte sin stock ni sobre-comprar. Ya te traje aquí.",
    [
      {
        anchor: "iq-rango",
        titulo: "Elige el periodo a analizar",
        texto:
          "Toca un rango (7, 30, 90 días…). Con eso, abajo verás las sugerencias de reposición y los productos de baja rotación de ese periodo.",
      },
    ],
  ),
  guia(
    "ventas",
    "Ventas",
    "Aquí CONSULTAS el detalle de cada venta (POS, tienda en línea y mayoreo). Para cobrar en mostrador se usa la app de POS, no esta pantalla. Ya te traje aquí.",
    [
      {
        anchor: "ven-filtros",
        titulo: "Filtra y abre una venta",
        texto:
          "Usa estos filtros para acotar por canal y estado. Luego toca cualquier venta de la lista para ver su detalle completo (productos, pagos, cliente).",
      },
    ],
  ),
  guia(
    "monedero",
    "Monedero y gift cards",
    "Administra el saldo de lealtad de tus clientes y las tarjetas de regalo. Ya te traje aquí.",
    [
      {
        anchor: "mon-buscar",
        titulo: "1) Busca al cliente",
        texto: "Escribe su nombre y tócalo en la lista para ver su saldo de monedero.",
      },
      {
        titulo: "2) Abona, cobra o canjea",
        texto:
          "Con el cliente elegido: “Abonar” le suma saldo, “Cobrar” se lo descuenta, y “Canjear gift card” aplica una tarjeta de regalo.",
      },
    ],
  ),
  guia(
    "devoluciones",
    "Devoluciones",
    "Aquí revisas y resuelves las devoluciones que piden tus clientes. Ya te traje aquí.",
    [
      {
        anchor: "dev-filtro",
        titulo: "1) Filtra por estado",
        texto: "Usa este filtro para ver solo las Pendientes, Aprobadas o Rechazadas.",
      },
      {
        titulo: "2) Aprueba o rechaza",
        texto:
          "En cada solicitud pendiente toca “Aprobar” (el producto puede volver a tu inventario) o “Rechazar” (ahí escribes el motivo que verá el cliente).",
      },
    ],
  ),
  guia(
    "reportes",
    "Reportes",
    "Aquí ves cómo va tu negocio: ventas por día, por producto y por vendedor. Ya te traje aquí.",
    [
      {
        anchor: "rep-rango",
        titulo: "1) Elige el periodo",
        texto:
          "Toca un rango (hoy, 7 días, 30 días…). Todos los reportes de abajo se recalculan para ese periodo.",
      },
      {
        anchor: "rep-imprimir",
        titulo: "2) Imprime o guarda PDF",
        texto:
          "Toca “Imprimir / PDF” para llevarte el reporte del periodo en papel o guardarlo como archivo.",
      },
    ],
  ),
  guia(
    "pedidos",
    "Pedidos online",
    "Aquí ves los pedidos que entran por tu tienda web y los vas moviendo de estado. Ya te traje aquí.",
    [
      {
        anchor: "ped-filtro",
        titulo: "1) Filtra por estado",
        texto: "Usa este filtro para ver, por ejemplo, solo los pedidos “Por preparar”.",
      },
      {
        titulo: "2) Abre un pedido y avanza su estado",
        texto:
          "Toca un pedido de la lista para ver su detalle. Ahí cambias su estado (preparando → enviado → entregado); el cliente recibe el aviso.",
      },
    ],
  ),
  guia(
    "envios",
    "Envíos",
    "Aquí defines a qué zonas envías y cuánto cobras; ese costo le aparece solo al cliente al pagar en tu tienda. Ya te traje aquí.",
    [
      {
        anchor: "env-zona-nombre",
        titulo: "1) Nombra la zona",
        texto: "Escribe un nombre para la zona, ej. “Nacional” u “Occidente”.",
      },
      {
        anchor: "env-zona-estados",
        titulo: "2) Estados que cubre",
        texto:
          "Lista los estados separados por coma. Déjalo vacío si esta zona aplica a todo México.",
      },
      {
        anchor: "env-zona-crear",
        titulo: "3) ¡Crea la zona! ✅",
        texto:
          "Toca “Crear zona”. Después, dentro de ella, agregas sus tarifas: costo, “gratis desde $” y días de entrega.",
      },
    ],
  ),
  guia(
    "resenas",
    "Reseñas",
    "Aquí moderas las reseñas de tus clientes; las que apruebas se muestran en tu tienda. Ya te traje aquí.",
    [
      {
        anchor: "res-filtro",
        titulo: "1) Filtra por estado",
        texto: "Usa este filtro para ver las que están Pendientes de moderar.",
      },
      {
        titulo: "2) Aprueba, rechaza o responde",
        texto:
          "En cada reseña: “Aprobar” la publica en tu tienda, “Rechazar” la oculta, y en el recuadro puedes escribirle una respuesta pública al cliente.",
      },
    ],
  ),
  guia(
    "preguntas",
    "Preguntas de productos",
    "Aquí respondes las dudas que dejan tus compradores en la ficha de cada producto. Ya te traje aquí.",
    [
      {
        anchor: "preg-filtro",
        titulo: "1) Filtra las pendientes",
        texto: "Usa este filtro para ver solo las preguntas que aún no respondes.",
      },
      {
        titulo: "2) Responde y publica",
        texto:
          "Escribe tu respuesta en el recuadro y publícala; quedará visible en la ficha del producto para todos los compradores.",
      },
    ],
  ),
  guia(
    "cfdi",
    "Facturación (CFDI)",
    "Aquí conectas tu cuenta de facturación (Facturama) para poder timbrar facturas CFDI 4.0 de tus ventas. Ya te traje aquí.",
    [
      {
        anchor: "cfdi-emisor",
        titulo: "1) Datos de tu negocio",
        texto:
          "Captura tu RFC, razón social, régimen fiscal y código postal, tal como los tienes registrados ante el SAT.",
      },
      {
        anchor: "cfdi-ambiente",
        titulo: "2) Ambiente",
        texto:
          "Empieza en “Sandbox” para probar sin gastar timbres reales. Cámbialo a “Producción” cuando ya te funcione.",
      },
      {
        anchor: "cfdi-apikey",
        titulo: "3) Tu API key de Facturama",
        texto:
          "Pega aquí la llave que te da Facturama (la de pruebas si estás en sandbox). Es lo que conecta tu cuenta.",
      },
      {
        anchor: "cfdi-guardar",
        titulo: "4) ¡Guarda! ✅",
        texto:
          "Toca “Guardar facturación”. A partir de ahí ya puedes generar la factura de tus ventas.",
      },
    ],
  ),
  guia(
    "contabilidad",
    "Contabilidad",
    "Aquí juntas las facturas (CFDI) que RECIBES de tus proveedores y armas tu DIOT, todo listo para tu contador. Ya te traje aquí.",
    [
      {
        anchor: "cont-subir",
        titulo: "1) Sube los XML que recibes",
        texto:
          "Toca “+ Subir XML” y elige el archivo de la factura que te mandó tu proveedor. Se guarda y se categoriza solo.",
      },
      {
        titulo: "2) Genera la DIOT",
        texto:
          "En la pestaña “DIOT”, escribe el periodo (formato AAAAMM, ej. 202607) y toca “Generar” para obtener el archivo que tu contador entrega al SAT.",
      },
    ],
  ),
  guia("configuracion", "Configuración", "Aquí ajustas reglas de tu negocio. Ya te traje aquí.", [
    {
      anchor: "cfg-tope",
      titulo: "1) Tope de descuento manual",
      texto:
        "Escribe el descuento máximo (%) que un cajero normal puede aplicar en una venta. Los roles con permiso especial y el dueño pueden pasarlo.",
    },
    {
      anchor: "cfg-guardar",
      titulo: "2) ¡Guarda! ✅",
      texto: "Toca “Guardar” y la regla aplica de inmediato en el POS.",
    },
  ]),
  guia(
    "tienda",
    "Tienda online",
    "Aquí configuras tu tienda web y eliges qué productos vender en línea. Ya te traje aquí.",
    [
      {
        anchor: "tienda-subdominio",
        titulo: "1) La dirección de tu tienda",
        texto:
          "Escribe tu subdominio, ej. “mi-tienda”. Tu tienda quedará en esa dirección. (Más abajo puedes conectar tu propio dominio si ya tienes uno.)",
      },
      {
        anchor: "tienda-guardar",
        titulo: "2) Guarda la configuración",
        texto: "Toca “Guardar” para dejar viva tu tienda con esa dirección y ajustes.",
      },
      {
        anchor: "tienda-publicar",
        titulo: "3) Publica tus productos",
        texto:
          "En “Publicar productos” (más abajo), busca cada producto y toca “Publicar” para ponerlo a la venta en línea.",
      },
    ],
  ),
  guia(
    "portal-b2b",
    "Portal mayorista",
    "Aquí conectas un dominio propio para que tus clientes de mayoreo hagan pedidos en tu portal con tu marca. Ya te traje aquí.",
    [
      {
        anchor: "b2bdom-host",
        titulo: "1) Escribe tu dominio",
        texto: "Captura el dominio que quieres usar, ej. “pedidos.tu-negocio.com”.",
      },
      {
        anchor: "b2bdom-conectar",
        titulo: "2) Conéctalo",
        texto:
          "Toca “Conectar”. Te mostraremos los registros DNS que debes crear en tu proveedor de dominio para activarlo y verificarlo.",
      },
    ],
  ),
  ...orientacion([
    [
      "dashboard",
      "Resumen",
      "Es un vistazo rápido a tus números de hoy (ventas, tickets, alertas). Para el detalle a fondo entra a Reportes.",
    ],
  ]),
];

/** Recorrido guiado de un apartado: navega a la sección y luego va por sus controles. */
function guia(seccion: string, titulo: string, intro: string, pasos: TourStep[]): TourDef {
  return {
    id: `ver-${seccion}`,
    nombre: titulo,
    descripcion: "Te guío por lo que puedes hacer en este apartado.",
    pasos: [{ seccion, anchor: `nav-${seccion}`, titulo, texto: intro }, ...pasos],
  };
}

/** Genera recorridos de orientación (2 pasos) para apartados de solo consulta. */
function orientacion(items: [string, string, string][]): TourDef[] {
  return items.map(([seccion, titulo, texto]) => ({
    id: `ver-${seccion}`,
    nombre: titulo,
    descripcion: "Un vistazo rápido a este apartado.",
    pasos: [
      {
        seccion,
        anchor: `nav-${seccion}`,
        titulo,
        texto: "Ya te traje a esta sección.",
      },
      { titulo: "¿Qué haces aquí?", texto },
    ],
  }));
}

export function tourPorId(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

function key(prefix: string, id: string): string {
  return `gaes_tour_${prefix}_${id}`;
}

/** El usuario ya vio (completó o cerró) este tour alguna vez. */
export function tourVisto(id: string): boolean {
  return localStorage.getItem(key("seen", id)) === "1";
}

export function marcarTourVisto(id: string): void {
  localStorage.setItem(key("seen", id), "1");
}

/** El usuario pidió no volver a verlo automáticamente. Se respeta siempre. */
export function tourDeshabilitado(id: string): boolean {
  return localStorage.getItem(key("off", id)) === "1";
}

export function deshabilitarTour(id: string): void {
  localStorage.setItem(key("off", id), "1");
}

/** Lanza un tour bajo demanda (siempre, aunque esté deshabilitado el auto). */
export function lanzarTour(id: string): void {
  window.dispatchEvent(new CustomEvent("gaes-tour", { detail: id }));
}
