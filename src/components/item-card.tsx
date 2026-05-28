import Image from "next/image";
import Link from "next/link";
import { formatDate, formatYen } from "@/lib/format";
import type { ItemWithCategory } from "@/types/item";

type Props = {
  item: ItemWithCategory;
  imageUrl: string | null;
};

export default function ItemCard({ item, imageUrl }: Props) {
  return (
    <Link
      href={`/items/${item.id}/edit`}
      className="group flex gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-500 hover:shadow-sm"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            no image
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium group-hover:text-brand-700">{item.name}</h3>
          <span className="shrink-0 text-sm tabular-nums text-slate-700">{formatYen(item.price_yen)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {item.category ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"
              style={{ color: item.category.color }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: item.category.color }}
              />
              {item.category.name}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5">未分類</span>
          )}
          <span>購入: {formatDate(item.purchase_date)}</span>
          {item.tags.length > 0 ? (
            <span className="truncate">#{item.tags.join(" #")}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
