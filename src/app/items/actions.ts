"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET } from "@/lib/image";
import { computeListingMetrics } from "@/lib/listing-calc";
import type { ItemStatus } from "@/types/item";

const STATUSES: ItemStatus[] = ["planned", "owned", "listed"];

type ParsedForm = {
  // Common
  name: string;
  status: ItemStatus;
  category_ids: number[];
  new_category_names: string[];
  jan_code: string | null;
  quantity: number;
  notes: string | null;
  actual_price: number | null;
  purchased_at: string | null;
  image: File | null;
  delete_image: boolean;
  // Plan
  plan: {
    planned_purchase_year: number | null;
    planned_purchase_month: number | null;
    list_price: number | null;
    purchase_price: number | null;
    product_url: string | null;
    deal_period: string | null;
  };
  // Listing
  listing: {
    platform_id: number | null;
    service_id: number | null;
    size_id: number | null;
    quantity: number | null;
    selling_price: number | null;
    packaging_cost: number | null;
    work_time_hours: number | null;
    labor_rate: number | null;
  };
};

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? n : null;
}

function nonNegIntOrNull(v: FormDataEntryValue | null): number | null {
  const n = intOrNull(v);
  return n != null && n >= 0 ? n : null;
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseForm(formData: FormData): ParsedForm {
  const statusRaw = String(formData.get("status") ?? "");
  const status = (STATUSES as string[]).includes(statusRaw) ? (statusRaw as ItemStatus) : "owned";

  const category_ids = formData
    .getAll("category_ids")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const new_category_names = String(formData.get("new_category_names") ?? "")
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const quantityRaw = nonNegIntOrNull(formData.get("quantity"));
  const quantity = quantityRaw != null && quantityRaw > 0 ? quantityRaw : 1;

  const file = formData.get("image");
  const image = file instanceof File && file.size > 0 ? file : null;

  return {
    name: String(formData.get("name") ?? "").trim(),
    status,
    category_ids,
    new_category_names,
    jan_code: strOrNull(formData.get("jan_code")),
    quantity,
    notes: strOrNull(formData.get("notes")),
    actual_price: nonNegIntOrNull(formData.get("actual_price")),
    purchased_at: strOrNull(formData.get("purchased_at")),
    image,
    delete_image: String(formData.get("delete_image") ?? "") === "1",
    plan: {
      planned_purchase_year: intOrNull(formData.get("planned_purchase_year")),
      planned_purchase_month: (() => {
        const m = intOrNull(formData.get("planned_purchase_month"));
        return m != null && m >= 1 && m <= 12 ? m : null;
      })(),
      list_price: nonNegIntOrNull(formData.get("list_price")),
      purchase_price: nonNegIntOrNull(formData.get("purchase_price")),
      product_url: strOrNull(formData.get("product_url")),
      deal_period: strOrNull(formData.get("deal_period")),
    },
    listing: {
      platform_id: intOrNull(formData.get("platform_id")),
      service_id: intOrNull(formData.get("service_id")),
      size_id: intOrNull(formData.get("size_id")),
      quantity: nonNegIntOrNull(formData.get("listing_quantity")),
      selling_price: nonNegIntOrNull(formData.get("selling_price")),
      packaging_cost: nonNegIntOrNull(formData.get("packaging_cost")),
      work_time_hours: (() => {
        const v = formData.get("work_time_hours");
        if (v == null) return null;
        const s = String(v).trim();
        if (s === "") return null;
        const n = Number(s);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })(),
      labor_rate: nonNegIntOrNull(formData.get("labor_rate")),
    },
  };
}

async function authedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function uploadImage(file: File, userId: string, itemId: number): Promise<string> {
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

// Find or create a shipping row for (service_id, size_id).
async function resolveShippingId(
  serviceId: number | null,
  sizeId: number | null,
): Promise<number | null> {
  if (serviceId == null || sizeId == null) return null;
  const supabase = await createClient();
  const { data: found } = await supabase
    .from("shipping")
    .select("id")
    .eq("shipping_service_id", serviceId)
    .eq("shipping_size_id", sizeId)
    .maybeSingle();
  if (found) return found.id;
  const { data: created, error } = await supabase
    .from("shipping")
    .insert({ shipping_service_id: serviceId, shipping_size_id: sizeId })
    .select("id")
    .single();
  if (error || !created) throw new Error(`shipping resolve failed: ${error?.message ?? ""}`);
  return created.id;
}

// Insert any new category names (idempotent), then return all chosen category IDs.
async function resolveCategoryIds(parsed: ParsedForm, userId: string): Promise<number[]> {
  const ids = new Set(parsed.category_ids);
  if (parsed.new_category_names.length === 0) return [...ids];

  const supabase = await createClient();
  for (const name of parsed.new_category_names) {
    const { data: created, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (error) {
      // Most likely a unique-violation from the user already owning this name; fetch instead.
      const { data: existing } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle();
      if (existing) ids.add(existing.id);
      continue;
    }
    if (created) ids.add(created.id);
  }
  return [...ids];
}

async function syncItemCategories(itemId: number, categoryIds: number[]) {
  const supabase = await createClient();
  // Replace strategy: delete current rows, insert fresh ones. Small N per item.
  await supabase.from("items_categories").delete().eq("item_id", itemId);
  if (categoryIds.length === 0) return;
  const rows = categoryIds.map((cid) => ({ item_id: itemId, category_id: cid }));
  const { error } = await supabase.from("items_categories").insert(rows);
  if (error) throw new Error(`category link failed: ${error.message}`);
}

async function upsertPlan(itemId: number, parsed: ParsedForm) {
  const supabase = await createClient();
  if (parsed.status !== "planned") {
    // Drop plan record once the item has moved on. Plan data is conceptually pre-purchase.
    await supabase.from("plans").delete().eq("item_id", itemId);
    return;
  }
  const planRow = { item_id: itemId, ...parsed.plan };
  const { error } = await supabase.from("plans").upsert(planRow, { onConflict: "item_id" });
  if (error) throw new Error(`plan save failed: ${error.message}`);
}

// Look up the per-(service, size) shipping fee from shipping_fees.
async function lookupShippingFee(
  serviceId: number | null,
  sizeId: number | null,
): Promise<number | null> {
  if (serviceId == null || sizeId == null) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipping_fees")
    .select("fee")
    .eq("shipping_service_id", serviceId)
    .eq("shipping_size_id", sizeId)
    .maybeSingle();
  // `numeric` returns as string from supabase-js; coerce here.
  return data?.fee != null ? Number(data.fee) : null;
}

async function lookupPlatformFeeRate(platformId: number | null): Promise<number | null> {
  if (platformId == null) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("platforms")
    .select("fee_rate")
    .eq("id", platformId)
    .maybeSingle();
  return data?.fee_rate != null ? Number(data.fee_rate) : null;
}

async function upsertListing(itemId: number, parsed: ParsedForm) {
  const supabase = await createClient();
  if (parsed.status !== "listed") {
    await supabase.from("listings").delete().eq("item_id", itemId);
    return;
  }
  const shipping_id = await resolveShippingId(parsed.listing.service_id, parsed.listing.size_id);
  const [shipping_fee, platform_fee_rate] = await Promise.all([
    lookupShippingFee(parsed.listing.service_id, parsed.listing.size_id),
    lookupPlatformFeeRate(parsed.listing.platform_id),
  ]);

  const calc = computeListingMetrics({
    selling_price: parsed.listing.selling_price,
    packaging_cost: parsed.listing.packaging_cost,
    work_time_hours: parsed.listing.work_time_hours,
    labor_rate: parsed.listing.labor_rate,
    shipping_fee,
    platform_fee_rate,
  });

  const row = {
    item_id: itemId,
    shipping_id,
    platform_id: parsed.listing.platform_id,
    quantity: parsed.listing.quantity,
    selling_price: parsed.listing.selling_price,
    packaging_cost: parsed.listing.packaging_cost,
    work_time_hours: parsed.listing.work_time_hours,
    labor_rate: parsed.listing.labor_rate,
    selling_fee: calc.selling_fee,
    work_time_cost: calc.work_time_cost,
    operating_benefit: calc.operating_benefit,
    ordinary_profit: calc.ordinary_profit,
    is_listing: calc.is_listing,
  };
  const { error } = await supabase.from("listings").upsert(row, { onConflict: "item_id" });
  if (error) throw new Error(`listing save failed: ${error.message}`);
}

function revalidateAll(itemId?: number) {
  revalidatePath("/");
  revalidatePath("/items");
  revalidatePath("/items/planned");
  revalidatePath("/items/selling");
  revalidatePath("/dashboard");
  if (itemId != null) {
    revalidatePath(`/items/${itemId}`);
    revalidatePath(`/items/${itemId}/edit`);
  }
}

export async function createItem(formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.name) redirect("/items/new?error=name-required");

  const { supabase, user } = await authedSupabase();

  const categoryIds = await resolveCategoryIds(parsed, user.id);

  const { data: created, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      status: parsed.status,
      name: parsed.name,
      jan_code: parsed.jan_code,
      quantity: parsed.quantity,
      notes: parsed.notes,
      actual_price: parsed.actual_price,
      purchased_at: parsed.purchased_at,
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(`/items/new?error=${encodeURIComponent(error?.message ?? "insert failed")}`);
  }

  const itemId = created.id as number;

  try {
    await syncItemCategories(itemId, categoryIds);
    await upsertPlan(itemId, parsed);
    await upsertListing(itemId, parsed);
  } catch (e) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent((e as Error).message)}`);
  }

  if (parsed.image) {
    try {
      const path = await uploadImage(parsed.image, user.id, itemId);
      await supabase.from("items").update({ image_url: path }).eq("id", itemId);
    } catch (e) {
      // Item already exists; surface the upload error on edit page.
      redirect(`/items/${itemId}/edit?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  revalidateAll(itemId);
  redirect(`/items/${itemId}`);
}

export async function updateItem(itemId: number, formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.name) redirect(`/items/${itemId}/edit?error=name-required`);

  const { supabase, user } = await authedSupabase();

  const categoryIds = await resolveCategoryIds(parsed, user.id);

  const { data: existing } = await supabase
    .from("items")
    .select("image_url")
    .eq("id", itemId)
    .single();

  let nextImageUrl: string | null | undefined;
  if (parsed.delete_image && existing?.image_url) {
    await removeImage(existing.image_url);
    nextImageUrl = null;
  }
  if (parsed.image) {
    if (existing?.image_url) await removeImage(existing.image_url);
    nextImageUrl = await uploadImage(parsed.image, user.id, itemId);
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: parsed.status,
      name: parsed.name,
      jan_code: parsed.jan_code,
      quantity: parsed.quantity,
      notes: parsed.notes,
      actual_price: parsed.actual_price,
      purchased_at: parsed.purchased_at,
      ...(nextImageUrl !== undefined ? { image_url: nextImageUrl } : {}),
    })
    .eq("id", itemId);

  if (error) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  try {
    await syncItemCategories(itemId, categoryIds);
    await upsertPlan(itemId, parsed);
    await upsertListing(itemId, parsed);
  } catch (e) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent((e as Error).message)}`);
  }

  revalidateAll(itemId);
  redirect(`/items/${itemId}`);
}

export async function deleteItem(itemId: number) {
  const { supabase } = await authedSupabase();

  const { data: existing } = await supabase
    .from("items")
    .select("image_url")
    .eq("id", itemId)
    .single();
  if (existing?.image_url) await removeImage(existing.image_url);

  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidateAll();
  redirect("/items");
}
