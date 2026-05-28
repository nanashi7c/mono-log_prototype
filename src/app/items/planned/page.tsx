import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";
import { markAsPurchased } from "../transitions";
import type { Item, Plan, Category } from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Row = Item & {
  categories: Pick<Category, "id" | "name" | "color">[];
  plan: Plan | null;
};

function formatPlannedMonth(plan: Plan | null): string | null {
  if (!plan?.planned_purchase_year) return null;
  const y = plan.planned_purchase_year;
  const m = plan.planned_purchase_month;
  return m ? `${y}年${m}月` : `${y}年`;
}

export default async function PlannedItemsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*, categories(id, name, color), plan:plans(*)")
    .eq("status", "planned")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return <p className={styles.error}>読み込みに失敗しました: {error.message}</p>;
  }

  const rows = (data ?? []) as Row[];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>購入予定</h1>
          <p className={styles.count}>{rows.length} 件</p>
        </div>
        <Link href="/items/new" className={styles.cta}>
          + 追加
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>購入予定はありません。</div>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => {
            const planned = formatPlannedMonth(r.plan);
            return (
              <li key={r.id} className={styles.row}>
                <div>
                  <h3 className={styles.name}>{r.name}</h3>
                  <div className={styles.meta}>
                    {planned ? (
                      <span>
                        <span className={styles.metaLabel}>予定:</span>
                        {planned}
                      </span>
                    ) : null}
                    {r.plan?.list_price != null ? (
                      <span>
                        <span className={styles.metaLabel}>定価:</span>
                        {formatYen(r.plan.list_price)}
                      </span>
                    ) : null}
                    {r.plan?.purchase_price != null ? (
                      <span>
                        <span className={styles.metaLabel}>購入価格:</span>
                        {formatYen(r.plan.purchase_price)}
                      </span>
                    ) : null}
                    {r.jan_code ? (
                      <span>
                        <span className={styles.metaLabel}>JAN:</span>
                        {r.jan_code}
                      </span>
                    ) : null}
                    <span>
                      <span className={styles.metaLabel}>数量:</span>
                      {r.quantity}
                    </span>
                    {r.plan?.deal_period ? (
                      <span>
                        <span className={styles.metaLabel}>お買い得:</span>
                        {r.plan.deal_period}
                      </span>
                    ) : null}
                    {r.categories.map((c) => (
                      <span key={c.id} style={{ color: c.color }}>
                        ● {c.name}
                      </span>
                    ))}
                    {r.plan?.product_url ? (
                      <a
                        href={r.plan.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.url}
                      >
                        {r.plan.product_url}
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className={styles.actions}>
                  <form action={markAsPurchased.bind(null, r.id)}>
                    <button type="submit" className={styles.purchased}>
                      購入済みにする
                    </button>
                  </form>
                  <Link href={`/items/${r.id}`} className={styles.editLink}>
                    詳細
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
