import type Database from "better-sqlite3";
import { renderAnulacion, renderComanda, renderCorreccion, renderPrecuenta } from "./escpos.ts";
import type { PrintJobKind, PrinterPort, TicketComanda, TicketCorreccion, TicketPrecuenta } from "./types.ts";

export function encolarJob(
  db: Database.Database,
  kind: PrintJobKind,
  payload: TicketComanda | TicketPrecuenta | TicketCorreccion,
): number {
  const info = db
    .prepare(
      "INSERT INTO print_jobs (kind, payload, status, attempts, created_en) VALUES (?, ?, 'queued', 0, ?)",
    )
    .run(kind, JSON.stringify(payload), new Date().toISOString());
  return Number(info.lastInsertRowid);
}

function bytesDeJob(kind: string, payload: string): Uint8Array {
  const data = JSON.parse(payload) as TicketComanda & TicketPrecuenta & TicketCorreccion;
  if (kind === "comanda") return renderComanda(data);
  if (kind === "precuenta") return renderPrecuenta(data);
  if (kind === "correccion") return renderCorreccion(data);
  return renderAnulacion(data);
}

export async function despacharJobs(db: Database.Database, printer: PrinterPort): Promise<void> {
  const jobs = db
    .prepare("SELECT id, kind, payload, attempts FROM print_jobs WHERE status IN ('queued', 'failed')")
    .all() as { id: number; kind: string; payload: string; attempts: number }[];
  for (const job of jobs) {
    try {
      await printer.print(bytesDeJob(job.kind, job.payload));
      db.prepare("UPDATE print_jobs SET status = 'sent', attempts = attempts + 1, last_error = NULL WHERE id = ?").run(
        job.id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE print_jobs SET status = 'queued', attempts = attempts + 1, last_error = ? WHERE id = ?").run(
        message,
        job.id,
      );
    }
  }
}
