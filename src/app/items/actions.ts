"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser, type Tx } from "@/db/client";
import { putImage, deleteImage } from "@/lib/image";
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

async function authed() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// 画像を S3 に保存し、保存したオブジェクトキー（= items.image_url に格納する値）を返す。
async function uploadImage(file: File, userId: string, itemId: number): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const key = `${userId}/${itemId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putImage(key, buffer, file.type || undefined);
  return key;
}

async function removeImage(key: string) {
  await deleteImage(key);
}

// (service_id, size_id) の組合せに対応する shipping 行を取得（無ければ作成）。
async function resolveShippingId(
  tx: Tx,
  serviceId: number | null,
  sizeId: number | null,
): Promise<bigint | null> {
  if (serviceId == null || sizeId == null) return null;
  const row = await tx.shipping.upsert({
    where: { shippingServiceId_shippingSizeId: { shippingServiceId: serviceId, shippingSizeId: sizeId } },
    update: {},
    create: { shippingServiceId: serviceId, shippingSizeId: sizeId },
    select: { id: true },
  });
  return row.id;
}

// 新規カテゴリ名を作成（冪等）し、選択された全カテゴリ ID を返す。
async function resolveCategoryIds(tx: Tx, parsed: ParsedForm, userId: string): Promise<number[]> {
  const ids = new Set(parsed.category_ids);
  for (const name of parsed.new_category_names) {
    // unique(user_id, name) 衝突を避けるため、既存を探してから作成する。
    let cat = await tx.category.findFirst({ where: { userId, name }, select: { id: true } });
    if (!cat) cat = await tx.category.create({ data: { userId, name }, select: { id: true } });
    ids.add(cat.id);
  }
  return [...ids];
}

async function syncItemCategories(tx: Tx, itemId: number, categoryIds: number[]) {
  // 置換方式: 現行行を削除し、新しい行を挿入する。
  await tx.itemCategory.deleteMany({ where: { itemId: BigInt(itemId) } });
  if (categoryIds.length === 0) return;
  await tx.itemCategory.createMany({
    data: categoryIds.map((cid) => ({ itemId: BigInt(itemId), categoryId: cid })),
  });
}

async function upsertPlan(tx: Tx, itemId: number, parsed: ParsedForm) {
  if (parsed.status !== "planned") {
    // item が購入予定でなくなったら plan 行は破棄する。
    await tx.plan.deleteMany({ where: { itemId: BigInt(itemId) } });
    return;
  }
  const data = {
    plannedPurchaseYear: parsed.plan.planned_purchase_year,
    plannedPurchaseMonth: parsed.plan.planned_purchase_month,
    listPrice: parsed.plan.list_price,
    purchasePrice: parsed.plan.purchase_price,
    productUrl: parsed.plan.product_url,
    dealPeriod: parsed.plan.deal_period,
  };
  await tx.plan.upsert({
    where: { itemId: BigInt(itemId) },
    update: data,
    create: { itemId: BigInt(itemId), ...data },
  });
}

// shipping_fees から (service, size) の送料を取得。
async function lookupShippingFee(
  tx: Tx,
  serviceId: number | null,
  sizeId: number | null,
): Promise<number | null> {
  if (serviceId == null || sizeId == null) return null;
  const r = await tx.shippingFee.findUnique({
    where: { shippingServiceId_shippingSizeId: { shippingServiceId: serviceId, shippingSizeId: sizeId } },
    select: { fee: true },
  });
  return r ? r.fee.toNumber() : null;
}

async function lookupPlatformFeeRate(tx: Tx, platformId: number | null): Promise<number | null> {
  if (platformId == null) return null;
  const r = await tx.platform.findUnique({ where: { id: platformId }, select: { feeRate: true } });
  return r ? r.feeRate.toNumber() : null;
}

async function upsertListing(tx: Tx, itemId: number, parsed: ParsedForm) {
  if (parsed.status !== "listed") {
    await tx.listing.deleteMany({ where: { itemId: BigInt(itemId) } });
    return;
  }
  const shippingId = await resolveShippingId(tx, parsed.listing.service_id, parsed.listing.size_id);
  // Prisma の対話トランザクションは逐次実行が安全なため Promise.all は使わない。
  const shipping_fee = await lookupShippingFee(tx, parsed.listing.service_id, parsed.listing.size_id);
  const platform_fee_rate = await lookupPlatformFeeRate(tx, parsed.listing.platform_id);

  const calc = computeListingMetrics({
    selling_price: parsed.listing.selling_price,
    packaging_cost: parsed.listing.packaging_cost,
    work_time_hours: parsed.listing.work_time_hours,
    labor_rate: parsed.listing.labor_rate,
    shipping_fee,
    platform_fee_rate,
  });

  const data = {
    shippingId,
    platformId: parsed.listing.platform_id,
    quantity: parsed.listing.quantity,
    sellingPrice: parsed.listing.selling_price,
    packagingCost: parsed.listing.packaging_cost,
    workTimeHours: parsed.listing.work_time_hours,
    laborRate: parsed.listing.labor_rate,
    sellingFee: calc.selling_fee,
    workTimeCost: calc.work_time_cost,
    operatingBenefit: calc.operating_benefit,
    ordinaryProfit: calc.ordinary_profit,
    isListing: calc.is_listing,
  };
  await tx.listing.upsert({
    where: { itemId: BigInt(itemId) },
    update: data,
    create: { itemId: BigInt(itemId), ...data },
  });
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

  const user = await authed();

  let newId: number;
  try {
    newId = await withUser(user.sub, async (tx) => {
      const categoryIds = await resolveCategoryIds(tx, parsed, user.sub);

      const row = await tx.item.create({
        data: {
          userId: user.sub,
          status: parsed.status,
          name: parsed.name,
          janCode: parsed.jan_code,
          quantity: parsed.quantity,
          notes: parsed.notes,
          actualPrice: parsed.actual_price,
          purchasedAt: parsed.purchased_at ? new Date(parsed.purchased_at) : null,
        },
      });
      const itemId = Number(row.id);

      await syncItemCategories(tx, itemId, categoryIds);
      await upsertPlan(tx, itemId, parsed);
      await upsertListing(tx, itemId, parsed);

      if (parsed.image) {
        const key = await uploadImage(parsed.image, user.sub, itemId);
        await tx.item.update({ where: { id: row.id }, data: { imageUrl: key } });
      }

      return itemId;
    });
  } catch (e) {
    redirect(`/items/new?error=${encodeURIComponent((e as Error).message)}`);
  }

  revalidateAll(newId);
  redirect(`/items/${newId}`);
}

export async function updateItem(itemId: number, formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.name) redirect(`/items/${itemId}/edit?error=name-required`);

  const user = await authed();

  try {
    await withUser(user.sub, async (tx) => {
      const categoryIds = await resolveCategoryIds(tx, parsed, user.sub);

      const existing = await tx.item.findFirst({
        where: { id: BigInt(itemId) },
        select: { imageUrl: true },
      });
      const currentKey = existing?.imageUrl ?? null;

      let nextImageUrl: string | null | undefined;
      if (parsed.delete_image && currentKey) {
        await removeImage(currentKey);
        nextImageUrl = null;
      }
      if (parsed.image) {
        if (currentKey) await removeImage(currentKey);
        nextImageUrl = await uploadImage(parsed.image, user.sub, itemId);
      }

      await tx.item.updateMany({
        where: { id: BigInt(itemId) },
        data: {
          status: parsed.status,
          name: parsed.name,
          janCode: parsed.jan_code,
          quantity: parsed.quantity,
          notes: parsed.notes,
          actualPrice: parsed.actual_price,
          purchasedAt: parsed.purchased_at ? new Date(parsed.purchased_at) : null,
          ...(nextImageUrl !== undefined ? { imageUrl: nextImageUrl } : {}),
        },
      });

      await syncItemCategories(tx, itemId, categoryIds);
      await upsertPlan(tx, itemId, parsed);
      await upsertListing(tx, itemId, parsed);
    });
  } catch (e) {
    redirect(`/items/${itemId}/edit?error=${encodeURIComponent((e as Error).message)}`);
  }

  revalidateAll(itemId);
  redirect(`/items/${itemId}`);
}

export async function deleteItem(itemId: number) {
  const user = await authed();

  await withUser(user.sub, async (tx) => {
    const existing = await tx.item.findFirst({
      where: { id: BigInt(itemId) },
      select: { imageUrl: true },
    });
    if (existing?.imageUrl) await removeImage(existing.imageUrl);
    await tx.item.deleteMany({ where: { id: BigInt(itemId) } });
  });

  revalidateAll();
  redirect("/items");
}
