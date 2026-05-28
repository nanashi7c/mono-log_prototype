// Listing profit/loss calculation per spec section 6.
// Each output is null when any of its required inputs is null (per the spec:
// 「入力値が未入力の場合は計算結果を非表示にします」).

export type CalcInput = {
  selling_price: number | null;
  packaging_cost: number | null;
  work_time_hours: number | null;
  labor_rate: number | null;
  // Looked up master values, not stored in `listings`.
  shipping_fee: number | null;
  platform_fee_rate: number | null;
};

export type CalcResult = {
  selling_fee: number | null;
  work_time_cost: number | null;
  operating_benefit: number | null;
  ordinary_profit: number | null;
  is_listing: boolean | null;
};

function r(n: number): number {
  return Math.round(n);
}

export function computeListingMetrics(input: CalcInput): CalcResult {
  const { selling_price, packaging_cost, work_time_hours, labor_rate, shipping_fee, platform_fee_rate } = input;

  const selling_fee =
    selling_price != null && platform_fee_rate != null ? r(selling_price * platform_fee_rate) : null;

  const work_time_cost =
    work_time_hours != null && labor_rate != null ? r(work_time_hours * labor_rate) : null;

  const operating_benefit =
    selling_price != null && shipping_fee != null && packaging_cost != null && selling_fee != null
      ? selling_price - shipping_fee - packaging_cost - selling_fee
      : null;

  const ordinary_profit =
    operating_benefit != null && work_time_cost != null ? operating_benefit - work_time_cost : null;

  const is_listing = ordinary_profit != null ? ordinary_profit >= 0 : null;

  return { selling_fee, work_time_cost, operating_benefit, ordinary_profit, is_listing };
}
