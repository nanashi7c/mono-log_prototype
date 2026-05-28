import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/image";
import ItemCard from "@/components/item-card";
import FilterBar from "@/components/filter-bar";
import type { Category, ItemWithCategory } from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Search = { q?: string; category?: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { q, category } = await searchParams;
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color")
    .order("name", { ascending: true });

  let query = supabase
    .from("items")
    .select("*, category:categories(id, name, color)")
    .order("created_at", { ascending: false });

  if (category === "__none__") {
    query = query.is("category_id", null);
  } else if (category) {
    query = query.eq("category_id", category);
  }

  if (q && q.trim()) {
    const term = q.trim();
    // Search name/notes via ilike, and tags via array containment.
    const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`name.ilike.${like},notes.ilike.${like},tags.cs.{${term}}`);
  }

  const { data: items, error } = await query;

  if (error) {
    return (
      <p className={styles.error}>
        読み込みに失敗しました: {error.message}
      </p>
    );
  }

  const list = (items ?? []) as ItemWithCategory[];
  const signedUrls = await Promise.all(list.map((i) => signedImageUrl(i.image_path)));

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

      <FilterBar categories={(categories ?? []) as Pick<Category, "id" | "name" | "color">[]} />

      {list.length === 0 ? (
        <div className={styles.empty}>
          まだアイテムがありません。
          <Link href="/items/new" className={styles.emptyLink}>
            最初の1件を追加
          </Link>
        </div>
      ) : (
        <ul className={styles.grid}>
          {list.map((item, i) => (
            <li key={item.id}>
              <ItemCard item={item} imageUrl={signedUrls[i]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
