import { describe, it, expect } from 'vitest';
import { priceLine } from '../src/lib/pricing';

describe('priceLine — tax-inclusive pricing', () => {
  it('backs out tax from a tax-inclusive price rather than adding it on top', () => {
    // ₹105 inclusive of 5% total GST → true pre-tax value is 100, tax is 5
    const result = priceLine({ quantity: 1, basePrice: 105, cgstRate: 2.5, sgstRate: 2.5, isTaxInclusive: true });
    expect(result.lineTotal).toBe(105);
    expect(result.linePayable).toBe(105); // inclusive: customer pays exactly the sticker price
    expect(result.lineTax).toBeCloseTo(5, 5);
  });

  it('scales correctly with quantity', () => {
    const result = priceLine({ quantity: 3, basePrice: 105, cgstRate: 2.5, sgstRate: 2.5, isTaxInclusive: true });
    expect(result.lineTotal).toBe(315);
    expect(result.linePayable).toBe(315);
    expect(result.lineTax).toBeCloseTo(15, 5);
  });
});

describe('priceLine — tax-exclusive pricing', () => {
  it('adds tax on top of the sticker price', () => {
    // ₹100 exclusive of 18% GST → payable is 118, tax is 18
    const result = priceLine({ quantity: 1, basePrice: 100, cgstRate: 9, sgstRate: 9, isTaxInclusive: false });
    expect(result.lineTotal).toBe(100);
    expect(result.lineTax).toBeCloseTo(18, 5);
    expect(result.linePayable).toBeCloseTo(118, 5);
  });
});

describe('priceLine — modifiers', () => {
  it('adds modifier price deltas before computing tax, not after', () => {
    // Base ₹200 + ₹50 modifier = ₹250 per unit, tax computed on the full 250
    const result = priceLine({
      quantity: 2, basePrice: 200, modifierChoices: [{ priceDelta: 50 }],
      cgstRate: 2.5, sgstRate: 2.5, isTaxInclusive: false,
    });
    expect(result.priceEach).toBe(250);
    expect(result.lineTotal).toBe(500);
    expect(result.lineTax).toBeCloseTo(25, 5); // 5% of 500
  });

  it('sums multiple modifiers on the same line', () => {
    const result = priceLine({
      quantity: 1, basePrice: 100, modifierChoices: [{ priceDelta: 20 }, { priceDelta: 10 }],
      cgstRate: 0, sgstRate: 0, isTaxInclusive: false,
    });
    expect(result.priceEach).toBe(130);
  });

  it('treats a missing priceDelta as zero rather than NaN', () => {
    const result = priceLine({ quantity: 1, basePrice: 100, modifierChoices: [{}], cgstRate: 0, sgstRate: 0, isTaxInclusive: false });
    expect(result.priceEach).toBe(100);
  });
});

describe('priceLine — zero tax edge case', () => {
  it('handles a 0% tax rate without dividing by zero or distorting the total', () => {
    const result = priceLine({ quantity: 1, basePrice: 100, cgstRate: 0, sgstRate: 0, isTaxInclusive: true });
    expect(result.lineTax).toBe(0);
    expect(result.linePayable).toBe(100);
  });
});
