import Link from "next/link";
import { redirect } from "next/navigation";
import {
  and,
  or,
  eq,
  isNull,
  ilike,
  inArray,
  notInArray,
  asc,
  desc,
  type SQL,
} from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { items, categories, itemsCategories } from "@/db/schema";
import { toItem } from "@/db/serialize";
import { signedImageUrl } from "@/lib/image";
import ItemCard from "@/components/item-card";
import FilterBar from "@/components/filter-bar";
import { listItem, restoreToPlanned } from "./transitions";
import type { Category, ItemWithCategories } from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Search = { q?: string; category?: string };

export default async function OwnedItemsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { q, category } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { list, categoryOptions } = await withUser(user.sub, async (tx) => {
    const cats = await tx
      .select({ id: categories.id, name: categories.name, color: categories.color })
      .from(categories)
      .orderBy(asc(categories.name));

    const conds: SQL[] = [
      inArray(items.status, ["owned", "listed"]),
      isNull(items.deletedAt),
    ];

    if (q && q.trim()) {
      const term = `%${q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
      conds.push(or(ilike(items.name, term), ilike(items.notes, term))!);
    }

    // カテゴリ絞り込みは M:N。先に items_categories から対象 item ID を解決する。
    if (category === "__none__") {
      const tagged = await tx
        .selectDistinct({ itemId: itemsCategories.itemId })
        .from(itemsCategories);
      const taggedIds = tagged.map((r) => r.itemId);
      if (taggedIds.length > 0) conds.push(notInArray(items.id, taggedIds));
    } else if (category) {
      const catId = Number(category);
      const linked = await tx
        .select({ itemId: itemsCategories.itemId })
        .from(itemsCategories)
        .where(eq(itemsCategories.categoryId, catId));
      const ids = linked.map((r) => r.itemId);
      if (ids.length === 0) {
        return { list: [] as ItemWithCategories[], categoryOptions: cats };
      }
      conds.push(inArray(items.id, ids));
    }

    const rows = await tx
      .select()
      .from(items)
      .where(and(...conds))
      .orderBy(desc(items.createdAt));

    // 各 item のカテゴリ（M:N）をまとめて取得する。
    const itemIds = rows.map((r) => r.id);
    const catMap = new Map<number, Pick<Category, "id" | "name" | "color">[]>();
    if (itemIds.length > 0) {
      const links = await tx
        .select({
          itemId: itemsCategories.itemId,
          id: categories.id,
          name: categories.name,
          color: categories.color,
        })
        .from(itemsCategories)
        .innerJoin(categories, eq(itemsCategories.categoryId, categories.id))
        .where(inArray(itemsCategories.itemId, itemIds));
      for (const l of links) {
        const arr = catMap.get(l.itemId) ?? [];
        arr.push({ id: l.id, name: l.name, color: l.color });
        catMap.set(l.itemId, arr);
      }
    }

    const list: ItemWithCategories[] = rows.map((r) => ({
      ...toItem(r),
      categories: catMap.get(r.id) ?? [],
    }));
    return { list, categoryOptions: cats };
  });

  const signedUrls = await Promise.all(list.map((i) => signedImageUrl(i.image_url)));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>所有物</h1>
          <p className={styles.count}>{list.length} 件</p>
        </div>
        <Link href="/items/new" className={styles.cta}>
          + 追加
        </Link>
      </div>

      <FilterBar categories={categoryOptions} />

      {list.length === 0 ? (
        <div className={styles.empty}>
          まだアイテムがありません。
          <Link href="/items/new" className={styles.emptyLink}>
            最初の1件を追加
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {list.map((item, i) => (
            <li key={item.id} className={styles.row}>
              <ItemCard item={item} imageUrl={signedUrls[i]} />
              <div className={styles.actions}>
                {item.status === "owned" ? (
                  <>
                    <form action={listItem.bind(null, item.id)}>
                      <button type="submit" className={styles.actionButton}>
                        出品する
                      </button>
                    </form>
                    <form action={restoreToPlanned.bind(null, item.id)}>
                      <button type="submit" className={styles.actionButton}>
                        購入予定へ戻す
                      </button>
                    </form>
                  </>
                ) : (
                  <span className={styles.actionButton} aria-disabled>
                    出品中（管理は出品リスト）
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
