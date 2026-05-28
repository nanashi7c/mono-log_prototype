import Image from "next/image";
import Link from "next/link";
import { formatDate, formatYen } from "@/lib/format";
import type { ItemWithCategory } from "@/types/item";
import styles from "./item-card.module.css";

type Props = {
  item: ItemWithCategory;
  imageUrl: string | null;
};

export default function ItemCard({ item, imageUrl }: Props) {
  return (
    <Link href={`/items/${item.id}/edit`} className={styles.card}>
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
          <span className={styles.price}>{formatYen(item.price_yen)}</span>
        </div>
        <div className={styles.meta}>
          {item.category ? (
            <span
              className={styles.category}
              style={{ color: item.category.color }}
            >
              <span
                aria-hidden
                className={styles.categoryDot}
                style={{ background: item.category.color }}
              />
              {item.category.name}
            </span>
          ) : (
            <span className={styles.uncategorized}>未分類</span>
          )}
          <span>購入: {formatDate(item.purchase_date)}</span>
          {item.tags.length > 0 ? (
            <span className={styles.tags}>#{item.tags.join(" #")}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
