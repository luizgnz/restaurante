import type Database from "better-sqlite3";

export function crearComanda(
  db: Database.Database,
  input: { pedidoId: number; envioN: number; meseroId: number; lineaIds: number[] },
): number {
  const info = db
    .prepare("INSERT INTO comandas (pedido_id, envio_n, mesero_id, creada_en) VALUES (?, ?, ?, ?)")
    .run(input.pedidoId, input.envioN, input.meseroId, new Date().toISOString());
  const comandaId = Number(info.lastInsertRowid);
  const insertLinea = db.prepare(
    "INSERT INTO comanda_lineas (comanda_id, pedido_linea_id, etapa) VALUES (?, ?, 'por_preparar')",
  );
  for (const lineaId of input.lineaIds) {
    insertLinea.run(comandaId, lineaId);
  }
  return comandaId;
}

export function avanzarEtapa(db: Database.Database, comandaLineaId: number, etapa: string): void {
  db.prepare("UPDATE comanda_lineas SET etapa = ? WHERE id = ?").run(etapa, comandaLineaId);
}
