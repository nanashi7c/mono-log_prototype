"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type BackupCategory = { id?: string; name?: unknown; color?: unknown };
type BackupItem = {
  id?: string;
  category_id?: string | null;
  name?: unknown;
  notes?: unknown;
  purchase_date?: unknown;
  price_yen?: unknown;
  tags?: unknown;
};

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export async function importBackup(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/import?error=no-file");
  }

  const text = await (file as File).text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    redirect(`/import?error=${encodeURIComponent("JSONとして解析できません: " + (e as Error).message)}`);
  }

  if (!parsed || typeof parsed !== "object") {
    redirect("/import?error=invalid-format");
  }
  const root = parsed as { categories?: unknown; items?: unknown };
  const rawCategories = Array.isArray(root.categories) ? (root.categories as BackupCategory[]) : [];
  const rawItems = Array.isArray(root.items) ? (root.items as BackupItem[]) : [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Map old category id -> new category id for the current user.
  const categoryIdMap = new Map<string, string>();

  // Pre-fetch existing categories by name to avoid unique-violation on (user_id, name).
  const { data: existingCats } = await supabase.from("categories").select("id, name");
  const byName = new Map<string, string>();
  for (const c of existingCats ?? []) byName.set(c.name, c.id);

  for (const c of rawCategories) {
    const name = asString(c.name);
    if (!name) continue;
    const color = asString(c.color) ?? "#94a3b8";
    let newId = byName.get(name);
    if (!newId) {
      const { data, error } = await supabase
        .from("categories")
        .insert({ user_id: user.id, name, color })
        .select("id")
        .single();
      if (error || !data) continue;
      newId = String(data.id); // categories.id は integer。Map は string キーのため変換
      byName.set(name, newId);
    }
    if (c.id) categoryIdMap.set(c.id, newId);
  }

  const rowsToInsert = rawItems
    .map((it) => {
      const name = asString(it.name);
      if (!name) return null;
      const oldCat = typeof it.category_id === "string" ? it.category_id : null;
      const newCat = oldCat ? categoryIdMap.get(oldCat) ?? null : null;
      const price =
        typeof it.price_yen === "number" && Number.isFinite(it.price_yen)
          ? Math.max(0, Math.floor(it.price_yen))
          : null;
      const tags = Array.isArray(it.tags) ? it.tags.filter((t): t is string => typeof t === "string") : [];
      return {
        user_id: user.id,
        category_id: newCat,
        name,
        notes: asString(it.notes),
        purchase_date: asString(it.purchase_date),
        price_yen: price,
        tags,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from("items").insert(rowsToInsert);
    if (error) {
      redirect(`/import?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/");
  redirect(`/import?ok=${encodeURIComponent(`${rowsToInsert.length} 件のアイテムを取り込みました。`)}`);
}
