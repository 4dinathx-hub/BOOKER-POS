import { z } from 'zod';

export const uuid = z.string().uuid();

// ---- Auth ----
export const ownerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const employeeLoginSchema = z.object({
  restaurantId: uuid,
  code: z.string().min(1),
  pin: z.string().min(4).max(8),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
export const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

// ---- Restaurant / Branch ----
export const createBranchSchema = z.object({
  name: z.string().min(1),
  cuisine: z.string().optional(),
  type: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  gstin: z.string().optional(),
  fssai: z.string().optional(),
});
export const updateBranchSchema = createBranchSchema.partial();

// ---- Employees ----
export const employeeRoleEnum = z.enum(['MANAGER', 'CAPTAIN', 'WAITER', 'CASHIER', 'CHEF', 'KITCHEN_STAFF', 'HELPER']);
export const createEmployeeSchema = z.object({
  name: z.string().min(1),
  role: employeeRoleEnum,
  phone: z.string().optional(),
  email: z.string().email().optional(),
  shiftLabel: z.string().optional(),
  code: z.string().min(1),
  pin: z.string().min(4).max(8),
  baseSalary: z.number().nonnegative().default(0),
  payType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('MONTHLY'),
});
export const updateEmployeeSchema = createEmployeeSchema.partial().omit({ pin: true }).extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const rolePermissionSchema = z.object({
  role: employeeRoleEnum,
  permission: z.string().min(1),
  granted: z.boolean(),
});

// ---- Menu / Categories ----
export const createCategorySchema = z.object({ name: z.string().min(1), printerId: uuid.optional() });
export const updateCategorySchema = createCategorySchema.partial().extend({ sortOrder: z.number().int().optional() });
export const createMenuItemSchema = z.object({
  categoryId: uuid,
  name: z.string().min(1),
  emoji: z.string().optional(),
  price: z.number().int().nonnegative(),
  isVeg: z.boolean().default(true),
  taxClassId: uuid.optional(),
  isCombo: z.boolean().optional(),
});
export const updateMenuItemSchema = createMenuItemSchema.partial().extend({
  isAvailable: z.boolean().optional(),
});

// ---- Modifiers ----
export const createModifierGroupSchema = z.object({
  name: z.string().min(1),
  minSelect: z.number().int().nonnegative().default(0),
  maxSelect: z.number().int().positive().default(1),
  isRequired: z.boolean().default(false),
  modifiers: z.array(z.object({ name: z.string().min(1), priceDelta: z.number().int().default(0) })).default([]),
});
export const updateModifierGroupSchema = createModifierGroupSchema.partial();
export const linkModifierGroupSchema = z.object({ menuItemId: uuid, modifierGroupId: uuid });

// ---- Recipes ----
export const upsertRecipeSchema = z.object({
  menuItemId: uuid,
  ingredients: z.array(z.object({
    inventoryItemId: uuid,
    quantityPerUnit: z.number().positive(),
    unit: z.string().min(1),
  })),
});

// ---- Taxes ----
export const createTaxClassSchema = z.object({
  name: z.string().min(1),
  cgstRate: z.number().nonnegative().default(0),
  sgstRate: z.number().nonnegative().default(0),
  igstRate: z.number().nonnegative().default(0),
  hsnCode: z.string().optional(),
  isTaxInclusive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
export const updateTaxClassSchema = createTaxClassSchema.partial();

// ---- POS config ----
export const updatePosConfigSchema = z.object({
  defaultOrderType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).optional(),
  roundingMode: z.enum(['NEAREST', 'UP', 'DOWN', 'NONE']).optional(),
  allowSplitBill: z.boolean().optional(),
  allowPartialPayment: z.boolean().optional(),
  tipEnabled: z.boolean().optional(),
  defaultTipPercent: z.number().min(0).max(100).optional(),
  requireCustomerForBill: z.boolean().optional(),
});

// ---- Tables ----
export const createTableSchema = z.object({ label: z.string().min(1), seats: z.number().int().positive() });
export const updateTableSchema = createTableSchema.partial().extend({
  state: z.enum(['FREE', 'OCCUPIED', 'RESERVED']).optional(),
});

// ---- Orders ----
export const orderItemInputSchema = z.object({
  menuItemId: uuid,
  quantity: z.number().int().positive(),
  modifierChoices: z.array(z.object({ modifierId: uuid, name: z.string(), priceDelta: z.number() })).optional(),
  notes: z.string().optional(),
});
export const createOrderSchema = z.object({
  tableId: uuid.optional(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  channel: z.enum(['IN_HOUSE', 'WEBSITE', 'SWIGGY', 'ZOMATO', 'ONDC', 'WHATSAPP']).default('IN_HOUSE'),
  items: z.array(orderItemInputSchema).min(1),
  customerId: uuid.optional(),
  couponCode: z.string().optional(),
});
export const addOrderItemsSchema = z.object({ items: z.array(orderItemInputSchema).min(1) });
export const updateOrderStatusSchema = z.object({
  status: z.enum(['NEW', 'PREPARING', 'READY', 'SERVED', 'PARTIALLY_PAID', 'BILLED', 'HELD', 'CANCELLED', 'REFUNDED', 'VOIDED']),
  reason: z.string().optional(),
});
export const payOrderSchema = z.object({
  payments: z.array(z.object({ method: z.enum(['CASH', 'CARD', 'UPI', 'OTHER']), amount: z.number().int().positive() })).min(1),
});
export const refundOrderSchema = z.object({ amount: z.number().positive(), reason: z.string().min(1) });

// ---- Inventory / Warehouse ----
export const createInventoryItemSchema = z.object({
  name: z.string().min(1),
  stock: z.number().nonnegative().default(0),
  unit: z.string().min(1),
  reorderLevel: z.number().nonnegative(),
  vendor: z.string().optional(),
  supplierId: uuid.optional(),
  warehouseId: uuid.optional(),
});
export const updateInventoryItemSchema = createInventoryItemSchema.partial();
export const stockAdjustSchema = z.object({
  changeQty: z.number(),
  reason: z.enum(['SALE', 'PURCHASE_RECEIVED', 'MANUAL_CORRECTION', 'WASTAGE', 'TRANSFER']),
  note: z.string().optional(),
});
export const createWarehouseSchema = z.object({ name: z.string().min(1), isDefault: z.boolean().default(false) });

// ---- Suppliers ----
export const createSupplierSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  paymentTerms: z.string().optional(),
});
export const updateSupplierSchema = createSupplierSchema.partial().extend({ isActive: z.boolean().optional() });

// ---- Purchase Orders ----
export const createPurchaseOrderSchema = z.object({
  vendor: z.string().min(1),
  supplierId: uuid.optional(),
  notes: z.string().optional(),
  items: z.array(z.object({ inventoryItemId: uuid, quantity: z.number().positive(), unitCost: z.number().nonnegative().default(0) })).min(1),
});
export const updatePurchaseOrderStatusSchema = z.object({ status: z.enum(['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED']) });

// ---- Customers / Loyalty ----
export const createCustomerSchema = z.object({ name: z.string().min(1), phone: z.string().optional(), email: z.string().email().optional() });
export const updateCustomerSchema = createCustomerSchema.partial();
export const walletTxnSchema = z.object({
  amount: z.number(),
  type: z.enum(['TOPUP', 'REDEEM', 'ADJUST']),
  note: z.string().optional(),
});

// ---- Coupons ----
export const createCouponSchema = z.object({
  code: z.string().min(1),
  description: z.string().optional(),
  discountType: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  discountValue: z.number().positive(),
  expiresAt: z.string().datetime().optional(),
});
export const updateCouponSchema = createCouponSchema.partial().extend({ isActive: z.boolean().optional() });

// ---- QR / Guest ordering ----
export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  phone: z.string().optional(), // used to attach to a Customer record if one matches
});

export const guestOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  guestName: z.string().optional(),
});

// ---- Reservations ----
export const createReservationSchema = z.object({
  guestName: z.string().min(1),
  guestPhone: z.string().optional(),
  partySize: z.number().int().positive(),
  tableId: uuid.optional(),
  reservedFor: z.string().datetime(),
  notes: z.string().optional(),
  isWaitlist: z.boolean().default(false),
});
export const updateReservationSchema = createReservationSchema.partial().extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'SEATED', 'NO_SHOW', 'CANCELLED', 'COMPLETED']).optional(),
});

// ---- Attendance / Leave ----
export const attendanceCheckSchema = z.object({ windowLabel: z.string(), latitude: z.number(), longitude: z.number() });
export const leaveRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  leaveType: z.enum(['SICK', 'VACATION', 'UNPAID', 'OTHER']).default('OTHER'),
  reason: z.string().optional(),
});
export const reviewRequestSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

// ---- Printers ----
export const createPrinterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['KOT', 'BILL']),
  connection: z.string().optional(),
  paperWidth: z.coerce.number().refine((v) => v === 58 || v === 80, 'paperWidth must be 58 or 80').default(80),
});

// ---- Settings ----
export const updateSettingsSchema = z.object({
  gstRate: z.number().int().min(0).max(100).optional(),
  serviceChargeRate: z.number().min(0).max(100).optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  geofenceLat: z.number().optional(),
  geofenceLng: z.number().optional(),
  geofenceRadiusMeters: z.number().int().positive().optional(),
  gstin: z.string().optional(),
  upiVpa: z.string().optional(),
});

// ---- Happy Hour ----
export const createHappyHourRuleSchema = z.object({
  name: z.string().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  discountPercent: z.number().int().min(1).max(100),
  categoryId: z.string().uuid().optional(),
  isEnabled: z.boolean().optional(),
});
export const updateHappyHourRuleSchema = createHappyHourRuleSchema.partial();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

// ---- Finance / Expenses ----
export const expenseCategoryEnum = z.enum([
  'RENT', 'UTILITIES', 'SALARIES', 'MAINTENANCE', 'MARKETING',
  'SUPPLIES', 'LICENSING', 'TRANSPORT', 'MISC',
]);
export const createExpenseSchema = z.object({
  category: expenseCategoryEnum,
  description: z.string().optional(),
  amount: z.number().positive(),
  spentOn: z.coerce.date().optional(),
});
export const updateExpenseSchema = createExpenseSchema.partial();
