"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { items, listings } from "@/db/schema";

async function authed() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function revalidateItemViews() {
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/items/planned");
  revalidatePath("/items/selling");
  revalidatePath("/dashboard");
}

// planned -> owned. 購入予定一覧の「購入済み」ボタン。
export async function markAsPurchased(itemId: number) {
  const user = await authed();
  await withUser(user.sub, (tx) =>
    tx.update(items).set({ status: "owned" }).where(eq(items.id, itemId)),
  );
  revalidateItemViews();
}

// owned -> listed. 所有物一覧の「出品する」ボタン。listings 行を作成する。
export async function listItem(itemId: number) {
  const user = await authed();
  // listings.item_id は UNIQUE。既に行があれば重複 insert を無視する。
  await withUser(user.sub, async (tx) => {
    await tx.insert(listings).values({ itemId }).onConflictDoNothing();
    await tx.update(items).set({ status: "listed" }).where(eq(items.id, itemId));
  });
  revalidateItemViews();
}

// owned -> planned. 所有物一覧の「購入予定へ戻す」ボタン。
export async function restoreToPlanned(itemId: number) {
  const user = await authed();
  await withUser(user.sub, (tx) =>
    tx.update(items).set({ status: "planned" }).where(eq(items.id, itemId)),
  );
  revalidateItemViews();
}

// listed -> sold. 出品商品一覧の「売却済み」ボタン。論理削除（deleted_at を記録）。
export async function markAsSold(itemId: number) {
  const user = await authed();
  await withUser(user.sub, (tx) =>
    tx
      .update(items)
      .set({ status: "sold", deletedAt: new Date() })
      .where(eq(items.id, itemId)),
  );
  revalidateItemViews();
}

// listed -> owned. 出品商品一覧の「出品取り下げ」ボタン。listings 行を削除する。
export async function unlistItem(itemId: number) {
  const user = await authed();
  await withUser(user.sub, async (tx) => {
    await tx.delete(listings).where(eq(listings.itemId, itemId));
    await tx.update(items).set({ status: "owned" }).where(eq(items.id, itemId));
  });
  revalidateItemViews();
}
