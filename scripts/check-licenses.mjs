import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Unlicense",
  "BlueOak-1.0.0",
]);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const bad = [];
for (const name of names) {
  const license = JSON.parse(readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).license;
  if (!allowed.has(license)) bad.push(`${name}: ${license}`);
}
if (bad.length) {
  console.error("Licencias no permitidas:\n" + bad.join("\n"));
  process.exit(1);
}
console.log(`ok ${names.length} dependencias directas`);
