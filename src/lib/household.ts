/**
 * Household grouping for tithing settlement.
 *
 * Tithing settlement is booked one appointment per household: every member of a
 * household receives the same booking link and the household schedules a single
 * slot. Members are grouped by `householdId` (shared across a household); a
 * member without one is their own household of one, so the settlement flow keeps
 * working unchanged until household data is on the roster.
 *
 * The head of household is the link/appointment's representative — flagged via
 * `isHeadOfHousehold` on the roster, with a deterministic fallback when it isn't
 * set so a household always resolves to exactly one head.
 */

import type { Member } from "@/types";

/** The key that groups members into one household. Members sharing a value are
 *  one household; a member without a `householdId` is a household of one. */
export function householdKey(m: Pick<Member, "id" | "householdId">): string {
  return m.householdId?.trim() ? m.householdId : m.id;
}

function fullName(m: Member): string {
  return `${m.firstName} ${m.lastName}`;
}

/**
 * The head of a household group: the member flagged `isHeadOfHousehold`, else
 * the member whose id equals the household key (a self-referential head), else
 * the first member by name. Always returns a member for a non-empty group.
 */
export function headOfHousehold(members: Member[]): Member {
  return (
    members.find((m) => m.isHeadOfHousehold) ??
    members.find((m) => m.id === householdKey(m)) ??
    [...members].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
    )[0]
  );
}

/** Every member sharing a member's household (including the member itself),
 *  drawn from `all` (typically the active roster). */
export function householdMembersOf(m: Member, all: Member[]): Member[] {
  const key = householdKey(m);
  const group = all.filter((x) => householdKey(x) === key);
  // `m` may not be in `all` (e.g. inactive) — make sure it's covered.
  return group.some((x) => x.id === m.id) ? group : [m, ...group];
}

/** A human label for a household: "the Smith household" for a family, or just
 *  the person's name for a household of one. */
export function householdLabel(head: Member, size: number): string {
  return size > 1 ? `the ${head.lastName} household` : fullName(head);
}

/**
 * The parents of a household — the head of house and the spouse of head, as
 * flagged on the roster. Settlement emails go to the parents. Falls back to the
 * head (and then to everyone) when no parent is flagged, so a household is never
 * left with no one to email.
 */
export function householdParents(members: Member[]): Member[] {
  const parents = members.filter((m) => m.isHouseholdParent);
  if (parents.length) return parents;
  const head = members.find((m) => m.isHeadOfHousehold);
  return head ? [head] : members;
}

/** The household key a booking token covers, tolerating legacy per-member tokens
 *  that predate household fields (their key is their member/household of one). */
export function tokenHouseholdKey(t: {
  householdId?: string;
  memberId?: string;
  id: string;
}): string {
  return t.householdId?.trim() ? t.householdId : t.memberId ?? t.id;
}
