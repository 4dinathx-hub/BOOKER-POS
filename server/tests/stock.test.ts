import { describe, it, expect, vi } from 'vitest';
import { deductStockForOrder, restoreStockForOrder } from '../src/lib/stock';

// Builds a minimal fake Prisma client covering everything deductStockForOrder
// and restoreStockForOrder touch (order lookup, inventory read/update,
// stock adjustment + notification creation). Tests the deduction math and
// audit trail without a live DB. `inventoryState` seeds what
// inventoryItem.findUniqueOrThrow returns per item — defaults to a large
// stock/high reorder level so low-stock notification tests can override
// specific items without every other test needing to care about it.
function fakeTx(order: any, inventoryState: Record<string, { name?: string; stock: number; reorderLevel: number; restaurantId?: string }> = {}) {
  const inventoryUpdates: any[] = [];
  const stockAdjustments: any[] = [];
  const notifications: any[] = [];

  return {
    order: { findUniqueOrThrow: vi.fn().mockResolvedValue(order) },
    inventoryItem: {
      findUniqueOrThrow: vi.fn().mockImplementation(async ({ where }: any) => {
        const seeded = inventoryState[where.id];
        return {
          name: seeded?.name ?? 'Test Ingredient',
          stock: seeded?.stock ?? 9999,
          reorderLevel: seeded?.reorderLevel ?? 0,
          restaurantId: seeded?.restaurantId ?? 'restaurant-1',
        };
      }),
      update: vi.fn().mockImplementation(async (args: any) => {
        inventoryUpdates.push(args);
        return args;
      }),
    },
    stockAdjustment: {
      create: vi.fn().mockImplementation(async (args: any) => {
        stockAdjustments.push(args.data);
        return args.data;
      }),
    },
    notification: {
      create: vi.fn().mockImplementation(async (args: any) => {
        notifications.push(args.data);
        return args.data;
      }),
    },
    _inventoryUpdates: inventoryUpdates,
    _stockAdjustments: stockAdjustments,
    _notifications: notifications,
  };
}

describe('deductStockForOrder', () => {
  it('deducts quantityPerUnit * orderItem.quantity for each recipe ingredient', async () => {
    const order = {
      id: 'order-1',
      items: [
        {
          quantity: 3,
          menuItem: {
            recipeItems: [
              { inventoryItemId: 'inv-bun', quantityPerUnit: 2 },
              { inventoryItemId: 'inv-patty', quantityPerUnit: 1 },
            ],
          },
        },
      ],
    };
    const tx = fakeTx(order);

    await deductStockForOrder('order-1', tx as any);

    expect(tx._inventoryUpdates).toEqual([
      { where: { id: 'inv-bun' }, data: { stock: { decrement: 6 } } },
      { where: { id: 'inv-patty' }, data: { stock: { decrement: 3 } } },
    ]);
    expect(tx._stockAdjustments).toHaveLength(2);
    expect(tx._stockAdjustments[0]).toMatchObject({
      inventoryItemId: 'inv-bun',
      changeQty: -6,
      reason: 'SALE',
      refType: 'ORDER',
      refId: 'order-1',
    });
  });

  it('sums deductions across multiple order items sharing an ingredient', async () => {
    const sharedIngredient = { inventoryItemId: 'inv-cheese', quantityPerUnit: 0.5 };
    const order = {
      id: 'order-2',
      items: [
        { quantity: 2, menuItem: { recipeItems: [sharedIngredient] } },
        { quantity: 4, menuItem: { recipeItems: [sharedIngredient] } },
      ],
    };
    const tx = fakeTx(order);

    await deductStockForOrder('order-2', tx as any);

    // Two separate order items → two separate deduction calls (1 and 2 units),
    // not merged into one — each is its own auditable StockAdjustment row.
    expect(tx._inventoryUpdates).toEqual([
      { where: { id: 'inv-cheese' }, data: { stock: { decrement: 1 } } },
      { where: { id: 'inv-cheese' }, data: { stock: { decrement: 2 } } },
    ]);
  });

  it('does nothing for items with no recipe configured', async () => {
    const order = { id: 'order-3', items: [{ quantity: 1, menuItem: { recipeItems: [] } }] };
    const tx = fakeTx(order);

    await deductStockForOrder('order-3', tx as any);

    expect(tx._inventoryUpdates).toHaveLength(0);
    expect(tx._stockAdjustments).toHaveLength(0);
  });
});

describe('deductStockForOrder — low-stock notifications', () => {
  it('fires a LOW_STOCK notification when a deduction crosses from above the reorder level to at/below it', async () => {
    const order = {
      id: 'order-low-1',
      items: [{ quantity: 5, menuItem: { recipeItems: [{ inventoryItemId: 'inv-flour', quantityPerUnit: 1 }] } }],
    };
    // Starts at 12, reorder level 10 — deducting 5 lands at 7, which is at/below 10.
    const tx = fakeTx(order, { 'inv-flour': { name: 'Flour (kg)', stock: 12, reorderLevel: 10, restaurantId: 'rest-1' } });

    await deductStockForOrder('order-low-1', tx as any);

    expect(tx._notifications).toHaveLength(1);
    expect(tx._notifications[0]).toMatchObject({ restaurantId: 'rest-1', type: 'LOW_STOCK', title: 'Flour (kg) is running low' });
  });

  it('does NOT fire a notification if stock stays comfortably above the reorder level', async () => {
    const order = {
      id: 'order-low-2',
      items: [{ quantity: 1, menuItem: { recipeItems: [{ inventoryItemId: 'inv-rice', quantityPerUnit: 1 }] } }],
    };
    const tx = fakeTx(order, { 'inv-rice': { stock: 100, reorderLevel: 10, restaurantId: 'rest-1' } });

    await deductStockForOrder('order-low-2', tx as any);

    expect(tx._notifications).toHaveLength(0);
  });

  it('does NOT re-notify if the item was already at/below the reorder level before this sale — only on the crossing', async () => {
    const order = {
      id: 'order-low-3',
      items: [{ quantity: 1, menuItem: { recipeItems: [{ inventoryItemId: 'inv-cheese', quantityPerUnit: 1 }] } }],
    };
    // Already at 5, reorder level 10 — was already low before this deduction.
    const tx = fakeTx(order, { 'inv-cheese': { stock: 5, reorderLevel: 10, restaurantId: 'rest-1' } });

    await deductStockForOrder('order-low-3', tx as any);

    expect(tx._notifications).toHaveLength(0);
  });
});

describe('restoreStockForOrder — the void-reversal counterpart', () => {
  it('increments stock by exactly the amount deductStockForOrder would have decremented', async () => {
    const order = {
      id: 'order-voided-1',
      items: [{ quantity: 3, menuItem: { recipeItems: [{ inventoryItemId: 'inv-bun', quantityPerUnit: 2 }] } }],
    };
    const tx = fakeTx(order);

    await restoreStockForOrder('order-voided-1', tx as any);

    expect(tx._inventoryUpdates).toEqual([
      { where: { id: 'inv-bun' }, data: { stock: { increment: 6 } } },
    ]);
  });

  it('logs a VOID_REVERSAL adjustment, not a SALE one, so the audit trail distinguishes a void from a normal deduction', async () => {
    const order = {
      id: 'order-voided-2',
      items: [{ quantity: 1, menuItem: { recipeItems: [{ inventoryItemId: 'inv-patty', quantityPerUnit: 1 }] } }],
    };
    const tx = fakeTx(order);

    await restoreStockForOrder('order-voided-2', tx as any);

    expect(tx._stockAdjustments[0]).toMatchObject({
      inventoryItemId: 'inv-patty',
      changeQty: 1, // positive — stock coming back, opposite sign from a deduction
      reason: 'VOID_REVERSAL',
      refType: 'ORDER',
      refId: 'order-voided-2',
    });
  });

  it('restoring is the exact mathematical inverse of deducting for the same order', async () => {
    const order = {
      id: 'order-4',
      items: [{ quantity: 5, menuItem: { recipeItems: [{ inventoryItemId: 'inv-cheese', quantityPerUnit: 0.5 }] } }],
    };

    const deductTx = fakeTx(order);
    await deductStockForOrder('order-4', deductTx as any);
    const totalDeducted = -deductTx._inventoryUpdates[0].data.stock.decrement;

    const restoreTx = fakeTx(order);
    await restoreStockForOrder('order-4', restoreTx as any);
    const totalRestored = restoreTx._inventoryUpdates[0].data.stock.increment;

    expect(totalRestored).toBe(-totalDeducted);
  });
});
