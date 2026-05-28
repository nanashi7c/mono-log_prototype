import { importBackup } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">JSON インポート</h1>
      <p className="text-sm text-slate-600">
        エクスポートした JSON を読み込み、自分のアカウントに追加します。既存データは保持され、新しい id で重複登録される可能性があります。
      </p>

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{decodeURIComponent(error)}</p>
      ) : null}
      {ok ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{decodeURIComponent(ok)}</p>
      ) : null}

      <form action={importBackup} encType="multipart/form-data" className="space-y-3">
        <input
          name="file"
          type="file"
          accept="application/json"
          required
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-700"
        />
        <button type="submit" className="rounded-md bg-brand-500 px-4 py-2 text-white hover:bg-brand-600">
          インポート
        </button>
      </form>
    </div>
  );
}
