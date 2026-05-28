"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Category, Item } from "@/types/item";

type Props = {
  mode: "create" | "edit";
  item?: Item;
  imageUrl?: string | null;
  categories: Pick<Category, "id" | "name" | "color">[];
  action: (formData: FormData) => void;
  onDelete?: (formData: FormData) => void;
  error?: string;
};

export default function ItemForm({ mode, item, imageUrl, categories, action, onDelete, error }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string>(item?.category_id ?? "");
  const [deleteImage, setDeleteImage] = useState(false);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{mode === "create" ? "アイテムを追加" : "アイテムを編集"}</h1>
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← 一覧へ
        </Link>
      </div>

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{decodeURIComponent(error)}</p>
      ) : null}

      <form action={action} className="space-y-4" encType="multipart/form-data">
        <Field label="名前 *">
          <input
            name="name"
            required
            defaultValue={item?.name ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label="カテゴリ">
          <select
            name="category_id"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">未分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new__">+ 新規カテゴリ…</option>
          </select>
          {selectedCategory === "__new__" ? (
            <input
              name="new_category_name"
              placeholder="新しいカテゴリ名"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="購入日">
            <input
              name="purchase_date"
              type="date"
              defaultValue={item?.purchase_date ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </Field>
          <Field label="価格 (円)">
            <input
              name="price_yen"
              type="number"
              min={0}
              step={1}
              defaultValue={item?.price_yen ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </Field>
        </div>

        <Field label="タグ（カンマまたは空白区切り）">
          <input
            name="tags"
            defaultValue={item?.tags.join(", ") ?? ""}
            placeholder="例: 電子機器, 仕事, 2024年"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label="メモ">
          <textarea
            name="notes"
            rows={3}
            defaultValue={item?.notes ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label="画像">
          {imageUrl && !deleteImage ? (
            <div className="mb-2 flex items-center gap-3">
              <div className="relative h-24 w-24 overflow-hidden rounded-md bg-slate-100">
                <Image src={imageUrl} alt="" fill sizes="96px" className="object-cover" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={deleteImage}
                  onChange={(e) => setDeleteImage(e.target.checked)}
                />
                画像を削除
              </label>
              <input type="hidden" name="delete_image" value={deleteImage ? "1" : "0"} />
            </div>
          ) : null}
          <input
            name="image"
            type="file"
            accept="image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-700"
          />
          {imageUrl && deleteImage ? (
            <input type="hidden" name="delete_image" value="1" />
          ) : null}
        </Field>

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            className="rounded-md bg-brand-500 px-4 py-2 text-white hover:bg-brand-600"
          >
            {mode === "create" ? "追加" : "保存"}
          </button>
          {onDelete && item ? (
            <button
              type="submit"
              formAction={onDelete}
              formNoValidate
              onClick={(e) => {
                if (!confirm(`「${item.name}」を削除しますか？`)) e.preventDefault();
              }}
              className="text-sm text-rose-600 hover:underline"
            >
              削除
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      {children}
    </label>
  );
}
