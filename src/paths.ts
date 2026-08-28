import path from "node:path";
import os from "node:os";

export type Env = NodeJS.ProcessEnv;
export type Plat = NodeJS.Platform;

function joinFor(platform: Plat, ...parts: string[]): string {
  return platform === "win32" ? path.win32.join(...parts) : path.posix.join(...parts);
}

export function dataDir(
  env: Env = process.env,
  platform: Plat = process.platform,
  home: string = os.homedir(),
): string {
  if (env.RESTAURANTE_DATA_DIR) return env.RESTAURANTE_DATA_DIR;
  if (platform === "win32") {
    const root = env.PROGRAMDATA ?? "C:\\ProgramData";
    return joinFor("win32", root, "Restaurante");
  }
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "Application Support", "Restaurante");
  }
  const xdg = env.XDG_DATA_HOME ?? path.posix.join(home, ".local", "share");
  return path.posix.join(xdg, "restaurante");
}

export function programDir(env: Env = process.env, platform: Plat = process.platform): string {
  if (env.RESTAURANTE_PROGRAM_DIR) return env.RESTAURANTE_PROGRAM_DIR;
  if (platform === "win32") {
    const root = env.PROGRAMFILES ?? "C:\\Program Files";
    return joinFor("win32", root, "Restaurante");
  }
  return "/usr/local/restaurante";
}

export function salonDbPath(env: Env = process.env, platform: Plat = process.platform): string {
  return joinFor(platform, dataDir(env, platform), "data", "salon.sqlite");
}
