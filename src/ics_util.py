import os
import uuid
from datetime import datetime


def build_ics(
    summary: str,
    start_dt: str,
    end_dt: str,
    timezone: str = None,
    organizer_email: str = None,
    attendee_email: str = None,
    description: str = "",
) -> str:
    """Build an ICS calendar invite string.

    Args:
        summary: Event title.
        start_dt: Start time as 'YYYY-MM-DDTHH:MM:SS' (local time).
        end_dt: End time as 'YYYY-MM-DDTHH:MM:SS' (local time).
        timezone: IANA timezone (e.g. 'America/New_York'). Defaults to WARD_TIMEZONE.
        organizer_email: Organizer email for the invite.
        attendee_email: Attendee email to invite.
        description: Event description.

    Returns:
        ICS file content as a string.
    """
    tz = timezone or os.environ.get("WARD_TIMEZONE", "America/New_York")
    uid = f"{uuid.uuid4()}@alma"
    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    # Convert ISO datetime to ICS format: 20260322T100000
    start_ics = start_dt.replace("-", "").replace(":", "").replace("T", "T").split(".")[0]
    end_ics = end_dt.replace("-", "").replace(":", "").replace("T", "T").split(".")[0]

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ALMA//Interview Scheduler//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now}",
        f"DTSTART;TZID={tz}:{start_ics}",
        f"DTEND;TZID={tz}:{end_ics}",
        f"SUMMARY:{_escape(summary)}",
    ]

    if description:
        lines.append(f"DESCRIPTION:{_escape(description)}")

    if organizer_email:
        lines.append(f"ORGANIZER;CN=ALMA:mailto:{organizer_email}")

    if attendee_email:
        lines.append(
            f"ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;"
            f"RSVP=TRUE:mailto:{attendee_email}"
        )

    lines.extend([
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ])

    return "\r\n".join(lines) + "\r\n"


def _escape(text: str) -> str:
    """Escape special characters for ICS text fields."""
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
