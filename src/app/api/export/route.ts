import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { items, categories, itemsCategories } from "@/db/schema";
import { toItem, toCategory } from "@/db/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { exportedCategories, exportedItems } = await withUser(user.sub, async (tx) => {
    // 自分が作成したカテゴリのみ（プリセットは取り込み先に既に存在するため除外）。
    const catRows = await tx.select().from(categories).where(eq(categories.userId, user.sub));
    const itemRows = await tx.select().from(items);

    const ids = itemRows.map((r) => r.id);
    const linkMap = new Map<number, number[]>();
    if (ids.length > 0) {
      const links = await tx
        .select({ itemId: itemsCategories.itemId, categoryId: itemsCategories.categoryId })
        .from(itemsCategories)
        .where(inArray(itemsCategories.itemId, ids));
      for (const l of links) {
        const arr = linkMap.get(l.itemId) ?? [];
        arr.push(l.categoryId);
        linkMap.set(l.itemId, arr);
      }
    }

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

  const filename = `mono-log-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
