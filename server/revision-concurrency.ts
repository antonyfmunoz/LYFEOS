export type ExpectedResourceRevision =
  | { ok: true; revision: number }
  | { ok: false; reason: "missing" | "invalid" };

export function parseExpectedResourceRevision(value: string | undefined): ExpectedResourceRevision {
  if (value === undefined) return { ok: false, reason: "missing" };
  if (!/^[1-9]\d{0,9}$/.test(value)) return { ok: false, reason: "invalid" };
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? { ok: true, revision } : { ok: false, reason: "invalid" };
}
