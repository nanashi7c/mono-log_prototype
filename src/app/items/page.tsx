import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  const { data: categoriesData } = await supabase
    .from("categories")
    .select("id, name, color")
    .order("name", { ascending: true });
  const categories = (categoriesData ?? []) as Pick<Category, "id" | "name" | "color">[];

  let query = supabase
    .from("items")
    .select("*, categories(id, name, color)")
    .in("status", ["owned", "listed"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (q && q.trim()) {
    const term = q.trim();
    const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`name.ilike.${like},notes.ilike.${like}`);
  }

  // Category filter is M:N: resolve item IDs from items_categories first.
  if (category === "__none__") {
    const { data: catRows } = await supabase.from("items_categories").select("item_id");
    const taggedIds = (catRows ?? []).map((r) => r.item_id);
    if (taggedIds.length > 0) query = query.not("id", "in", `(${taggedIds.join(",")})`);
  } else if (category) {
    const catId = Number(category);
    const { data: catRows } = await supabase
      .from("items_categories")
      .select("item_id")
      .eq("category_id", catId);
    const ids = (catRows ?? []).map((r) => r.item_id);
    query = ids.length > 0 ? query.in("id", ids) : query.eq("id", -1);
  }

  const { data: items, error } = await query;

  if (error) {
    return <p className={styles.error}>読み込みに失敗しました: {error.message}</p>;
  }

  const list = (items ?? []) as ItemWithCategories[];
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

      <FilterBar categories={categories} />

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
