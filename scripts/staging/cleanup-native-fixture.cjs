/** Inspect/delete only this workflow's synthetic staging shopper using local Railway auth.
 * node scripts/staging/cleanup-native-fixture.cjs RUN_ID ATTEMPT [--delete]
 * Never put Railway credentials in a workflow or repository.
 */
const { execFileSync } = require("node:child_process");
const [run, attempt, mode] = process.argv.slice(2);
if (!/^\d+$/.test(run ?? "") || !/^\d+$/.test(attempt ?? "") || (mode && mode !== "--delete"))
  throw Error("Expected numeric workflow run and attempt, optionally --delete");
const email = `qa-native-${run}-${attempt}@example.invalid`;
const source = String.raw`
const assert = require('node:assert/strict');
assert(process.env.RAILWAY_ENVIRONMENT_NAME === 'staging', 'Staging only');
const url = new URL(process.env.DATABASE_URL_TENANT || process.env.DATABASE_URL_MASTER);
assert(url.hostname === 'postgres-sywn.railway.internal', 'Unexpected staging database host');
url.searchParams.set('schema', 'tenant_gaesland');
const { PrismaClient } = require('/app/node_modules/@gaespos/db/src/generated/tenant/index.js');
const db = new PrismaClient({datasources:{db:{url:url.href}}});
const email = process.argv[1];
const remove = process.argv[2] === '--delete';
(async()=>{try {
  await db.$transaction(async tx => {
    const rows = await tx.cliente.findMany({where:{emailPrincipal:email},include:{
      _count:{select:{ventas:true,pedidosEcommerce:true,mediosPago:true}},
      direcciones:{select:{codigoPostal:true,calle:true}},
      carritosEcommerce:{select:{items:true}},
    }});
    assert(rows.length <= 1, 'Ambiguous fixture');
    const c = rows[0];
    if (!c) {console.log(JSON.stringify({fixture:'not-created',deleted:false}));return;}
    assert(c.nombre === 'Prueba Android' && !c.isDefault, 'Unexpected fixture identity');
    assert(c.createdAt.getTime() > Date.now() - 6*60*60*1000, 'Fixture is too old');
    assert(Object.values(c._count).every(n => n === 0), 'Fixture has commerce data; stop');
    const report = {fixture:'found',orders:0,cartCount:c.carritosEcommerce.length,
      cartQuantities:c.carritosEcommerce.flatMap(x=>Array.isArray(x.items)?x.items.map(i=>i.cantidad):[]),
      addresses:c.direcciones.length,
      editedAddressWithLeadingZero:c.direcciones.some(d=>d.codigoPostal==='06060' && d.calle==='Calle de prueba editada'),
      deleted:false};
    if(remove){
      await tx.carritoEcommerce.deleteMany({where:{clienteId:c.id}});
      await tx.cliente.delete({where:{id:c.id}});
      report.deleted=true;
    }
    console.log(JSON.stringify(report));
  });
} finally {await db.$disconnect();}})().catch(()=>{console.error('Fixture inspection/cleanup failed a safety guard');process.exitCode=1;});
`;
const output = execFileSync(
  "railway",
  [
    "ssh",
    "--project",
    "267fca4e-67c2-4c3a-9c54-0044f8834c1a",
    "--service",
    "verticals",
    "--environment",
    "staging",
    "--",
    "node",
    "-e",
    source,
    email,
    mode ?? "--inspect",
  ],
  { encoding: "utf8", timeout: 60000 },
);
const line = output.split("\n").find((x) => x.startsWith('{"fixture"'));
if (!line) throw Error("Missing fixture cleanup result");
console.log(line);
