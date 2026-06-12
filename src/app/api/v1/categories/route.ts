import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { withUser } from "@/db/client";
import { categories, users } from "@/db/schema";
import { toCategory } from "@/db/serialize";
import { getApiUser, unauthorized, badRequest, dbErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

// GET /api/v1/categories … プリセット＋自分のカテゴリ（RLS の categories_select に従う）。
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  try {
    const result = await withUser(user.sub, async (tx) => {
      const rows = await tx.select().from(categories);
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
      await tx
        .insert(users)
        .values({ id: user.sub, email: user.email, username: user.email.split("@")[0] })
        .onConflictDoNothing();

      const inserted = await tx
        .insert(categories)
        .values({ userId: user.sub, name, ...(color ? { color } : {}) })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { category: toCategory(inserted[0]), created: true };

      // 同名(user_id, name)が既存 → それを返す。
      const found = await tx
        .select()
        .from(categories)
        .where(and(eq(categories.userId, user.sub), eq(categories.name, name)))
        .limit(1);
      return { category: toCategory(found[0]), created: false };
    });
    return NextResponse.json({ category }, { status: created ? 201 : 200 });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
