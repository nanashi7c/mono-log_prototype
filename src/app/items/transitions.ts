"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
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
  const { supabase } = await authed();
  const { error } = await supabase
    .from("items")
    .update({ status: "owned" })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidateItemViews();
}

// owned -> listed. 所有物一覧の「出品する」ボタン。listings 行を作成する。
export async function listItem(itemId: number) {
  const { supabase } = await authed();
  // listings.item_id is UNIQUE; ignore duplicate-insert if a row already exists.
  const { error: insertError } = await supabase
    .from("listings")
    .insert({ item_id: itemId });
  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }
  const { error: updateError } = await supabase
    .from("items")
    .update({ status: "listed" })
    .eq("id", itemId);
  if (updateError) throw new Error(updateError.message);
  revalidateItemViews();
}

// owned -> planned. 所有物一覧の「購入予定へ戻す」ボタン。
export async function restoreToPlanned(itemId: number) {
  const { supabase } = await authed();
  const { error } = await supabase
    .from("items")
    .update({ status: "planned" })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidateItemViews();
}

// listed -> sold. 出品商品一覧の「売却済み」ボタン。論理削除（deleted_at を記録）。
export async function markAsSold(itemId: number) {
  const { supabase } = await authed();
  const { error } = await supabase
    .from("items")
    .update({ status: "sold", deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidateItemViews();
}

// listed -> owned. 出品商品一覧の「出品取り下げ」ボタン。listings 行を削除する。
export async function unlistItem(itemId: number) {
  const { supabase } = await authed();
  const { error: deleteError } = await supabase
    .from("listings")
    .delete()
    .eq("item_id", itemId);
  if (deleteError) throw new Error(deleteError.message);
  const { error: updateError } = await supabase
    .from("items")
    .update({ status: "owned" })
    .eq("id", itemId);
  if (updateError) throw new Error(updateError.message);
  revalidateItemViews();
}
