import type { MeetingType } from "@/types";

/**
 * The standard ordered section headings for each kind of meeting, mirroring the
 * ward's Ward Council / Bishopric agenda formats. A new bishopric or ward
 * council meeting seeds `Meeting.sections` from this list; agenda items are then
 * grouped under these headings in build mode and meeting mode.
 *
 * Sacrament meetings use the structured `program` (bulletin) instead, so they
 * have no agenda sections.
 */
export const AGENDA_SECTIONS: Record<MeetingType, string[]> = {
  bishopric: [
    "Opening",
    "Action Item Review",
    "People",
    "Leadership & Callings",
    "Upcoming Ordinances & Meetings",
    "Strategic Discussion",
    "New Business",
    "Meeting Summary",
  ],
  ward_council: [
    "Opening",
    "Action Item Review",
    "Ministering & Member Needs",
    "Upcoming Events & Calendar Coordination",
    "Organization Updates",
    "Strategic Discussion",
    "New Business",
    "Meeting Summary",
  ],
  sacrament_meeting: [],
};

/**
 * The section organization leaders report into for the pre-meeting collection.
 * Items reported by each organization land under this section.
 */
export const ORG_UPDATES_SECTION: Record<MeetingType, string | undefined> = {
  bishopric: undefined,
  ward_council: "Organization Updates",
  sacrament_meeting: undefined,
};
