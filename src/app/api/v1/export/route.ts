import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { withUser } from "@/db/client";
import { items, categories } from "@/db/schema";
import { toItem, toCategory } from "@/db/serialize";
import { getApiUser, unauthorized, dbErrorResponse } from "@/lib/auth/api";
import { categoryIdsByItem } from "@/lib/api/items";

export const dynamic = "force-dynamic";

// GET /api/v1/export … 自分の全データ(カテゴリ＋アイテム)を JSON で返す。
// 既存の /api/export（Cookie 認証・ブラウザのダウンロード用）の Bearer 版。
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  try {
    const { exportedCategories, exportedItems } = await withUser(user.sub, async (tx) => {
      // 自分が作成したカテゴリのみ（プリセットは取り込み先に既に存在するため除外）。
      const catRows = await tx.select().from(categories).where(eq(categories.userId, user.sub));
      const itemRows = await tx.select().from(items);
      const linkMap = await categoryIdsByItem(tx, itemRows.map((r) => r.id));
      return {
        exportedCategories: catRows.map(toCategory),
        exportedItems: itemRows.map((r) => ({ ...toItem(r), category_ids: linkMap.get(r.id) ?? [] })),
      };
    });

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      categories: exportedCategories,
      items: exportedItems,
    };
    return NextResponse.json(payload);
  } catch (e) {
    return dbErrorResponse(e);
  }
}
