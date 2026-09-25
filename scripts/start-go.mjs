import { spawn } from "node:child_process";
import path from "node:path";

const binary = process.platform === "win32" ? "restaurante-go.exe" : "restaurante-go";
const child = spawn(path.resolve("dist", binary), { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
