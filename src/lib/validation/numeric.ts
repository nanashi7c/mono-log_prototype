export const INTEGER_MAX = 2_147_483_647;
export const DECIMAL_10_0_MAX = 9_999_999_999;
export const DECIMAL_8_2_MAX = 999_999.99;

export type NumericValidationResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export type RequiredNumericValidationResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

type NumericOptions = {
  label: string;
  min: number;
  max: number;
};

type DecimalOptions = NumericOptions & {
  decimalPlaces: number;
  step?: number;
};

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 20 });
}

function rangeError(options: NumericOptions, suffix: string): string {
  return `${options.label}は${formatNumber(options.min)}以上${formatNumber(options.max)}以下の${suffix}で入力してください。`;
}

function normalize(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

export function parseOptionalInteger(
  value: unknown,
  options: NumericOptions,
): NumericValidationResult {
  const normalized = normalize(value);
  if (normalized === null) return { ok: true, value: null };
  if (normalized === undefined) {
    return { ok: false, error: rangeError(options, "整数") };
  }

  const numberValue = Number(normalized);
  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < options.min ||
    numberValue > options.max
  ) {
    return { ok: false, error: rangeError(options, "整数") };
  }

  return { ok: true, value: numberValue };
}

export function parseRequiredInteger(
  value: unknown,
  options: NumericOptions,
): RequiredNumericValidationResult {
  const result = parseOptionalInteger(value, options);
  if (!result.ok) return result;
  if (result.value == null) {
    return { ok: false, error: `${options.label}を入力してください。` };
  }
  return { ok: true, value: result.value };
}

export function parseOptionalDecimal(
  value: unknown,
  options: DecimalOptions,
): NumericValidationResult {
  const normalized = normalize(value);
  if (normalized === null) return { ok: true, value: null };
  if (normalized === undefined) {
    return {
      ok: false,
      error: rangeError(options, `小数点以下${options.decimalPlaces}桁以内の数値`),
    };
  }

  const match = normalized.match(/^[+-]?\d+(?:\.(\d+))?$/);
  const decimalDigits = match?.[1]?.length ?? 0;
  const numberValue = Number(normalized);
  if (
    !match ||
    !Number.isFinite(numberValue) ||
    decimalDigits > options.decimalPlaces ||
    numberValue < options.min ||
    numberValue > options.max
  ) {
    return {
      ok: false,
      error: rangeError(options, `小数点以下${options.decimalPlaces}桁以内の数値`),
    };
  }

  if (options.step != null) {
    const scale = 10 ** options.decimalPlaces;
    const scaledValue = Math.round(numberValue * scale);
    const scaledStep = Math.round(options.step * scale);
    if (scaledValue % scaledStep !== 0) {
      return {
        ok: false,
        error: `${options.label}は${formatNumber(options.step)}刻みで入力してください。`,
      };
    }
  }

  return { ok: true, value: numberValue };
}

export function fitsSignedDecimal10(value: number | null): boolean {
  return value == null || (Number.isSafeInteger(value) && Math.abs(value) <= DECIMAL_10_0_MAX);
}
