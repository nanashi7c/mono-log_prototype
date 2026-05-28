import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";
import type { ItemWithCategory } from "@/types/item";

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
    return <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error.message}</p>;
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
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">ダッシュボード</h1>
        <div className="flex gap-3 text-sm">
          <a href="/api/export" className="text-brand-600 hover:underline">
            エクスポート
          </a>
          <Link href="/import" className="text-brand-600 hover:underline">
            インポート
          </Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="登録数" value={`${totalCount} 件`} />
        <Stat label="保有資産（合計）" value={formatYen(totalYen)} />
        <Stat label="価格あり平均" value={priced ? formatYen(avgYen) : "—"} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-500">カテゴリ別</h2>
        {stats.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            データがありません。
          </p>
        ) : (
          <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
            {stats.map((s) => (
              <li key={s.id ?? "__none__"} className="flex items-center gap-3 text-sm">
                <span className="w-32 truncate" style={{ color: s.color }}>
                  ● {s.name}
                </span>
                <div className="flex-1">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${(s.total / maxTotal) * 100}%`,
                      background: s.color,
                      minWidth: s.total > 0 ? 4 : 0,
                    }}
                  />
                </div>
                <span className="w-20 text-right tabular-nums text-slate-500">{s.count} 件</span>
                <span className="w-28 text-right tabular-nums">{formatYen(s.total)}</span>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
