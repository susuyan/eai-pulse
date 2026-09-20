export type EvaluationGateMode = "change" | "operational";

export interface EvaluationContext {
  asOf: Date;
  gateMode: EvaluationGateMode;
  persist: boolean;
}

export function parseEvaluationInstant(value: string, field: string): Date {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!parts) throw new Error(`Invalid ${field}: ${value}`);
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth[month - 1] ?? 0) ||
    Number(parts[4]) > 23 ||
    Number(parts[5]) > 59 ||
    Number(parts[6]) > 59 ||
    Number(parts[8] ?? 0) > 23 ||
    Number(parts[9] ?? 0) > 59
  )
    throw new Error(`Invalid ${field}: ${value}`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ${field}: ${value}`);
  return new Date(timestamp);
}

export function isAtOrBefore(value: string | null, asOf: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= asOf.getTime();
}

export function isWithinPastWindow(value: string | null, asOf: Date, windowMs: number): boolean {
  if (!isAtOrBefore(value, asOf)) return false;
  const ageMs = asOf.getTime() - Date.parse(value as string);
  return ageMs <= windowMs;
}
