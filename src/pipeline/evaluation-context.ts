export type EvaluationGateMode = "change" | "operational";

export interface EvaluationContext {
  asOf: Date;
  gateMode: EvaluationGateMode;
  persist: boolean;
}

export function parseEvaluationInstant(value: string, field: string): Date {
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
