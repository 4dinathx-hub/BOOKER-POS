import { prisma } from './prisma';
import { createNotification } from './notifications';

// The P0 gap fix: when an order is billed, walk every OrderItem's
// RecipeIngredient rows and deduct inventory accordingly, writing a
// StockAdjustment row for each deduction so it's auditable. Called from
// routes/orders.ts when an order transitions into BILLED status.
//
// Runs inside the same Prisma transaction as the order status update where
// possible, so a failed deduction rolls back the bill transition too —
// stock accuracy is treated as a hard requirement, not best-effort.
export async function deductStockForOrder(orderId: string, tx: typeof prisma = prisma) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { menuItem: { include: { recipeItems: true } } } } },
  });

  for (const orderItem of order.items) {
    for (const ingredient of orderItem.menuItem.recipeItems) {
      const totalDeduction = Number(ingredient.quantityPerUnit) * orderItem.quantity;

      // Read before the decrement so a low-stock alert only fires on the
      // transition (was above the reorder level, now at/below it) rather
      // than re-notifying on every single sale while it stays low — that
      // would just train staff to ignore the notification panel.
      const before = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: ingredient.inventoryItemId },
        select: { name: true, stock: true, reorderLevel: true, restaurantId: true },
      });

      await tx.inventoryItem.update({
        where: { id: ingredient.inventoryItemId },
        data: { stock: { decrement: totalDeduction } },
      });

      const stockAfter = Number(before.stock) - totalDeduction;
      const reorderLevel = Number(before.reorderLevel);
      const wasAboveThreshold = Number(before.stock) > reorderLevel;
      if (wasAboveThreshold && stockAfter <= reorderLevel) {
        await createNotification({
          restaurantId: before.restaurantId,
          type: 'LOW_STOCK',
          title: `${before.name} is running low`,
          body: `Stock is now ${stockAfter} — at or below the reorder level of ${reorderLevel}.`,
        }, tx);
      }

      await tx.stockAdjustment.create({
        data: {
          inventoryItemId: ingredient.inventoryItemId,
          changeQty: -totalDeduction,
          reason: 'SALE',
          refType: 'ORDER',
          refId: orderId,
          note: `Auto-deducted for ${orderItem.quantity}x order item`,
        },
      });
    }
  }
}

// The other half of the gap: voiding a BILLED order used to leave the
// deducted stock gone forever, even though the food (presumably) was never
// served — every void silently drifted the inventory count further from
// reality. Reverses deductStockForOrder exactly: same recipe quantities,
// added back instead of subtracted, logged as its own StockAdjustment
// (not a deleted/edited copy of the original — the sale still happened in
// the audit trail, this is a separate corrective entry pointing at it).
export async function restoreStockForOrder(orderId: string, tx: typeof prisma = prisma) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { menuItem: { include: { recipeItems: true } } } } },
  });

  for (const orderItem of order.items) {
    for (const ingredient of orderItem.menuItem.recipeItems) {
      const totalRestore = Number(ingredient.quantityPerUnit) * orderItem.quantity;

      await tx.inventoryItem.update({
        where: { id: ingredient.inventoryItemId },
        data: { stock: { increment: totalRestore } },
      });

      await tx.stockAdjustment.create({
        data: {
          inventoryItemId: ingredient.inventoryItemId,
          changeQty: totalRestore,
          reason: 'VOID_REVERSAL',
          refType: 'ORDER',
          refId: orderId,
          note: `Restored for ${orderItem.quantity}x order item — order voided`,
        },
      });
    }
  }
}
