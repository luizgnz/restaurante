export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("No se pudo conectar con el sistema. La información se actualizará cuando vuelva la conexión.");
  }

  const data = (await res.json()) as T & { error?: string; codigo?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { codigo: data.codigo });
  return data;
}

export function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
