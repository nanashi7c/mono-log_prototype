import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/db/client";
import { getApiUser, unauthorized, badRequest, jsonError, dbErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// DELETE /api/v1/categories/:id … 自分のカテゴリを削除（プリセットは RLS で対象外＝404）。
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  const id = parseId((await ctx.params).id);
  if (id == null) return badRequest("invalid id");

  try {
    const deleted = await withUser(user.sub, async (tx) => {
      const res = await tx.category.deleteMany({ where: { id } });
      return res.count > 0;
    });
    if (!deleted) return jsonError(404, "not found");
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
