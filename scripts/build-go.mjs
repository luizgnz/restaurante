import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

mkdirSync("dist", { recursive: true });
const binary = process.platform === "win32" ? "restaurante-go.exe" : "restaurante-go";
const result = spawnSync("go", ["build", "-o", path.join("dist", binary), "./go/cmd/restaurante"], {
  stdio: "inherit",
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
