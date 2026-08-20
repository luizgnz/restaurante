export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as T & { error?: string; codigo?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { codigo: data.codigo });
  return data;
}
