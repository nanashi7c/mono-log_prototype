import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  bigint,
  varchar,
  integer,
  smallint,
  numeric,
  boolean,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// 各テーブルで使う created_at / updated_at を都度新しいビルダーとして生成する
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// item の状態（SQL の item_status enum に対応）
export const itemStatus = pgEnum("item_status", ["planned", "owned", "listed", "sold"]);

// users: Cognito の sub を id とするユーザ本体
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  ...timestamps(),
});

// categories: プリセット + ユーザ作成
export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#94a3b8"),
  isPreset: boolean("is_preset").notNull().default(false),
  ...timestamps(),
});

// items: 物品本体（全カラム）
export const items = pgTable("items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: itemStatus("status").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  imageUrl: text("image_url"),
  janCode: varchar("jan_code", { length: 13 }),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  actualPrice: integer("actual_price"),
  purchasedAt: date("purchased_at"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps(),
});

// items_categories: M:N 中間表
export const itemsCategories = pgTable(
  "items_categories",
  {
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.categoryId] })],
);

// plans: 購入予定の付随情報（items と 1:1）
export const plans = pgTable("plans", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  itemId: bigint("item_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  plannedPurchaseYear: smallint("planned_purchase_year"),
  plannedPurchaseMonth: smallint("planned_purchase_month"),
  listPrice: numeric("list_price", { mode: "number" }),
  purchasePrice: numeric("purchase_price", { mode: "number" }),
  productUrl: text("product_url"),
  dealPeriod: varchar("deal_period", { length: 255 }),
  ...timestamps(),
});

// platforms（マスタ）
export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  feeRate: numeric("fee_rate", { mode: "number" }).notNull(),
  ...timestamps(),
});

// services（マスタ）
export const services = pgTable("services", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shippingService: text("shipping_service").notNull().unique(),
  ...timestamps(),
});

// sizes（マスタ）
export const sizes = pgTable("sizes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shippingSize: text("shipping_size").notNull().unique(),
  ...timestamps(),
});

// shipping: サービス×サイズの組合せ
export const shipping = pgTable("shipping", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  shippingServiceId: integer("shipping_service_id")
    .notNull()
    .references(() => services.id),
  shippingSizeId: integer("shipping_size_id")
    .notNull()
    .references(() => sizes.id),
  ...timestamps(),
});

// shipping_fees: サービス×サイズの送料
export const shippingFees = pgTable("shipping_fees", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  shippingServiceId: integer("shipping_service_id")
    .notNull()
    .references(() => services.id),
  shippingSizeId: integer("shipping_size_id")
    .notNull()
    .references(() => sizes.id),
  fee: numeric("fee", { mode: "number" }).notNull(),
  ...timestamps(),
});

// listings: 出品情報＋利益計算結果（items と 1:1）
export const listings = pgTable("listings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  itemId: bigint("item_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  shippingId: bigint("shipping_id", { mode: "number" }).references(() => shipping.id),
  platformId: integer("platform_id").references(() => platforms.id),
  quantity: integer("quantity"),
  sellingPrice: numeric("selling_price", { mode: "number" }),
  packagingCost: numeric("packaging_cost", { mode: "number" }),
  workTimeHours: numeric("work_time_hours", { mode: "number" }),
  laborRate: numeric("labor_rate", { mode: "number" }),
  sellingFee: numeric("selling_fee", { mode: "number" }),
  workTimeCost: numeric("work_time_cost", { mode: "number" }),
  operatingBenefit: numeric("operating_benefit", { mode: "number" }),
  ordinaryProfit: numeric("ordinary_profit", { mode: "number" }),
  isListing: boolean("is_listing"),
  ...timestamps(),
});
