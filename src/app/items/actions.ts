"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET } from "@/lib/image";

type ParsedForm = {
  name: string;
  category_id: string | null;
  notes: string | null;
  purchase_date: string | null;
  price_yen: number | null;
  tags: string[];
  newCategoryName: string;
  image: File | null;
  deleteImage: boolean;
};

function parseForm(formData: FormData): ParsedForm {
  const name = String(formData.get("name") ?? "").trim();
  const categoryRaw = String(formData.get("category_id") ?? "");
  const newCategoryName = String(formData.get("new_category_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const purchase_date = String(formData.get("purchase_date") ?? "").trim() || null;
  const priceRaw = String(formData.get("price_yen") ?? "").trim();
  const price_yen = priceRaw === "" ? null : Math.max(0, Math.floor(Number(priceRaw)));
  const tags = String(formData.get("tags") ?? "")
    .split(/[,\s、]+/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

  const file = formData.get("image");
  const image = file instanceof File && file.size > 0 ? file : null;
  const deleteImage = String(formData.get("delete_image") ?? "") === "1";

  return {
    name,
    category_id: categoryRaw === "" || categoryRaw === "__new__" ? null : categoryRaw,
    notes,
    purchase_date,
    price_yen: Number.isFinite(price_yen ?? NaN) ? price_yen : null,
    tags,
    newCategoryName: categoryRaw === "__new__" ? newCategoryName : "",
    image,
    deleteImage,
  };
}

async function resolveCategoryId(
  parsed: ParsedForm,
  userId: string,
): Promise<{ id: string | null; error?: string }> {
  if (!parsed.newCategoryName) return { id: parsed.category_id };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: parsed.newCategoryName })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: data.id };
}

async function uploadImage(file: File, userId: string, itemId: string): Promise<string | null> {
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${userId}/${itemId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(`image upload failed: ${error.message}`);
  return path;
}

async function removeImage(path: string) {
  const supabase = await createClient();
  await supabase.storage.from(IMAGE_BUCKET).remove([path]);
}

export async function createItem(formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.name) redirect("/items/new?error=name-required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cat = await resolveCategoryId(parsed, user.id);
  if (cat.error) redirect(`/items/new?error=${encodeURIComponent(cat.error)}`);

  const { data: created, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      category_id: cat.id,
      name: parsed.name,
      notes: parsed.notes,
      purchase_date: parsed.purchase_date,
      price_yen: parsed.price_yen,
      tags: parsed.tags,
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(`/items/new?error=${encodeURIComponent(error?.message ?? "insert failed")}`);
  }

  if (parsed.image) {
    try {
      const path = await uploadImage(parsed.image, user.id, created.id);
      if (path) {
        await supabase.from("items").update({ image_path: path }).eq("id", created.id);
      }
    } catch (e) {
      // Item was created; surface the upload error but don't roll back.
      redirect(`/items/${created.id}/edit?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  revalidatePath("/");
  redirect("/");
}

export async function updateItem(itemId: string, formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.name) redirect(`/items/${itemId}/edit?error=name-required`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cat = await resolveCategoryId(parsed, user.id);
  if (cat.error) redirect(`/items/${itemId}/edit?error=${encodeURIComponent(cat.error)}`);

  const { data: existing } = await supabase
    .from("items")
    .select("image_path")
    .eq("id", itemId)
    .single();

  let nextImagePath: string | null | undefined = undefined;
  if (parsed.deleteImage && existing?.image_path) {
    await removeImage(existing.image_path);
    nextImagePath = null;
  }
  if (parsed.image) {
    if (existing?.image_path) await removeImage(existing.image_path);
    nextImagePath = await uploadImage(parsed.image, user.id, itemId);
  }

  const { error } = await supabase
    .from("items")
    .update({
      category_id: cat.id,
      name: parsed.name,
      notes: parsed.notes,
      purchase_date: parsed.purchase_date,
      price_yen: parsed.price_yen,
      tags: parsed.tags,
      ...(nextImagePath !== undefined ? { image_path: nextImagePath } : {}),
    })
    .eq("id", itemId);

  if (error) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath(`/items/${itemId}/edit`);
  redirect("/");
}

export async function deleteItem(itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("items")
    .select("image_path")
    .eq("id", itemId)
    .single();
  if (existing?.image_path) await removeImage(existing.image_path);

  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/");
}
