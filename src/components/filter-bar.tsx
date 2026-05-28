"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Category } from "@/types/item";

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
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder="名前・メモ・タグで検索"
        defaultValue={currentQ}
        onChange={(e) => update({ q: e.target.value })}
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <select
        value={currentCategory}
        onChange={(e) => update({ category: e.target.value || null })}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      >
        <option value="">全カテゴリ</option>
        <option value="__none__">未分類</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending ? <span className="text-xs text-slate-400">更新中…</span> : null}
    </div>
  );
}
