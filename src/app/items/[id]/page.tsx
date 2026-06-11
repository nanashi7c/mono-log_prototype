import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import {
  items,
  plans,
  listings,
  itemsCategories,
  categories as categoriesTable,
  platforms,
  shipping,
  services,
  sizes,
  shippingFees,
} from "@/db/schema";
import { toItem, toPlan, toListing } from "@/db/serialize";
import { signedImageUrl } from "@/lib/image";
import { formatDate, formatYen } from "@/lib/format";
import type {
  ItemStatus,
  Plan,
  Platform,
  Service,
  Size,
} from "@/types/item";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const statusLabel: Record<ItemStatus, string> = {
  planned: "購入予定",
  owned: "所有中",
  listed: "出品中",
  sold: "売却済",
};

const statusClass: Record<ItemStatus, string> = {
  planned: styles.statusPlanned,
  owned: styles.statusOwned,
  listed: styles.statusListed,
  sold: styles.statusSold,
};

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await withUser(user.sub, async (tx) => {
    const itemRows = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
    if (!itemRows[0]) return null;
    const item = toItem(itemRows[0]);

    const planRows = await tx.select().from(plans).where(eq(plans.itemId, itemId)).limit(1);
    const plan = planRows[0] ? toPlan(planRows[0]) : null;

    const listingRows = await tx.select().from(listings).where(eq(listings.itemId, itemId)).limit(1);
    const listing = listingRows[0] ? toListing(listingRows[0]) : null;

    const categories = await tx
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        color: categoriesTable.color,
      })
      .from(itemsCategories)
      .innerJoin(categoriesTable, eq(itemsCategories.categoryId, categoriesTable.id))
      .where(eq(itemsCategories.itemId, itemId));

    let platform: Pick<Platform, "id" | "name"> | null = null;
    let service: Pick<Service, "id" | "shipping_service"> | null = null;
    let size: Pick<Size, "id" | "shipping_size"> | null = null;
    let shippingFee: number | null = null;
    if (listing) {
      if (listing.platform_id != null) {
        const p = await tx
          .select({ id: platforms.id, name: platforms.name })
          .from(platforms)
          .where(eq(platforms.id, listing.platform_id))
          .limit(1);
        platform = p[0] ?? null;
      }
      if (listing.shipping_id != null) {
        const sh = await tx
          .select({
            serviceId: shipping.shippingServiceId,
            sizeId: shipping.shippingSizeId,
          })
          .from(shipping)
          .where(eq(shipping.id, listing.shipping_id))
          .limit(1);
        if (sh[0]) {
          const svc = await tx
            .select({ id: services.id, shipping_service: services.shippingService })
            .from(services)
            .where(eq(services.id, sh[0].serviceId))
            .limit(1);
          const sz = await tx
            .select({ id: sizes.id, shipping_size: sizes.shippingSize })
            .from(sizes)
            .where(eq(sizes.id, sh[0].sizeId))
            .limit(1);
          const fee = await tx
            .select({ fee: shippingFees.fee })
            .from(shippingFees)
            .where(
              and(
                eq(shippingFees.shippingServiceId, sh[0].serviceId),
                eq(shippingFees.shippingSizeId, sh[0].sizeId),
              ),
            )
            .limit(1);
          service = svc[0] ?? null;
          size = sz[0] ?? null;
          shippingFee = fee[0]?.fee ?? null;
        }
      }
    }

    return { item, plan, listing, categories, platform, service, size, shippingFee };
  });

  if (!result) notFound();
  const { item, plan, listing, categories, platform, service, size, shippingFee } = result;

  const imageUrl = await signedImageUrl(item.image_url);
  const plannedMonth = formatPlannedMonth(plan);
  const ord = listing?.ordinary_profit;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{item.name}</h1>
          <Link href="/items" className={styles.backLink}>
            ← 一覧へ
          </Link>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statusBadge} ${statusClass[item.status]}`}>
            {statusLabel[item.status]}
          </span>
          <Link href={`/items/${item.id}/edit`} className={styles.editLink}>
            編集
          </Link>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.media}>
          <div className={styles.image}>
            {imageUrl ? (
              <Image src={imageUrl} alt="" fill sizes="128px" className={styles.imageImg} />
            ) : (
              <div className={styles.noImage}>no image</div>
            )}
          </div>
          <dl className={styles.dl}>
            <dt className={styles.dt}>数量</dt>
            <dd className={styles.dd}>{item.quantity}</dd>
            <dt className={styles.dt}>JAN コード</dt>
            <dd className={styles.dd}>{item.jan_code ?? "—"}</dd>
            <dt className={styles.dt}>購入価格</dt>
            <dd className={styles.dd}>{formatYen(item.actual_price)}</dd>
            <dt className={styles.dt}>購入日</dt>
            <dd className={styles.dd}>{formatDate(item.purchased_at)}</dd>
          </dl>
        </div>
        {categories.length > 0 ? (
          <div className={styles.categories}>
            {categories.map((c) => (
              <span key={c.id} className={styles.category} style={{ color: c.color }}>
                <span aria-hidden className={styles.categoryDot} style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </div>
        ) : null}
        {item.notes ? (
          <p className={`${styles.notes}`} style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
            {item.notes}
          </p>
        ) : null}
      </section>

      {plan ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>購入予定情報</h2>
          <dl className={styles.dl}>
            <dt className={styles.dt}>購入予定</dt>
            <dd className={styles.dd}>{plannedMonth ?? "—"}</dd>
            <dt className={styles.dt}>定価</dt>
            <dd className={styles.dd}>{formatYen(plan.list_price)}</dd>
            <dt className={styles.dt}>購入予定価格</dt>
            <dd className={styles.dd}>{formatYen(plan.purchase_price)}</dd>
            <dt className={styles.dt}>商品リンク</dt>
            <dd className={styles.dd}>
              {plan.product_url ? (
                <a href={plan.product_url} target="_blank" rel="noopener noreferrer" className={styles.url}>
                  {plan.product_url}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt className={styles.dt}>お買い得期間</dt>
            <dd className={styles.dd}>{plan.deal_period ?? "—"}</dd>
          </dl>
        </section>
      ) : null}

      {listing ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>出品情報</h2>
          <dl className={styles.dl}>
            <dt className={styles.dt}>プラットフォーム</dt>
            <dd className={styles.dd}>{platform?.name ?? "—"}</dd>
            <dt className={styles.dt}>配送サービス</dt>
            <dd className={styles.dd}>{service?.shipping_service ?? "—"}</dd>
            <dt className={styles.dt}>配送サイズ</dt>
            <dd className={styles.dd}>{size?.shipping_size ?? "—"}</dd>
            <dt className={styles.dt}>送料</dt>
            <dd className={styles.dd}>{formatYen(shippingFee)}</dd>
            <dt className={styles.dt}>出品数</dt>
            <dd className={styles.dd}>{listing.quantity ?? "—"}</dd>
            <dt className={styles.dt}>売価</dt>
            <dd className={styles.dd}>{formatYen(listing.selling_price)}</dd>
            <dt className={styles.dt}>梱包材費</dt>
            <dd className={styles.dd}>{formatYen(listing.packaging_cost)}</dd>
            <dt className={styles.dt}>作業時間</dt>
            <dd className={styles.dd}>
              {listing.work_time_hours != null ? `${listing.work_time_hours} h` : "—"}
            </dd>
            <dt className={styles.dt}>時給</dt>
            <dd className={styles.dd}>{formatYen(listing.labor_rate)}</dd>
            <dt className={styles.dt}>販売手数料</dt>
            <dd className={styles.dd}>{formatYen(listing.selling_fee)}</dd>
            <dt className={styles.dt}>作業時間コスト</dt>
            <dd className={styles.dd}>{formatYen(listing.work_time_cost)}</dd>
            <dt className={styles.dt}>営業利益</dt>
            <dd className={styles.dd}>{formatYen(listing.operating_benefit)}</dd>
            <dt className={styles.dt}>経常利益</dt>
            <dd
              className={`${styles.dd} ${ord == null ? "" : Number(ord) >= 0 ? styles.profit : styles.loss}`}
            >
              {formatYen(ord)}
            </dd>
            <dt className={styles.dt}>出品可否判定</dt>
            <dd
              className={`${styles.dd} ${
                listing.is_listing == null
                  ? ""
                  : listing.is_listing
                    ? styles.profit
                    : styles.loss
              }`}
            >
              {listing.is_listing == null ? "—" : listing.is_listing ? "出品推奨" : "非推奨"}
            </dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function formatPlannedMonth(plan: Plan | null): string | null {
  if (!plan?.planned_purchase_year) return null;
  const y = plan.planned_purchase_year;
  const m = plan.planned_purchase_month;
  return m ? `${y}年${m}月` : `${y}年`;
}
