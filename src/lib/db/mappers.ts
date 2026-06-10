/**
 * Row ↔ model mapping for the Supabase data layer.
 *
 * The database uses snake_case columns; the app's TS types (in `@/types`) use
 * camelCase. These helpers convert between the two. Nested structures stored in
 * `jsonb` columns (agenda items, bulletin rows, ward leadership, roster entries,
 * task context, suggested replacements) keep their camelCase keys, because that
 * is exactly the shape the UI and types expect — so they pass through untouched.
 */

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Convert a (partial) camelCase model into a snake_case DB row for write. */
export function toRow(model: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(model)) {
    if (value === undefined) continue;
    row[camelToSnake(key)] = value;
  }
  return row;
}

/** Convert a snake_case DB row into a camelCase model. Null columns are dropped
 *  so that optional fields read as `undefined` rather than `null`. */
export function fromRow<T>(row: Record<string, unknown>): T {
  const model: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) continue;
    model[snakeToCamel(key)] = value;
  }
  return model as T;
}
