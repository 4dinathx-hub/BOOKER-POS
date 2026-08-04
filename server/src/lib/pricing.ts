export interface PricingInput {
  quantity: number;
  basePrice: number; // menu item price, already happy-hour-adjusted if applicable
  modifierChoices?: { priceDelta?: number }[];
  cgstRate: number; // percent, e.g. 2.5
  sgstRate: number; // percent, e.g. 2.5
  isTaxInclusive: boolean;
}

export interface PricedLine {
  priceEach: number;
  lineTotal: number;
  lineTax: number;
  linePayable: number;
}

// Computes one line's tax math. Pulled out of orders.ts as a pure function
// (no DB, no Express) specifically so it can be unit tested directly —
// this is real money math and deserves tests that don't need a live
// database to run.
export function priceLine(input: PricingInput): PricedLine {
  const modifierTotal = (input.modifierChoices ?? []).reduce((sum, m) => sum + (m.priceDelta ?? 0), 0);
  const priceEach = input.basePrice + modifierTotal;
  const lineTotal = priceEach * input.quantity;

  const rate = (input.cgstRate + input.sgstRate) / 100;
  // Inclusive: tax is already inside lineTotal, so the line is payable as-is,
  // and the tax portion is backed out for reporting. Exclusive: tax is
  // added on top of lineTotal to get what's actually payable.
  const lineTax = input.isTaxInclusive ? lineTotal - lineTotal / (1 + rate) : lineTotal * rate;
  const linePayable = input.isTaxInclusive ? lineTotal : lineTotal + lineTax;

  return { priceEach, lineTotal, lineTax, linePayable };
}
