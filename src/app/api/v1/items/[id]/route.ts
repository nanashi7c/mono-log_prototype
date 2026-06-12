import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { withUser } from "@/db/client";
import { items, itemsCategories } from "@/db/schema";
import { toItem } from "@/db/serialize";
import { deleteImage } from "@/lib/image";
import { getApiUser, unauthorized, badRequest, jsonError, dbErrorResponse } from "@/lib/auth/api";
import { categoryIdsByItem, parseItemBody } from "@/lib/api/items";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/v1/items/:id … 単一アイテム取得（RLS で自分の行のみ。無ければ 404）。
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  const id = parseId((await ctx.params).id);
  if (id == null) return badRequest("invalid id");

  try {
    const result = await withUser(user.sub, async (tx) => {
      const rows = await tx.select().from(items).where(eq(items.id, id)).limit(1);
      if (!rows[0]) return null;
      const linkMap = await categoryIdsByItem(tx, [id]);
      return { ...toItem(rows[0]), category_ids: linkMap.get(id) ?? [] };
    });
    if (!result) return jsonError(404, "not found");
    return NextResponse.json({ item: result });
  } catch (e) {
    return dbErrorResponse(e);
  }
}

// PUT /api/v1/items/:id … アイテムを更新（コア項目＋カテゴリの置換）。無ければ 404。
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  const id = parseId((await ctx.params).id);
  if (id == null) return badRequest("invalid id");

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
    const result = await withUser(user.sub, async (tx) => {
      const updated = await tx
        .update(items)
        .set({
          status: v.status,
          name: v.name,
          janCode: v.janCode,
          quantity: v.quantity,
          notes: v.notes,
          actualPrice: v.actualPrice,
          purchasedAt: v.purchasedAt,
        })
        .where(eq(items.id, id))
        .returning();
      if (!updated[0]) return null; // 対象なし（他人の行や存在しない id）

      // カテゴリは置換方式（現行を削除して入れ直す）。
      await tx.delete(itemsCategories).where(eq(itemsCategories.itemId, id));
      if (v.categoryIds.length > 0) {
        await tx
          .insert(itemsCategories)
          .values(v.categoryIds.map((cid) => ({ itemId: id, categoryId: cid })));
      }
      return { ...toItem(updated[0]), category_ids: v.categoryIds };
    });
    if (!result) return jsonError(404, "not found");
    return NextResponse.json({ item: result });
  } catch (e) {
    return dbErrorResponse(e);
  }
}

// DELETE /api/v1/items/:id … アイテムを削除（画像も S3 から削除）。無ければ 404。
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  const id = parseId((await ctx.params).id);
  if (id == null) return badRequest("invalid id");

  try {
    const deleted = await withUser(user.sub, async (tx) => {
      const rows = await tx
        .select({ imageUrl: items.imageUrl })
        .from(items)
        .where(eq(items.id, id))
        .limit(1);
      if (!rows[0]) return false;
      if (rows[0].imageUrl) await deleteImage(rows[0].imageUrl);
      await tx.delete(items).where(eq(items.id, id));
      return true;
    });
    if (!deleted) return jsonError(404, "not found");
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
