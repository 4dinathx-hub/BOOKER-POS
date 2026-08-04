// Minimal ESC/POS command builder — no external dependency needed for the
// commands we use (init, bold, align, cut, line feed, text). Produces a
// byte Buffer that a local print-agent (or a browser via WebUSB/WebSerial,
// or a network-connected printer's raw TCP port 9100) can send directly
// to a thermal printer. This is the piece that was entirely missing
// before — PrinterConfig only stored metadata with "no live driver".
const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private chunks: Buffer[] = [];

  init() { this.chunks.push(Buffer.from([ESC, 0x40])); return this; }
  bold(on: boolean) { this.chunks.push(Buffer.from([ESC, 0x45, on ? 1 : 0])); return this; }
  align(mode: 'left' | 'center' | 'right') {
    const code = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    this.chunks.push(Buffer.from([ESC, 0x61, code]));
    return this;
  }
  doubleHeight(on: boolean) { this.chunks.push(Buffer.from([GS, 0x21, on ? 0x11 : 0x00])); return this; }
  text(str: string) { this.chunks.push(Buffer.from(str, 'ascii')); return this; }
  newline(n = 1) { this.chunks.push(Buffer.from('\n'.repeat(n), 'ascii')); return this; }
  divider(width: 32 | 48 = 48) { this.chunks.push(Buffer.from('-'.repeat(width) + '\n', 'ascii')); return this; }
  cut() { this.chunks.push(Buffer.from([GS, 0x56, 0x00])); return this; }

  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
  toBase64(): string {
    return this.build().toString('base64');
  }
}

interface KotLine { name: string; quantity: number; notes?: string; modifierNames?: string[]; comboComponents?: string[]; }
interface BillLine { name: string; quantity: number; priceEach: number; }

export function buildKot(opts: { orderLabel: string; tableLabel?: string; items: KotLine[]; paperWidth: 58 | 80 }) {
  const width = opts.paperWidth === 58 ? 32 : 48;
  const b = new EscPosBuilder().init().align('center').bold(true).doubleHeight(true)
    .text('KOT').newline().doubleHeight(false).bold(false)
    .text(opts.orderLabel).newline();
  if (opts.tableLabel) b.text(`Table: ${opts.tableLabel}`).newline();
  b.align('left').divider(width);
  for (const item of opts.items) {
    b.bold(true).text(`${item.quantity}x  ${item.name}`).bold(false).newline();
    if (item.comboComponents?.length) b.text(`   (${item.comboComponents.join(', ')})`).newline();
    if (item.modifierNames?.length) b.text(`   + ${item.modifierNames.join(', ')}`).newline();
    if (item.notes) b.text(`   note: ${item.notes}`).newline();
  }
  b.divider(width).newline(2).cut();
  return b;
}

export function buildBill(opts: {
  restaurantName: string; orderLabel: string; items: BillLine[];
  subtotal: number; tax: number; discount: number; total: number; paperWidth: 58 | 80;
}) {
  const width = opts.paperWidth === 58 ? 32 : 48;
  const b = new EscPosBuilder().init().align('center').bold(true)
    .text(opts.restaurantName).bold(false).newline()
    .text(opts.orderLabel).newline().align('left').divider(width);
  for (const item of opts.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = (item.priceEach * item.quantity).toFixed(2);
    b.text(line.padEnd(width - price.length) + price).newline();
  }
  b.divider(width)
    .text(`Subtotal:`.padEnd(width - 10) + opts.subtotal.toFixed(2).padStart(10)).newline()
    .text(`Discount:`.padEnd(width - 10) + opts.discount.toFixed(2).padStart(10)).newline()
    .text(`Tax:`.padEnd(width - 10) + opts.tax.toFixed(2).padStart(10)).newline()
    .bold(true)
    .text(`Total:`.padEnd(width - 10) + opts.total.toFixed(2).padStart(10)).bold(false).newline()
    .divider(width).align('center').text('Thank you!').newline(3).cut();
  return b;
}
