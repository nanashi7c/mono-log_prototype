import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/db/client";
import { toCategory } from "@/db/serialize";
import { getApiUser, unauthorized, badRequest, dbErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

// GET /api/v1/categories … プリセット＋自分のカテゴリ（RLS の categories_select に従う）。
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  try {
    const result = await withUser(user.sub, async (tx) => {
      const rows = await tx.category.findMany();
      return rows.map(toCategory);
    });
    return NextResponse.json({ categories: result });
  } catch (e) {
    return dbErrorResponse(e);
  }
}

// POST /api/v1/categories … 自分のカテゴリを作成（同名が既にあればそれを返す）。
export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return badRequest("name is required");
  if (b.color !== undefined && typeof b.color !== "string") {
    return badRequest("color must be a string");
  }
  const color = typeof b.color === "string" && b.color.trim() ? b.color.trim() : undefined;

  try {
    const { category, created } = await withUser(user.sub, async (tx) => {
      // FK(categories.user_id → users.id)のため users 行を保証する。
      await tx.user.upsert({
        where: { id: user.sub },
        update: {},
        create: { id: user.sub, email: user.email, username: user.email.split("@")[0] },
      });

      // 同名(user_id, name)が既にあればそれを返す。無ければ作成。
      const existing = await tx.category.findFirst({ where: { userId: user.sub, name } });
      if (existing) return { category: toCategory(existing), created: false };
      const row = await tx.category.create({
        data: { userId: user.sub, name, ...(color ? { color } : {}) },
      });
      return { category: toCategory(row), created: true };
    });
    return NextResponse.json({ category }, { status: created ? 201 : 200 });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
