// REST API(items) で使う検証・整形ロジック。route ハンドラ間で共有する。
import type { Tx } from "@/db/client";
import type { ItemStatus } from "@/types/item";

export const ITEM_STATUSES: ItemStatus[] = ["planned", "owned", "listed", "sold"];

// INSERT/UPDATE 用に整えた item の値（camelCase）。
export type ItemInput = {
  status: ItemStatus;
  name: string;
  janCode: string | null;
  quantity: number;
  notes: string | null;
  actualPrice: number | null;
  purchasedAt: string | null;
  categoryIds: number[];
};

// items に紐づくカテゴリ ID を item_id ごとにまとめて返す（item_id は number）。
export async function categoryIdsByItem(tx: Tx, ids: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (ids.length === 0) return map;
  const links = await tx.itemCategory.findMany({
    where: { itemId: { in: ids.map((n) => BigInt(n)) } },
    select: { itemId: true, categoryId: true },
  });
  for (const l of links) {
    const k = Number(l.itemId);
    const arr = map.get(k) ?? [];
    arr.push(l.categoryId);
    map.set(k, arr);
  }
  return map;
}

// 入力 JSON を検証して ItemInput に整える。画像・plan・listing は v1 では扱わない。
export function parseItemBody(
  body: unknown,
): { ok: true; value: ItemInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };

  let status: ItemStatus = "owned";
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !ITEM_STATUSES.includes(b.status as ItemStatus)) {
      return { ok: false, error: `invalid status: ${String(b.status)}` };
    }
    status = b.status as ItemStatus;
  }

  let quantity = 1;
  if (b.quantity !== undefined) {
    const q = Number(b.quantity);
    if (!Number.isInteger(q) || q <= 0) {
      return { ok: false, error: "quantity must be a positive integer" };
    }
    quantity = q;
  }

  const strOrNull = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  const nonNegIntOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  let categoryIds: number[] = [];
  if (b.category_ids !== undefined) {
    if (!Array.isArray(b.category_ids)) return { ok: false, error: "category_ids must be an array" };
    categoryIds = b.category_ids.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  }

  return {
    ok: true,
    value: {
      status,
      name,
      janCode: strOrNull(b.jan_code),
      quantity,
      notes: strOrNull(b.notes),
      actualPrice: nonNegIntOrNull(b.actual_price),
      purchasedAt: strOrNull(b.purchased_at),
      categoryIds,
    },
  };
}
