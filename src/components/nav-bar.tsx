import Link from "next/link";

export default function NavBar({ email }: { email: string | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          mono-log
        </Link>
        {email ? (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-slate-600 hover:text-slate-900">
              一覧
            </Link>
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
              ダッシュボード
            </Link>
            <Link href="/items/new" className="rounded-md bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600">
              + 追加
            </Link>
            <span className="hidden text-slate-400 sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-slate-500 hover:text-slate-800">
                ログアウト
              </button>
            </form>
          </nav>
        ) : (
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              ログイン
            </Link>
            <Link href="/signup" className="rounded-md bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600">
              新規登録
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
