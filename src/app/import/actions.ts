"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import type { ItemStatus } from "@/types/item";

const STATUSES: ItemStatus[] = ["planned", "owned", "listed", "sold"];

type BackupCategory = { id?: number | string; name?: unknown; color?: unknown };
type BackupItem = {
  name?: unknown;
  status?: unknown;
  jan_code?: unknown;
  quantity?: unknown;
  notes?: unknown;
  actual_price?: unknown;
  purchased_at?: unknown;
  category_ids?: unknown;
};

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function asNonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n >= 0 ? n : null;
}

function asPosInt(v: unknown): number | null {
  const n = asNonNegInt(v);
  return n != null && n > 0 ? n : null;
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

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let inserted = 0;
  try {
    inserted = await withUser(user.sub, async (tx) => {
      // 旧カテゴリ id → 新カテゴリ id の対応表。
      const idMap = new Map<string, number>();
      // unique(user_id, name) 衝突を避けるため、既存カテゴリを名前で索引する。
      const existing = await tx.category.findMany({ select: { id: true, name: true } });
      const byName = new Map<string, number>();
      for (const c of existing) byName.set(c.name, c.id);

      for (const c of rawCategories) {
        const name = asString(c.name);
        if (!name) continue;
        let newId = byName.get(name);
        if (newId == null) {
          const found = await tx.category.findFirst({
            where: { userId: user.sub, name },
            select: { id: true },
          });
          newId =
            found?.id ??
            (
              await tx.category.create({
                data: { userId: user.sub, name, color: asString(c.color) ?? "#94a3b8" },
                select: { id: true },
              })
            ).id;
          byName.set(name, newId);
        }
        if (c.id != null && newId != null) idMap.set(String(c.id), newId);
      }

      let count = 0;
      for (const it of rawItems) {
        const name = asString(it.name);
        if (!name) continue;
        const statusRaw = String(it.status ?? "");
        const status: ItemStatus = (STATUSES as string[]).includes(statusRaw)
          ? (statusRaw as ItemStatus)
          : "owned";
        const purchased = asString(it.purchased_at);
        const row = await tx.item.create({
          data: {
            userId: user.sub,
            status,
            name,
            janCode: asString(it.jan_code),
            quantity: asPosInt(it.quantity) ?? 1,
            notes: asString(it.notes),
            actualPrice: asNonNegInt(it.actual_price),
            purchasedAt: purchased ? new Date(purchased) : null,
          },
          select: { id: true },
        });

        const cids = Array.isArray(it.category_ids)
          ? it.category_ids
              .map((x) => idMap.get(String(x)))
              .filter((x): x is number => x != null)
          : [];
        if (cids.length > 0) {
          await tx.itemCategory.createMany({
            data: cids.map((cid) => ({ itemId: row.id, categoryId: cid })),
          });
        }
        count++;
      }
      return count;
    });
  } catch (e) {
    redirect(`/import?error=${encodeURIComponent((e as Error).message)}`);
  }

  revalidatePath("/");
  revalidatePath("/items");
  redirect(`/import?ok=${encodeURIComponent(`${inserted} 件のアイテムを取り込みました。`)}`);
}
