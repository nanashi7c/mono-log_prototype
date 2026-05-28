"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-md bg-rose-50 p-4 text-sm text-rose-700">
      <p className="font-medium">エラーが発生しました</p>
      <p className="mt-1 text-rose-600">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded-md border border-rose-300 px-3 py-1 text-rose-700 hover:bg-rose-100"
      >
        再試行
      </button>
    </div>
  );
}
