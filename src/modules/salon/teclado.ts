export type AccionTeclado =
  | { tipo: "nada" }
  | { tipo: "nueva_orden" }
  | { tipo: "ordenes" }
  | { tipo: "mesas" }
  | { tipo: "buscar_mesa" }
  | { tipo: "digito"; buffer: string }
  | { tipo: "abrir_mesa"; numero: number; buffer: string }
  | { tipo: "cancelar"; buffer: string };

export function interpretarTecla(opts: {
  key: string;
  buffer: string;
  buscando: boolean;
  inputActivo: boolean;
}): AccionTeclado {
  const { key, buffer, buscando, inputActivo } = opts;
  if (inputActivo && !buscando) return { tipo: "nada" };
  if (inputActivo && buscando && /^\d$/.test(key)) return { tipo: "nada" };
  if (inputActivo && buscando && key === "Backspace") return { tipo: "nada" };

  if (key === "Escape") return { tipo: "cancelar", buffer: "" };
  if (key === "#" || key === "Dead") return { tipo: "buscar_mesa" };
  if (/^\d$/.test(key)) return { tipo: "digito", buffer: `${buffer}${key}` };
  if (key === "Backspace" && buffer) return { tipo: "digito", buffer: buffer.slice(0, -1) };
  if (key === "Enter" && buffer) return { tipo: "abrir_mesa", numero: Number(buffer), buffer: "" };

  if (buscando) return { tipo: "nada" };

  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "n") return { tipo: "nueva_orden" };
  if (k === "o") return { tipo: "ordenes" };
  if (k === "m") return { tipo: "mesas" };
  return { tipo: "nada" };
}
