import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { items, listings, shipping, shippingFees } from "@/db/schema";
import { toItem, toListing } from "@/db/serialize";
import { formatYen } from "@/lib/format";
import { markAsSold, unlistItem } from "../transitions";
import type { Item, Listing } from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Row = Item & { listing: Listing | null };

export default async function SellingItemsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { rows, shippingFeeByShippingId } = await withUser(user.sub, async (tx) => {
    const itemRows = await tx
      .select()
      .from(items)
      .where(and(eq(items.status, "listed"), isNull(items.deletedAt)))
      .orderBy(desc(items.createdAt));

    const ids = itemRows.map((r) => r.id);
    const listingMap = new Map<number, Listing>();
    if (ids.length > 0) {
      const lrows = await tx.select().from(listings).where(inArray(listings.itemId, ids));
      for (const l of lrows) listingMap.set(l.itemId, toListing(l));
    }
    const rows: Row[] = itemRows.map((r) => ({
      ...toItem(r),
      listing: listingMap.get(r.id) ?? null,
    }));

    // 送料は listings の列ではないため、shipping 参照経由で shipping_fees から解決する。
    const shippingIds = [
      ...new Set(rows.map((r) => r.listing?.shipping_id).filter((x): x is number => x != null)),
    ];
    const shippingFeeByShippingId = new Map<number, number>();
    if (shippingIds.length > 0) {
      const ships = await tx
        .select({
          id: shipping.id,
          serviceId: shipping.shippingServiceId,
          sizeId: shipping.shippingSizeId,
        })
        .from(shipping)
        .where(inArray(shipping.id, shippingIds));
      for (const s of ships) {
        const fee = await tx
          .select({ fee: shippingFees.fee })
          .from(shippingFees)
          .where(
            and(
              eq(shippingFees.shippingServiceId, s.serviceId),
              eq(shippingFees.shippingSizeId, s.sizeId),
            ),
          )
          .limit(1);
        if (fee[0]?.fee != null) shippingFeeByShippingId.set(s.id, fee[0].fee);
      }
    }

    return { rows, shippingFeeByShippingId };
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>出品中</h1>
          <p className={styles.count}>{rows.length} 件</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>出品中のアイテムはありません。</div>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => {
            const ord = r.listing?.ordinary_profit;
            return (
              <li key={r.id} className={styles.row}>
                <div>
                  <h3 className={styles.name}>{r.name}</h3>
                  <div className={styles.figures}>
                    <Stat label="所有数" value={String(r.quantity)} />
                    <Stat label="出品数" value={r.listing?.quantity != null ? String(r.listing.quantity) : "—"} />
                    <Stat label="売価" value={formatYen(r.listing?.selling_price)} />
                    <Stat
                      label="送料"
                      value={formatYen(
                        r.listing?.shipping_id != null
                          ? shippingFeeByShippingId.get(r.listing.shipping_id) ?? null
                          : null,
                      )}
                    />
                    <Stat label="販売手数料" value={formatYen(r.listing?.selling_fee)} />
                    <Stat label="梱包材費" value={formatYen(r.listing?.packaging_cost)} />
                    <Stat label="作業時間コスト" value={formatYen(r.listing?.work_time_cost)} />
                    <Stat label="営業利益" value={formatYen(r.listing?.operating_benefit)} />
                    <Stat
                      label="経常利益"
                      value={formatYen(ord)}
                      className={ord == null ? undefined : ord >= 0 ? styles.profit : styles.loss}
                    />
                    <Stat
                      label="出品可否"
                      value={r.listing?.is_listing == null ? "—" : r.listing.is_listing ? "推奨" : "非推奨"}
                      className={
                        r.listing?.is_listing == null
                          ? undefined
                          : r.listing.is_listing
                            ? styles.profit
                            : styles.loss
                      }
                    />
                  </div>
                </div>
                <div className={styles.actions}>
                  <form action={markAsSold.bind(null, r.id)}>
                    <button type="submit" className={styles.sold}>
                      売却済み
                    </button>
                  </form>
                  <form action={unlistItem.bind(null, r.id)}>
                    <button type="submit" className={styles.unlist}>
                      出品取り下げ
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

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={`${styles.figureValue} ${className ?? ""}`}>{value}</span>
    </div>
  );
}
