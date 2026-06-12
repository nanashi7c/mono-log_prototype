import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { withUser } from "@/db/client";
import { items, itemsCategories, users } from "@/db/schema";
import { toItem } from "@/db/serialize";
import { getApiUser, unauthorized, badRequest, dbErrorResponse } from "@/lib/auth/api";
import { ITEM_STATUSES, categoryIdsByItem, parseItemBody } from "@/lib/api/items";
import type { ItemStatus } from "@/types/item";

export const dynamic = "force-dynamic";

// GET /api/v1/items?status=owned … 自分のアイテム一覧（RLS で自分の行のみ）。
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !ITEM_STATUSES.includes(statusParam as ItemStatus)) {
    return badRequest(`invalid status: ${statusParam}`);
  }
  const status = statusParam as ItemStatus | null;

  try {
    const result = await withUser(user.sub, async (tx) => {
      const conds = [isNull(items.deletedAt)];
      if (status) conds.push(eq(items.status, status));
      const rows = await tx.select().from(items).where(and(...conds));
      const linkMap = await categoryIdsByItem(tx, rows.map((r) => r.id));
      return rows.map((r) => ({ ...toItem(r), category_ids: linkMap.get(r.id) ?? [] }));
    });
    return NextResponse.json({ items: result });
  } catch (e) {
    return dbErrorResponse(e);
  }
}

// POST /api/v1/items … アイテムを新規作成（画像・plan・listing は v1 では非対応）。
export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  const parsed = parseItemBody(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const v = parsed.value;

  try {
    const created = await withUser(user.sub, async (tx) => {
      // FK(items.user_id → users.id)のため users 行を保証してから挿入する。
      await tx
        .insert(users)
        .values({ id: user.sub, email: user.email, username: user.email.split("@")[0] })
        .onConflictDoNothing();

      const inserted = await tx
        .insert(items)
        .values({
          userId: user.sub,
          status: v.status,
          name: v.name,
          janCode: v.janCode,
          quantity: v.quantity,
          notes: v.notes,
          actualPrice: v.actualPrice,
          purchasedAt: v.purchasedAt,
        })
        .returning();
      const row = inserted[0];

      if (v.categoryIds.length > 0) {
        await tx
          .insert(itemsCategories)
          .values(v.categoryIds.map((cid) => ({ itemId: row.id, categoryId: cid })));
      }
      return { ...toItem(row), category_ids: v.categoryIds };
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
