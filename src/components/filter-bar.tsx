"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Category } from "@/types/item";
import styles from "./filter-bar.module.css";

type Props = {
  categories: Pick<Category, "id" | "name" | "color">[];
};

export default function FilterBar({ categories }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentQ = params.get("q") ?? "";
  const currentCategory = params.get("category") ?? "";

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `/?${qs}` : "/");
    });
  }

  return (
    <div className={styles.bar}>
      <input
        type="search"
        placeholder="名前・メモ・タグで検索"
        defaultValue={currentQ}
        onChange={(e) => update({ q: e.target.value })}
        className={styles.search}
      />
      <select
        value={currentCategory}
        onChange={(e) => update({ category: e.target.value || null })}
        className={styles.select}
      >
        <option value="">全カテゴリ</option>
        <option value="__none__">未分類</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending ? <span className={styles.pending}>更新中…</span> : null}
    </div>
  );
}
