import Link from "next/link";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-6 text-2xl font-semibold">新規登録</h1>
      <form action={signup} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">メール</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">パスワード（6文字以上）</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-rose-600">{decodeURIComponent(error)}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{decodeURIComponent(message)}</p> : null}
        <button
          type="submit"
          className="w-full rounded-md bg-brand-500 px-3 py-2 text-white hover:bg-brand-600"
        >
          登録
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        登録済みの方は{" "}
        <Link href="/login" className="text-brand-600 hover:underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
