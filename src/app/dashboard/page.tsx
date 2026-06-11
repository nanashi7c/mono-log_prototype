import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { items, categories, itemsCategories } from "@/db/schema";
import { formatYen } from "@/lib/format";
import type { Category, Item } from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Row = Pick<Item, "id" | "actual_price" | "status"> & {
  categories: Pick<Category, "id" | "name" | "color">[];
};

type CategoryStat = {
  id: number | null;
  name: string;
  color: string;
  count: number;
  total: number;
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Active items only (exclude sold/logically-deleted).
  const items_: Row[] = await withUser(user.sub, async (tx) => {
    const rows = await tx
      .select({ id: items.id, actualPrice: items.actualPrice, status: items.status })
      .from(items)
      .where(and(inArray(items.status, ["owned", "listed"]), isNull(items.deletedAt)));

    const ids = rows.map((r) => r.id);
    const catMap = new Map<number, Pick<Category, "id" | "name" | "color">[]>();
    if (ids.length > 0) {
      const links = await tx
        .select({
          itemId: itemsCategories.itemId,
          id: categories.id,
          name: categories.name,
          color: categories.color,
        })
        .from(itemsCategories)
        .innerJoin(categories, eq(itemsCategories.categoryId, categories.id))
        .where(inArray(itemsCategories.itemId, ids));
      for (const l of links) {
        const arr = catMap.get(l.itemId) ?? [];
        arr.push({ id: l.id, name: l.name, color: l.color });
        catMap.set(l.itemId, arr);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      actual_price: r.actualPrice,
      status: r.status,
      categories: catMap.get(r.id) ?? [],
    }));
  });

  const totalCount = items_.length;
  const totalYen = items_.reduce((acc, i) => acc + (i.actual_price ?? 0), 0);
  const priced = items_.filter((i) => i.actual_price != null).length;
  const avgYen = priced ? Math.round(totalYen / priced) : 0;

  // Each item contributes to every category it belongs to; uncategorized items go to "未分類".
  const byCategory = new Map<string, CategoryStat>();
  for (const item of items_) {
    if (item.categories.length === 0) {
      bump(byCategory, "__none__", {
        id: null,
        name: "未分類",
        color: "#94a3b8",
      }, item.actual_price);
    } else {
      for (const c of item.categories) {
        bump(byCategory, String(c.id), { id: c.id, name: c.name, color: c.color }, item.actual_price);
      }
    }
  }
  const stats = [...byCategory.values()].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...stats.map((s) => s.total));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>ダッシュボード</h1>
        <div className={styles.actions}>
          <a href="/api/export" className={styles.actionLink}>
            エクスポート
          </a>
          <Link href="/import" className={styles.actionLink}>
            インポート
          </Link>
        </div>
      </div>

      <section className={styles.stats}>
        <Stat label="登録数" value={`${totalCount} 件`} />
        <Stat label="保有資産（合計）" value={formatYen(totalYen)} />
        <Stat label="価格あり平均" value={priced ? formatYen(avgYen) : "—"} />
      </section>

      <section>
        <h2 className={styles.sectionTitle}>カテゴリ別</h2>
        {stats.length === 0 ? (
          <p className={styles.empty}>データがありません。</p>
        ) : (
          <ul className={styles.list}>
            {stats.map((s) => (
              <li key={s.id ?? "__none__"} className={styles.row}>
                <span className={styles.rowName} style={{ color: s.color }}>
                  ● {s.name}
                </span>
                <div className={styles.bar}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${(s.total / maxTotal) * 100}%`,
                      background: s.color,
                      minWidth: s.total > 0 ? 4 : 0,
                    }}
                  />
                </div>
                <span className={styles.count}>{s.count} 件</span>
                <span className={styles.total}>{formatYen(s.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function bump(
  map: Map<string, CategoryStat>,
  key: string,
  cat: { id: number | null; name: string; color: string },
  price: number | null,
) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.total += price ?? 0;
    return;
  }
  map.set(key, { ...cat, count: 1, total: price ?? 0 });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}
