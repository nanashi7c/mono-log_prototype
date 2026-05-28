const jpy = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export function formatYen(value: number | null | undefined): string {
  if (value == null) return "—";
  return jpy.format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // value is `YYYY-MM-DD` from a date column; new Date() would shift by TZ — split instead.
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}/${m}/${d}`;
}
