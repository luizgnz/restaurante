import type { PrinterPort } from "./types.ts";

export class MemoryPrinter implements PrinterPort {
  chunks: Uint8Array[] = [];
  fail = false;

  async print(bytes: Uint8Array): Promise<void> {
    if (this.fail) throw new Error("printer down");
    this.chunks.push(bytes);
  }
}
