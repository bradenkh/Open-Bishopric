import type { Calling, WardInfo } from "@/types";

/**
 * Default ward details, seeded from the Schenectady Ward bulletin. These are
 * editable at runtime (ward settings) — they live here so there's a sensible
 * starting point before a backend exists.
 */
export const DEFAULT_WARD_INFO: WardInfo = {
  wardName: "Schenectady Ward",
  churchName: "The Church of Jesus Christ of Latter-Day Saints",
  stake: "Albany New York Stake",
  address: "52 Blue Barns Rd., Rexford, NY",
  meetingTitle: "Schenectady Sacrament Meeting",
  meetingTime: "9 a.m.",
  secondHour: "Sunday School",
  leadership: [
    { name: "Jay Phillips",      role: "Bishop",        phone: "(518) 545-9256" },
    { name: "Blaine Bringhurst", role: "1st Counselor", phone: "(518) 698-1106" },
    { name: "Scott Davenport",   role: "2nd Counselor", phone: "(503) 860-9364" },
  ],
  submissionNote:
    "To make an appointment with the Bishop or submit announcements for the Ward Bulletin, " +
    "please contact Braden Hansen via text at (208) 243-1193 or via email at bradenhnsn@gmail.com.",
};

export interface WardBusinessItem {
  callingId: string;
  /** "sustaining" — new callings to be sustained. (Releases not yet modeled.) */
  action: "sustain";
  line: string;
}

/**
 * Ward business to be conducted in sacrament meeting: callings sitting in the
 * "sustaining" stage that are slated for sacrament meeting. These become the
 * sustaining lines read during ward business.
 */
export function deriveWardBusiness(callings: Calling[]): WardBusinessItem[] {
  return callings
    .filter((c) => c.stage === "sustaining" && c.sustainedIn === "sacrament_meeting" && c.memberName)
    .map((c) => ({
      callingId: c.id,
      action: "sustain" as const,
      line: `${c.memberName} — ${c.position}`,
    }));
}
