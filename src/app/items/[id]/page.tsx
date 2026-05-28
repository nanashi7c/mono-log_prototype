import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/image";
import { formatDate, formatYen } from "@/lib/format";
import type {
  Category,
  Item,
  ItemStatus,
  Listing,
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

  const supabase = await createClient();
  const [itemRes, planRes, listingRes, linkRes] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).maybeSingle(),
    supabase.from("plans").select("*").eq("item_id", itemId).maybeSingle(),
    supabase.from("listings").select("*").eq("item_id", itemId).maybeSingle(),
    supabase
      .from("items_categories")
      .select("category:categories(id, name, color)")
      .eq("item_id", itemId),
  ]);

  const item = itemRes.data as Item | null;
  if (!item) notFound();

  const plan = (planRes.data as Plan | null) ?? null;
  const listing = (listingRes.data as Listing | null) ?? null;
  // PostgREST embeds the M:1 reference as a single object; cast via unknown to bypass
  // the array-shape inferred from supabase-js without generated DB types.
  const categories = ((linkRes.data ?? []) as unknown as {
    category: Pick<Category, "id" | "name" | "color"> | null;
  }[])
    .map((r) => r.category)
    .filter((c): c is Pick<Category, "id" | "name" | "color"> => c != null);

  // Resolve listing-related labels when present.
  let platform: Pick<Platform, "id" | "name"> | null = null;
  let service: Pick<Service, "id" | "shipping_service"> | null = null;
  let size: Pick<Size, "id" | "shipping_size"> | null = null;
  let shippingFee: number | null = null;
  if (listing) {
    if (listing.platform_id != null) {
      const { data } = await supabase
        .from("platforms")
        .select("id, name")
        .eq("id", listing.platform_id)
        .maybeSingle();
      platform = (data as Pick<Platform, "id" | "name"> | null) ?? null;
    }
    if (listing.shipping_id != null) {
      const { data: ship } = await supabase
        .from("shipping")
        .select("shipping_service_id, shipping_size_id")
        .eq("id", listing.shipping_id)
        .maybeSingle();
      if (ship) {
        const [{ data: svc }, { data: sz }, { data: fee }] = await Promise.all([
          supabase
            .from("services")
            .select("id, shipping_service")
            .eq("id", ship.shipping_service_id)
            .maybeSingle(),
          supabase
            .from("sizes")
            .select("id, shipping_size")
            .eq("id", ship.shipping_size_id)
            .maybeSingle(),
          supabase
            .from("shipping_fees")
            .select("fee")
            .eq("shipping_service_id", ship.shipping_service_id)
            .eq("shipping_size_id", ship.shipping_size_id)
            .maybeSingle(),
        ]);
        service = (svc as Pick<Service, "id" | "shipping_service"> | null) ?? null;
        size = (sz as Pick<Size, "id" | "shipping_size"> | null) ?? null;
        shippingFee = fee?.fee != null ? Number(fee.fee) : null;
      }
    }
  }

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
