import Image from "next/image";
import Link from "next/link";
import { formatDate, formatYen } from "@/lib/format";
import type { ItemStatus, ItemWithCategories } from "@/types/item";
import styles from "./item-card.module.css";

type Props = {
  item: ItemWithCategories;
  imageUrl: string | null;
};

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

export default function ItemCard({ item, imageUrl }: Props) {
  return (
    <Link href={`/items/${item.id}`} className={styles.card}>
      <div className={styles.thumb}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="80px"
            className={styles.thumbImage}
          />
        ) : (
          <div className={styles.noImage}>no image</div>
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.headerRow}>
          <h3 className={styles.name}>{item.name}</h3>
          <span className={styles.price}>{formatYen(item.actual_price)}</span>
        </div>
        <div className={styles.meta}>
          <span className={`${styles.statusBadge} ${statusClass[item.status]}`}>
            {statusLabel[item.status]}
          </span>
          {item.categories.length > 0 ? (
            <span className={styles.categories}>
              {item.categories.map((c) => (
                <span key={c.id} className={styles.category} style={{ color: c.color }}>
                  <span
                    aria-hidden
                    className={styles.categoryDot}
                    style={{ background: c.color }}
                  />
                  {c.name}
                </span>
              ))}
            </span>
          ) : (
            <span className={styles.uncategorized}>未分類</span>
          )}
          <span>x {item.quantity}</span>
          {item.purchased_at ? <span>購入: {formatDate(item.purchased_at)}</span> : null}
        </div>
      </div>
    </Link>
  );
}
