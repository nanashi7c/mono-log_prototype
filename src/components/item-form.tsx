"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Category, Item } from "@/types/item";
import styles from "./item-form.module.css";

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
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{mode === "create" ? "アイテムを追加" : "アイテムを編集"}</h1>
        <Link href="/" className={styles.backLink}>
          ← 一覧へ
        </Link>
      </div>

      {error ? (
        <p className={styles.error}>{decodeURIComponent(error)}</p>
      ) : null}

      <form action={action} className={styles.form} encType="multipart/form-data">
        <Field label="名前 *">
          <input
            name="name"
            required
            defaultValue={item?.name ?? ""}
            className={styles.input}
          />
        </Field>

        <Field label="カテゴリ">
          <select
            name="category_id"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={styles.select}
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
              className={styles.subInput}
            />
          ) : null}
        </Field>

        <div className={styles.grid2}>
          <Field label="購入日">
            <input
              name="purchase_date"
              type="date"
              defaultValue={item?.purchase_date ?? ""}
              className={styles.input}
            />
          </Field>
          <Field label="価格 (円)">
            <input
              name="price_yen"
              type="number"
              min={0}
              step={1}
              defaultValue={item?.price_yen ?? ""}
              className={styles.input}
            />
          </Field>
        </div>

        <Field label="タグ（カンマまたは空白区切り）">
          <input
            name="tags"
            defaultValue={item?.tags.join(", ") ?? ""}
            placeholder="例: 電子機器, 仕事, 2024年"
            className={styles.input}
          />
        </Field>

        <Field label="メモ">
          <textarea
            name="notes"
            rows={3}
            defaultValue={item?.notes ?? ""}
            className={styles.input}
          />
        </Field>

        <Field label="画像">
          {imageUrl && !deleteImage ? (
            <div className={styles.imagePreview}>
              <div className={styles.imageBox}>
                <Image src={imageUrl} alt="" fill sizes="96px" className={styles.imageBoxImg} />
              </div>
              <label className={styles.deleteImageLabel}>
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
            className={styles.fileInput}
          />
          {imageUrl && deleteImage ? (
            <input type="hidden" name="delete_image" value="1" />
          ) : null}
        </Field>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>
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
              className={styles.delete}
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
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}
