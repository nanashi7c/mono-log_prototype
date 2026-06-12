import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
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
    const cats = await tx.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    });

    // 検索・カテゴリ絞り込みはリレーションフィルタで一括表現する。
    const where: Prisma.ItemWhereInput = {
      status: { in: ["owned", "listed"] },
      deletedAt: null,
    };
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
      ];
    }
    if (category === "__none__") {
      where.itemCategories = { none: {} };
    } else if (category) {
      where.itemCategories = { some: { categoryId: Number(category) } };
    }

    const rows = await tx.item.findMany({ where, orderBy: { createdAt: "desc" } });

    // 各 item のカテゴリ（M:N）をまとめて取得する。
    const catMap = new Map<number, Pick<Category, "id" | "name" | "color">[]>();
    if (rows.length > 0) {
      const links = await tx.itemCategory.findMany({
        where: { itemId: { in: rows.map((r) => r.id) } },
        select: { itemId: true, category: { select: { id: true, name: true, color: true } } },
      });
      for (const l of links) {
        const k = Number(l.itemId);
        const arr = catMap.get(k) ?? [];
        arr.push({ id: l.category.id, name: l.category.name, color: l.category.color });
        catMap.set(k, arr);
      }
    }

    const list: ItemWithCategories[] = rows.map((r) => ({
      ...toItem(r),
      categories: catMap.get(Number(r.id)) ?? [],
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
