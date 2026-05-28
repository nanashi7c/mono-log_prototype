import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/image";
import ItemCard from "@/components/item-card";
import FilterBar from "@/components/filter-bar";
import type { Category, ItemWithCategory } from "@/types/item";

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
      <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
        読み込みに失敗しました: {error.message}
      </p>
    );
  }

  const list = (items ?? []) as ItemWithCategory[];
  const signedUrls = await Promise.all(list.map((i) => signedImageUrl(i.image_path)));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">所有物</h1>
          <p className="text-sm text-slate-500">{list.length} 件</p>
        </div>
        <Link
          href="/items/new"
          className="rounded-md bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
        >
          + 追加
        </Link>
      </div>

      <FilterBar categories={(categories ?? []) as Pick<Category, "id" | "name" | "color">[]} />

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          まだアイテムがありません。<Link href="/items/new" className="text-brand-600 hover:underline">最初の1件を追加</Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
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
