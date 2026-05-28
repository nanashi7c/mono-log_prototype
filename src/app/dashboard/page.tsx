import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";
import type { ItemWithCategory } from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type CategoryStat = {
  id: string | null;
  name: string;
  color: string;
  count: number;
  total: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, price_yen, category:categories(id, name, color)");

  if (error) {
    return <p className={styles.error}>{error.message}</p>;
  }

  const items = (data ?? []) as Pick<ItemWithCategory, "id" | "price_yen" | "category">[];
  const totalCount = items.length;
  const totalYen = items.reduce((acc, i) => acc + (i.price_yen ?? 0), 0);
  const priced = items.filter((i) => i.price_yen != null).length;
  const avgYen = priced ? Math.round(totalYen / priced) : 0;

  const byCategory = new Map<string, CategoryStat>();
  for (const item of items) {
    const key = item.category?.id ?? "__none__";
    const existing = byCategory.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += item.price_yen ?? 0;
    } else {
      byCategory.set(key, {
        id: item.category?.id ?? null,
        name: item.category?.name ?? "未分類",
        color: item.category?.color ?? "#94a3b8",
        count: 1,
        total: item.price_yen ?? 0,
      });
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}
