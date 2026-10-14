/** Staging-only sample catalog. Photos: DummyJSON demo product dataset (cdn.dummyjson.com). */
const { PrismaClient } = require("/app/node_modules/@gaespos/db/src/generated/tenant/index.js");
async function main() {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging")
    throw new Error("Only staging is allowed");
  const url = new URL(process.env.DATABASE_URL_TENANT);
  url.searchParams.set("schema", "tenant_gaesland");
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const suc = await db.sucursal.findFirst();
    if (!suc) throw new Error("Missing branch");
    if (!(await db.configTiendaEcommerce.findFirst()))
      await db.configTiendaEcommerce.create({
        data: {
          subdominio: "gaesland",
          nombre: "Gaesland",
          lema: "Pequeños detalles. Grandes descubrimientos.",
          activa: true,
        },
      });
    // A demo checkout can finish by paying at pickup, without payment API keys.
    await db.configPickupSucursal.upsert({
      where: { sucursalId: suc.id },
      create: { sucursalId: suc.id, activa: true, tiempoPreparacionPromedioMin: 60 },
      update: {},
    });
    const cats = [
      ["hogar", "Hogar y decoración"],
      ["cocina", "Cocina"],
      ["tecnologia", "Tecnología"],
    ];
    for (const [slug, nombre] of cats)
      await db.categoriaPublica.upsert({
        where: { slugSeo: slug },
        create: { id: `design-demo-cat-${slug}`, slugSeo: slug, nombre },
        update: {},
      });
    const items = [
      ["lampara", "Lámpara de mesa", "hogar", 599, "home-decoration/table-lamp"],
      ["licuadora", "Licuadora de cocina", "cocina", 899, "kitchen-accessories/boxed-blender"],
      ["maceta", "Maceta decorativa", "hogar", 249, "home-decoration/plant-pot"],
      [
        "audifonos",
        "Audífonos inalámbricos",
        "tecnologia",
        1299,
        "mobile-accessories/apple-airpods",
      ],
      ["tabla", "Tabla para cocina", "cocina", 199, "kitchen-accessories/chopping-board"],
      [
        "marco",
        "Marco para tus recuerdos",
        "hogar",
        349,
        "home-decoration/family-tree-photo-frame",
      ],
      ["sarten", "Sartén para cocina", "cocina", 449, "kitchen-accessories/pan"],
      ["bocina", "Bocina inteligente", "tecnologia", 1599, "mobile-accessories/amazon-echo-plus"],
      ["planta", "Planta decorativa", "hogar", 299, "home-decoration/house-showpiece-plant"],
      ["wok", "Wok de acero", "cocina", 649, "kitchen-accessories/carbon-steel-wok"],
      [
        "portatil",
        "Computadora portátil",
        "tecnologia",
        14999,
        "laptops/asus-zenbook-pro-dual-screen-laptop",
      ],
      ["utensilio", "Espátula de bambú", "cocina", 89, "kitchen-accessories/bamboo-spatula"],
    ];
    await db.$transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const [slug, nombre, cat, precio, path] = items[i];
        const sku = `DESIGN-DEMO-${slug}`;
        const img = `https://cdn.dummyjson.com/product-images/${path}/thumbnail.webp`;
        const p = await tx.producto.upsert({
          where: { skuPadre: sku },
          update: {},
          create: {
            skuPadre: sku,
            nombre,
            descripcionCorta: "Producto de demostración para probar Gaesland.",
          },
        });
        const v = await tx.productoVariante.upsert({
          where: { sku },
          update: {},
          create: { sku, productoId: p.id, precioBase: precio, isDefault: true, imagenUrl: img },
        });
        await tx.inventarioSucursal.upsert({
          where: { varianteId_sucursalId: { varianteId: v.id, sucursalId: suc.id } },
          update: {},
          create: { varianteId: v.id, sucursalId: suc.id, stockActual: 25 },
        });
        // Exercise option selection and sold-out states using demo data only.
        if (slug === "maceta") {
          await tx.productoVariante.updateMany({
            where: { id: v.id, nombreVariante: null },
            data: { nombreVariante: "Tamaño original" },
          });
          const grande = await tx.productoVariante.upsert({
            where: { sku: `${sku}-grande` },
            update: {},
            create: {
              sku: `${sku}-grande`,
              productoId: p.id,
              nombreVariante: "Tamaño grande",
              precioBase: 349,
              imagenUrl: img,
            },
          });
          await tx.inventarioSucursal.upsert({
            where: { varianteId_sucursalId: { varianteId: grande.id, sucursalId: suc.id } },
            update: {},
            create: { varianteId: grande.id, sucursalId: suc.id, stockActual: 0 },
          });
        }
        await tx.productoPublicado.upsert({
          where: { productoId: p.id },
          update: {},
          create: {
            productoId: p.id,
            categoriaPublicaId: `design-demo-cat-${cat}`,
            tituloPublico: nombre,
            slugSeo: `demo-${slug}`,
            fotosArray: [img],
            descripcionMd:
              "**Producto de demostración.** Sirve para probar la navegación y la compra en staging. No es una oferta comercial.",
            destacadoHome: true,
            rankingScore: 100 - i,
            ...(i % 3 === 0
              ? {
                  precioPromocion: Math.round(precio * 0.85),
                  promocionVigenteHasta: new Date(Date.now() + 30 * 86400000),
                }
              : {}),
          },
        });
      }
    });
    console.log("Staging demo catalog ready:", await db.productoPublicado.count());
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
