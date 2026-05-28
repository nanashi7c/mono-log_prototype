import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-2xl font-semibold">404</p>
      <p className="mt-2 text-slate-600">ページが見つかりません。</p>
      <Link href="/" className="mt-4 inline-block text-brand-600 hover:underline">
        ホームへ
      </Link>
    </div>
  );
}
