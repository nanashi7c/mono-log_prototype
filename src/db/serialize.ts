// Drizzle のクエリ結果（camelCase・timestamp は Date）を、
// 既存 UI が前提とする types/item.ts の形（snake_case・文字列日時）へ変換する層。
// これにより UI コンポーネント／型を一切変更せずにバックエンドだけ差し替えられる。

import type { InferSelectModel } from "drizzle-orm";
import { items, categories, plans, listings } from "./schema";
import type { Item, Category, Plan, Listing } from "@/types/item";

type ItemRow = InferSelectModel<typeof items>;
type CategoryRow = InferSelectModel<typeof categories>;
type PlanRow = InferSelectModel<typeof plans>;
type ListingRow = InferSelectModel<typeof listings>;

// timestamptz は Date で返るため ISO 文字列へ。null 非許容の created_at/updated_at 用。
function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : v;
}
// deleted_at 等の null 許容用。
function isoOrNull(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    user_id: r.userId,
    status: r.status,
    name: r.name,
    image_url: r.imageUrl,
    jan_code: r.janCode,
    quantity: r.quantity,
    notes: r.notes,
    actual_price: r.actualPrice,
    purchased_at: r.purchasedAt, // date 列は "YYYY-MM-DD" 文字列で返る
    deleted_at: isoOrNull(r.deletedAt),
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    user_id: r.userId,
    name: r.name,
    color: r.color,
    is_preset: r.isPreset,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    item_id: r.itemId,
    planned_purchase_year: r.plannedPurchaseYear,
    planned_purchase_month: r.plannedPurchaseMonth,
    list_price: r.listPrice,
    purchase_price: r.purchasePrice,
    product_url: r.productUrl,
    deal_period: r.dealPeriod,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toListing(r: ListingRow): Listing {
  return {
    id: r.id,
    item_id: r.itemId,
    shipping_id: r.shippingId,
    platform_id: r.platformId,
    quantity: r.quantity,
    selling_price: r.sellingPrice,
    packaging_cost: r.packagingCost,
    work_time_hours: r.workTimeHours,
    labor_rate: r.laborRate,
    selling_fee: r.sellingFee,
    work_time_cost: r.workTimeCost,
    operating_benefit: r.operatingBenefit,
    ordinary_profit: r.ordinaryProfit,
    is_listing: r.isListing,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}
