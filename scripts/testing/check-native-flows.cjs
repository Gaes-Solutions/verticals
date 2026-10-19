/** Catch malformed Maestro ${...} expressions before spending an emulator run. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const roots = ["apps/mobile-cliente/.maestro", "apps/mobile-kiosko/.maestro"].map((folder) =>
  path.resolve(folder),
);
const files = process.argv.slice(2);
if (!files.length)
  files.push(
    ...roots.flatMap((root) =>
      fs
        .readdirSync(root)
        .filter((x) => x.endsWith(".yml"))
        .map((x) => path.join(root, x)),
    ),
  );
let count = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  // Maestro expands at the first closing brace. Even valid JS containing a
  // regex quantifier like {4} gets truncated; validate the same expression.
  const expressions = [...source.matchAll(/\$\{([\s\S]*?)\}/g)];
  if (expressions.length !== (source.match(/\$\{/g) ?? []).length)
    throw Error(`Unclosed Maestro expression in ${file}`);
  for (const [_, expression] of expressions) {
    try {
      new vm.Script(`(${expression})`);
    } catch {
      throw Error(`Invalid embedded Maestro expression in ${file}`);
    }
    count++;
  }
}
console.log(`PASS ${count} Maestro expressions in ${files.length} flows (syntax only)`);
