import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { items, plans, categories, itemsCategories } from "@/db/schema";
import { toItem, toPlan } from "@/db/serialize";
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
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows: Row[] = await withUser(user.sub, async (tx) => {
    const itemRows = await tx
      .select()
      .from(items)
      .where(and(eq(items.status, "planned"), isNull(items.deletedAt)))
      .orderBy(desc(items.createdAt));

    const ids = itemRows.map((r) => r.id);
    const planMap = new Map<number, Plan>();
    const catMap = new Map<number, Pick<Category, "id" | "name" | "color">[]>();
    if (ids.length > 0) {
      const planRows = await tx.select().from(plans).where(inArray(plans.itemId, ids));
      for (const p of planRows) planMap.set(p.itemId, toPlan(p));

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

    return itemRows.map((r) => ({
      ...toItem(r),
      categories: catMap.get(r.id) ?? [],
      plan: planMap.get(r.id) ?? null,
    }));
  });

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
