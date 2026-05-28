const jpy = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

// Postgres `numeric` columns come back from supabase-js as strings to preserve precision;
// `integer` columns come back as JS numbers. Accept both for ergonomics.
export function formatYen(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return jpy.format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // value is `YYYY-MM-DD` from a date column; new Date() would shift by TZ — split instead.
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}/${m}/${d}`;
}
