import { getTenantClient } from "./tenant-client.js";

/**
 * Llena Globoland (vertical retail) con miles de productos + imágenes,
 * inventario y publicación a la tienda en línea, para probar el happy-path.
 * Idempotente por prefijo de SKU "GLB-": borra lo anterior y re-siembra.
 */
const SLUG = "globoland";
const TOTAL = Number(process.env.GLB_TOTAL ?? 3000);
const BATCH = 500;
const IMG = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

const CATS = [
  "Electrónica",
  "Hogar y Cocina",
  "Ropa y Moda",
  "Juguetes",
  "Herramientas",
  "Papelería",
  "Deportes",
  "Belleza y Cuidado",
  "Mascotas",
  "Abarrotes",
  "Telefonía",
  "Cómputo",
  "Jardín",
  "Automotriz",
  "Bebés",
  "Salud",
  "Libros",
  "Música",
  "Ferretería",
  "Limpieza",
];
const MARCAS = [
  "Sony",
  "Samsung",
  "LG",
  "HP",
  "Dell",
  "Nike",
  "Adidas",
  "Bosch",
  "Truper",
  "Stanley",
  "Nestlé",
  "Bimbo",
  "Genérica",
  "Logitech",
  "Acer",
  "Pelikan",
  "BIC",
  "Hot Wheels",
  "Lego",
  "Whirlpool",
];
const ADJ = ["Pro", "Max", "Plus", "Eco", "Premium", "Clásico", "Compacto", "XL", "Lite", "2024"];
const NOUNS: Record<string, string[]> = {
  default: ["Artículo", "Producto", "Kit", "Set", "Paquete"],
  Electrónica: ["Audífonos", "Bocina", "Cargador", "Cable HDMI", "Power Bank", "Smartwatch"],
  "Hogar y Cocina": ["Sartén", "Olla", "Licuadora", "Juego de Vasos", "Cafetera", "Tabla"],
  "Ropa y Moda": ["Playera", "Pantalón", "Sudadera", "Gorra", "Calcetines", "Chamarra"],
  Juguetes: ["Carrito", "Muñeca", "Rompecabezas", "Peluche", "Bloques", "Pelota"],
  Herramientas: ["Taladro", "Martillo", "Desarmador", "Llave", "Pinzas", "Cinta métrica"],
  Papelería: ["Cuaderno", "Pluma", "Marcadores", "Mochila", "Tijeras", "Pegamento"],
  Deportes: ["Balón", "Pesas", "Tapete", "Bicicleta", "Guantes", "Cuerda"],
  Telefonía: ["Funda", "Mica", "Cargador", "Cable USB-C", "Soporte", "Auricular"],
  Cómputo: ["Mouse", "Teclado", "Monitor", "Memoria USB", "Webcam", "Disco SSD"],
};

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length] as T;
}
function pad(n: number): string {
  return String(n).padStart(6, "0");
}

async function main() {
  const c = getTenantClient(SLUG);
  const sucursal = await c.sucursal.findFirst({ select: { id: true } });
  if (!sucursal) throw new Error("Globoland no tiene sucursal");
  const sucursalId = sucursal.id;

  console.info("[glb] limpiando datos demo previos (SKU GLB-*)…");
  const previos = await c.producto.findMany({
    where: { skuPadre: { startsWith: "GLB-" } },
    select: { id: true },
  });
  const prevIds = previos.map((p) => p.id);
  if (prevIds.length) {
    const vars = await c.productoVariante.findMany({
      where: { productoId: { in: prevIds } },
      select: { id: true },
    });
    const varIds = vars.map((v) => v.id);
    await c.inventarioSucursal.deleteMany({ where: { varianteId: { in: varIds } } });
    await c.productoPublicado.deleteMany({ where: { productoId: { in: prevIds } } });
    await c.productoImagen.deleteMany({ where: { productoId: { in: prevIds } } });
    await c.productoVariante.deleteMany({ where: { productoId: { in: prevIds } } });
    await c.producto.deleteMany({ where: { id: { in: prevIds } } });
  }

  console.info("[glb] categorías y marcas…");
  const catIds: string[] = [];
  for (let i = 0; i < CATS.length; i++) {
    const nombre = CATS[i] as string;
    const id = `glb-cat-${i}`;
    const slug = `glb-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await c.categoria.upsert({
      where: { slug },
      update: { nombre },
      create: { id, nombre, slug, orden: i, imagenUrl: IMG(`cat${i}`) },
    });
    await c.categoriaPublica.upsert({
      where: { id },
      update: { nombre },
      create: { id, nombre, slugSeo: slug, orden: i, imagenUrl: IMG(`cat${i}`) },
    });
    catIds.push(id);
  }
  const marcaIds: string[] = [];
  for (let i = 0; i < MARCAS.length; i++) {
    const nombre = MARCAS[i] as string;
    const id = `glb-marca-${i}`;
    const slug = `glb-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await c.marca.upsert({
      where: { slug },
      update: { nombre },
      create: { id, nombre, slug, logoUrl: IMG(`marca${i}`) },
    });
    marcaIds.push(id);
  }

  console.info(`[glb] generando ${TOTAL} productos en lotes de ${BATCH}…`);
  let creados = 0;
  for (let start = 0; start < TOTAL; start += BATCH) {
    const end = Math.min(start + BATCH, TOTAL);
    const productos = [];
    const variantes = [];
    const imagenes = [];
    const inventario = [];
    const publicados = [];
    for (let i = start; i < end; i++) {
      const catName = pick(CATS, i);
      const nouns = NOUNS[catName] ?? NOUNS.default;
      const noun = pick(nouns as string[], i);
      const marca = pick(MARCAS, i);
      const adj = pick(ADJ, i);
      const nombre = `${noun} ${marca} ${adj} ${i + 1}`;
      const pid = `glb-p-${pad(i)}`;
      const vid = `glb-v-${pad(i)}`;
      const sku = `GLB-${pad(i)}`;
      const slugSeo = `${noun.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${marca.toLowerCase()}-${i + 1}`;
      const precio = 49 + ((i * 37) % 4950); // 49 .. ~4999
      const img1 = IMG(`glb${i}`);
      const img2 = IMG(`glb${i}b`);
      // ~20% en oferta, ~10% destacado, ~8% sin stock (para probar "avísame")
      const enOferta = i % 5 === 0;
      const destacado = i % 10 === 0;
      const sinStock = i % 13 === 0;
      const stock = sinStock ? 0 : 5 + ((i * 7) % 250);

      productos.push({
        id: pid,
        skuPadre: sku,
        nombre,
        descripcionCorta: `${noun} marca ${marca} — modelo ${adj}.`,
        descripcionLarga: `${nombre}. Producto de demostración para pruebas del catálogo de Globoland. Categoría: ${catName}.`,
        categoriaId: `glb-cat-${i % CATS.length}`,
        marcaId: `glb-marca-${i % MARCAS.length}`,
        isActive: true,
        isVisiblePublico: true,
      });
      variantes.push({
        id: vid,
        productoId: pid,
        sku,
        precioBase: precio,
        costoPromedio: Math.round(precio * 0.6),
        isDefault: true,
        isActive: true,
        imagenUrl: img1,
      });
      imagenes.push({ productoId: pid, varianteId: vid, cdnUrl: img1, orden: 0, altText: nombre });
      inventario.push({ varianteId: vid, sucursalId, stockActual: stock });
      publicados.push({
        productoId: pid,
        categoriaPublicaId: `glb-cat-${i % CATS.length}`,
        tituloPublico: nombre,
        slugSeo,
        descripcionCortaMd: `${noun} ${marca} ${adj}`,
        fotosArray: [img1, img2],
        ...(enOferta
          ? {
              precioPromocion: Math.round(precio * 0.7),
              promocionVigenteHasta: new Date(Date.now() + 30 * 86400000),
            }
          : {}),
        destacadoHome: destacado,
        rankingScore: (i * 13) % 1000,
        isPublicado: true,
      });
    }
    await c.producto.createMany({ data: productos });
    await c.productoVariante.createMany({ data: variantes });
    await c.productoImagen.createMany({ data: imagenes });
    await c.inventarioSucursal.createMany({ data: inventario });
    await c.productoPublicado.createMany({ data: publicados });
    creados += productos.length;
    console.info(`[glb] ${creados}/${TOTAL}`);
  }

  const totalPub = await c.productoPublicado.count({ where: { isPublicado: true } });
  console.info(`[glb] LISTO. productos publicados=${totalPub}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[glb] ERROR", e);
    process.exit(1);
  });
