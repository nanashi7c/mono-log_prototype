import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const { error, redirect } = await searchParams;

  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-6 text-2xl font-semibold">ログイン</h1>
      <form action={login} className="space-y-4">
        {redirect ? <input type="hidden" name="redirect" value={redirect} /> : null}
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
          <span className="mb-1 block text-sm text-slate-600">パスワード</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-rose-600">{decodeURIComponent(error)}</p> : null}
        <button
          type="submit"
          className="w-full rounded-md bg-brand-500 px-3 py-2 text-white hover:bg-brand-600"
        >
          ログイン
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="text-brand-600 hover:underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}
