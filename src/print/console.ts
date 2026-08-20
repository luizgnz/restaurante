import type { PrinterPort } from "./types.ts";

export class ConsolePrinter implements PrinterPort {
  async print(bytes: Uint8Array): Promise<void> {
    console.log(new TextDecoder().decode(bytes));
  }
}
