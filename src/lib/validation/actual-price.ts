import {
  INTEGER_MAX,
  parseOptionalInteger,
  type NumericValidationResult,
} from "@/lib/validation/numeric";

export const ACTUAL_PRICE_MAX = INTEGER_MAX;

export function parseActualPrice(value: unknown): NumericValidationResult {
  return parseOptionalInteger(value, {
    label: "購入価格",
    min: 0,
    max: ACTUAL_PRICE_MAX,
  });
}
