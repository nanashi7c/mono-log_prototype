import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { toItem, toCategory } from "@/db/serialize";
import { categoryIdsByItem } from "@/lib/api/items";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { exportedCategories, exportedItems } = await withUser(user.sub, async (tx) => {
    // 自分が作成したカテゴリのみ（プリセットは取り込み先に既に存在するため除外）。
    const catRows = await tx.category.findMany({ where: { userId: user.sub } });
    const itemRows = await tx.item.findMany();
    const linkMap = await categoryIdsByItem(tx, itemRows.map((r) => Number(r.id)));
    return {
      exportedCategories: catRows.map(toCategory),
      exportedItems: itemRows.map((r) => ({
        ...toItem(r),
        category_ids: linkMap.get(Number(r.id)) ?? [],
      })),
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
