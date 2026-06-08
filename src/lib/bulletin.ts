import type { BulletinRow, SacramentProgram } from "@/types";

export const SACRAMENT_ANCHOR_LABEL = "Administration of the Sacrament";

let counter = 0;
/** Unique id for a new row. Only call in event handlers / mock, never in render. */
export function newRowId(): string {
  counter += 1;
  return `row-${Date.now().toString(36)}-${counter}`;
}

export function makeRow(label = "", value = ""): BulletinRow {
  return { id: newRowId(), label, value: value || undefined };
}

/** A standard sacrament program used to seed a new bulletin. */
export function defaultBulletin(header: Partial<SacramentProgram> = {}): SacramentProgram {
  return {
    presiding: header.presiding,
    conducting: header.conducting,
    chorister: header.chorister,
    organist: header.organist,
    quote: header.quote,
    quoteBy: header.quoteBy,
    rows: [
      makeRow("Opening Hymn"),
      makeRow("Invocation"),
      makeRow("Sacrament Hymn"),
      { id: newRowId(), label: SACRAMENT_ANCHOR_LABEL, anchor: true },
      makeRow("First Speaker"),
      makeRow("Intermediate Hymn"),
      makeRow("Concluding Speaker"),
      makeRow("Closing Hymn"),
      makeRow("Benediction"),
    ],
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Index of the (single) sacrament anchor row, or -1. */
export function anchorIndex(rows: BulletinRow[]): number {
  return rows.findIndex((r) => r.anchor);
}

/**
 * Normalize arbitrary JSON — e.g. produced by the future AI agent — into a
 * valid SacramentProgram. Accepts a JSON string or a parsed object, tolerates
 * missing fields, and guarantees exactly one sacrament anchor row exists.
 */
export function parseBulletin(input: unknown): SacramentProgram {
  let obj: Record<string, unknown> | null = null;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch { obj = null; }
  } else if (input && typeof input === "object") {
    obj = input as Record<string, unknown>;
  }
  if (!obj) return defaultBulletin();

  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  let rows: BulletinRow[] = rawRows.map((r) => {
    const rr = (r ?? {}) as Record<string, unknown>;
    const label = typeof rr.label === "string" ? rr.label : "";
    const anchor = rr.anchor === true || label === SACRAMENT_ANCHOR_LABEL;
    return {
      id: typeof rr.id === "string" ? rr.id : newRowId(),
      label,
      value: str(rr.value),
      ...(anchor ? { anchor: true } : {}),
    };
  });

  // Guarantee exactly one anchor: collapse extras, insert one if missing.
  const anchors = rows.filter((r) => r.anchor);
  if (anchors.length === 0) {
    const mid = Math.floor(rows.length / 2);
    rows = [
      ...rows.slice(0, mid),
      { id: newRowId(), label: SACRAMENT_ANCHOR_LABEL, anchor: true },
      ...rows.slice(mid),
    ];
  } else if (anchors.length > 1) {
    let seen = false;
    rows = rows.map((r) => {
      if (!r.anchor) return r;
      if (seen) return { ...r, anchor: undefined };
      seen = true;
      return r;
    });
  }

  return {
    presiding: str(obj.presiding),
    conducting: str(obj.conducting),
    chorister: str(obj.chorister),
    organist: str(obj.organist),
    quote: str(obj.quote),
    quoteBy: str(obj.quoteBy),
    rows,
  };
}

// ── Sunday navigation helpers ────────────────────────────────────────────────

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST/timezone edge cases
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** The Sunday on or after the given date (returns the date itself if Sunday). */
export function upcomingSunday(iso: string): string {
  const d = toDate(iso);
  const add = (7 - d.getDay()) % 7; // getDay(): 0 = Sunday
  d.setDate(d.getDate() + add);
  return toISODate(d);
}

export function todayISODate(): string {
  return toISODate(new Date());
}

/** e.g. "Sunday, June 14, 2026" */
export function formatSunday(iso: string): string {
  return toDate(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
