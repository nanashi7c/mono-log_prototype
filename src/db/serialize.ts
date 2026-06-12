// Prisma のクエリ結果（camelCase・BigInt/Decimal/Date）を、
// 既存 UI / API が前提とする types/item.ts の形（snake_case・number・文字列日時）へ変換する層。
// これにより UI コンポーネント／型・API レスポンス互換を保ったままバックエンドを差し替えられる。

import { Prisma } from "@prisma/client";
import type {
  Item as ItemRow,
  Category as CategoryRow,
  Plan as PlanRow,
  Listing as ListingRow,
} from "@prisma/client";
import type { Item, Category, Plan, Listing } from "@/types/item";

// timestamptz(Date) → ISO 文字列
function iso(d: Date): string {
  return d.toISOString();
}
function isoOrNull(d: Date | null): string | null {
  return d == null ? null : d.toISOString();
}
// date 列(Date) → "YYYY-MM-DD"
function ymdOrNull(d: Date | null): string | null {
  return d == null ? null : d.toISOString().slice(0, 10);
}
// numeric(Decimal) → number。NextResponse.json は Decimal を素直に扱えないため number 化する。
function decOrNull(d: Prisma.Decimal | null): number | null {
  return d == null ? null : d.toNumber();
}
// bigint → number。NextResponse.json は BigInt で例外になるため number 化する。
function bigToNum(b: bigint): number {
  return Number(b);
}
function bigToNumOrNull(b: bigint | null): number | null {
  return b == null ? null : Number(b);
}

export function toItem(r: ItemRow): Item {
  return {
    id: bigToNum(r.id),
    user_id: r.userId,
    status: r.status,
    name: r.name,
    image_url: r.imageUrl,
    jan_code: r.janCode,
    quantity: r.quantity,
    notes: r.notes,
    actual_price: r.actualPrice,
    purchased_at: ymdOrNull(r.purchasedAt), // date 列は "YYYY-MM-DD" で返す
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
    id: bigToNum(r.id),
    item_id: bigToNum(r.itemId),
    planned_purchase_year: r.plannedPurchaseYear,
    planned_purchase_month: r.plannedPurchaseMonth,
    list_price: decOrNull(r.listPrice),
    purchase_price: decOrNull(r.purchasePrice),
    product_url: r.productUrl,
    deal_period: r.dealPeriod,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toListing(r: ListingRow): Listing {
  return {
    id: bigToNum(r.id),
    item_id: bigToNum(r.itemId),
    shipping_id: bigToNumOrNull(r.shippingId),
    platform_id: r.platformId,
    quantity: r.quantity,
    selling_price: decOrNull(r.sellingPrice),
    packaging_cost: decOrNull(r.packagingCost),
    work_time_hours: decOrNull(r.workTimeHours),
    labor_rate: decOrNull(r.laborRate),
    selling_fee: decOrNull(r.sellingFee),
    work_time_cost: decOrNull(r.workTimeCost),
    operating_benefit: decOrNull(r.operatingBenefit),
    ordinary_profit: decOrNull(r.ordinaryProfit),
    is_listing: r.isListing,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}
