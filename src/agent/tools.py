from datetime import datetime

from langchain_core.tools import tool

from src.db import get_db
from src.email_client import send_email as _smtp_send

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


# Global per-request context, set by the agent runner before each invocation
_say_fn = None
_slack_user_id = None


def set_request_context(say, slack_user_id):
    global _say_fn, _slack_user_id
    _say_fn = say
    _slack_user_id = slack_user_id


@tool
def add_to_interview_list(name: str, phone: str = "", email: str = "", reason: str = "") -> str:
    """Add a person to the interview list. Provide their name and optionally phone number, email, and a reason/note for the interview (e.g. 'new move-in', 'annual interview', 'temple recommend renewal')."""
    db = get_db()
    cursor = db.execute(
        "INSERT INTO members (name, phone, email) VALUES (?, ?, ?)",
        (name, phone or None, email or None),
    )
    member_id = cursor.lastrowid
    initial_note = ""
    if reason:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        initial_note = f"[{timestamp}] Added to list — {reason}"
    cursor = db.execute(
        "INSERT INTO interviews (member_id, status, created_by, notes) VALUES (?, 'pending', ?, ?)",
        (member_id, _slack_user_id, initial_note or None),
    )
    db.commit()
    interview_id = cursor.lastrowid
    db.close()
    return f"Added {name} to the interview list (Interview #{interview_id})."


@tool
def remove_from_interview_list(interview_id: int) -> str:
    """Remove a person from the interview list by their interview ID."""
    db = get_db()
    row = db.execute(
        "SELECT i.id, m.name FROM interviews i JOIN members m ON i.member_id = m.id WHERE i.id = ?",
        (interview_id,),
    ).fetchone()
    if not row:
        db.close()
        return f"Interview #{interview_id} not found."
    name = row["name"]
    db.execute("DELETE FROM interviews WHERE id = ?", (interview_id,))
    db.commit()
    db.close()
    return f"Removed {name} (Interview #{interview_id}) from the interview list."


@tool
def get_interview_list(status_filter: str = "all") -> str:
    """Get the list of people who need interviews. Filter by status: all, pending, contacted, scheduled, completed, no_show, follow_up."""
    db = get_db()
    if status_filter == "all":
        rows = db.execute(
            """
            SELECT i.id, m.name, m.phone, m.email, i.status, i.contacted_at, i.scheduled_at, i.notes
            FROM interviews i JOIN members m ON i.member_id = m.id
            ORDER BY i.created_at DESC
            """
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT i.id, m.name, m.phone, m.email, i.status, i.contacted_at, i.scheduled_at
            FROM interviews i JOIN members m ON i.member_id = m.id
            WHERE i.status = ?
            ORDER BY i.created_at DESC
            """,
            (status_filter,),
        ).fetchall()
    db.close()

    if not rows:
        if status_filter == "all":
            return "The interview list is empty."
        return f"No interviews with status '{status_filter}'."

    lines = []
    for r in rows:
        parts = [f"#{r['id']} — *{r['name']}* ({r['status']})"]
        if r["phone"]:
            parts.append(f"Phone: {r['phone']}")
        if r["email"]:
            parts.append(f"Email: {r['email']}")
        if r["contacted_at"]:
            parts.append(f"Contacted: {r['contacted_at']}")
        if r["scheduled_at"]:
            parts.append(f"Scheduled: {r['scheduled_at']}")
        if r["notes"]:
            parts.append(f"Notes: {r['notes']}")
        lines.append(" | ".join(parts))

    return f"*Interview List* ({len(rows)} total):\n" + "\n".join(f"• {line}" for line in lines)


@tool
def send_email(to_email: str, subject: str, body: str, interview_id: int = 0) -> str:
    """Send a real email via ALMA's email account. Provide the recipient email, subject, and body.
    If this is about an interview, include the interview_id to automatically update the interview status to 'contacted'."""
    try:
        _smtp_send(to_email, subject, body)
    except Exception as e:
        return f"Failed to send email to {to_email}: {e}"

    result = f"Email sent to {to_email}."

    if interview_id:
        db = get_db()
        db.execute(
            "UPDATE interviews SET status = 'contacted', contacted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (interview_id,),
        )
        db.execute(
            "INSERT INTO contact_log (interview_id, method, confirmed_sent) VALUES (?, 'email', 1)",
            (interview_id,),
        )
        db.commit()
        db.close()
        result += f" Interview #{interview_id} status updated to *contacted*."

    return result


@tool
def update_notes(interview_id: int, notes: str) -> str:
    """Update the notes for an interview. Use this to record correspondence, interview purpose, scheduling details, or any other relevant information. New notes are appended with a timestamp."""
    db = get_db()
    row = db.execute(
        """
        SELECT i.id, i.notes, m.name
        FROM interviews i JOIN members m ON i.member_id = m.id
        WHERE i.id = ?
        """,
        (interview_id,),
    ).fetchone()
    if not row:
        db.close()
        return f"Interview #{interview_id} not found."

    existing = row["notes"] or ""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    updated = f"{existing}\n[{timestamp}] {notes}".strip()

    db.execute("UPDATE interviews SET notes = ? WHERE id = ?", (updated, interview_id))
    db.commit()
    db.close()
    return f"Notes updated for {row['name']} (Interview #{interview_id})."


def _resolve_bishopric_member(db, role_or_name: str):
    """Look up a bishopric member by role or name (case-insensitive)."""
    row = db.execute(
        "SELECT * FROM bishopric_members WHERE LOWER(role) = LOWER(?) OR LOWER(name) = LOWER(?)",
        (role_or_name, role_or_name),
    ).fetchone()
    return row


def _generate_blocks(start_time: str, end_time: str) -> list[str]:
    """Generate 15-minute block times from start_time to end_time (exclusive of end).
    Times in 'HH:MM' 24h format."""
    blocks = []
    sh, sm = int(start_time[:2]), int(start_time[3:5])
    eh, em = int(end_time[:2]), int(end_time[3:5])
    start_mins = sh * 60 + sm
    end_mins = eh * 60 + em
    current = start_mins
    while current < end_mins:
        h, m = divmod(current, 60)
        blocks.append(f"{h:02d}:{m:02d}")
        current += 15
    return blocks


def _collapse_blocks(block_times: list[str]) -> list[str]:
    """Collapse sorted 15-min block times into human-readable ranges."""
    if not block_times:
        return []
    ranges = []
    start = block_times[0]
    prev = block_times[0]
    for bt in block_times[1:]:
        prev_mins = int(prev[:2]) * 60 + int(prev[3:5])
        curr_mins = int(bt[:2]) * 60 + int(bt[3:5])
        if curr_mins - prev_mins == 15:
            prev = bt
        else:
            end_mins = int(prev[:2]) * 60 + int(prev[3:5]) + 15
            eh, em = divmod(end_mins, 60)
            ranges.append(f"{_fmt_time(start)} - {_fmt_time(f'{eh:02d}:{em:02d}')}")
            start = bt
            prev = bt
    end_mins = int(prev[:2]) * 60 + int(prev[3:5]) + 15
    eh, em = divmod(end_mins, 60)
    ranges.append(f"{_fmt_time(start)} - {_fmt_time(f'{eh:02d}:{em:02d}')}")
    return ranges


def _fmt_time(t: str) -> str:
    """Convert 'HH:MM' to '8:00am' style."""
    h, m = int(t[:2]), int(t[3:5])
    suffix = "am" if h < 12 else "pm"
    display_h = h if h <= 12 else h - 12
    if display_h == 0:
        display_h = 12
    return f"{display_h}:{m:02d}{suffix}"


@tool
def add_bishopric_member(name: str, role: str, email: str = "", phone: str = "", slack_id: str = "") -> str:
    """Add a bishopric member. Role must be one of: bishop, first_counselor, second_counselor, exec_secretary. Most members communicate via email, not Slack. Provide email and/or phone."""
    role_lower = role.lower().replace(" ", "_")
    valid_roles = ["bishop", "first_counselor", "second_counselor", "exec_secretary"]
    if role_lower not in valid_roles:
        return f"Invalid role '{role}'. Must be one of: {', '.join(valid_roles)}"
    db = get_db()
    existing = db.execute(
        "SELECT * FROM bishopric_members WHERE LOWER(name) = LOWER(?) OR LOWER(role) = LOWER(?)",
        (name, role_lower),
    ).fetchone()
    if existing:
        db.close()
        return f"A member already exists with that name or role: {existing['name']} ({existing['role']}). Use update_bishopric_member to modify."
    db.execute(
        "INSERT INTO bishopric_members (slack_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?)",
        (slack_id or None, name, role_lower, email or None, phone or None),
    )
    db.commit()
    db.close()
    return f"Added {name} as {role_lower}." + (f" Email: {email}" if email else "") + (f" Phone: {phone}" if phone else "")


@tool
def update_bishopric_member(role_or_name: str, name: str = "", email: str = "", phone: str = "", slack_id: str = "") -> str:
    """Update a bishopric member's contact info. Look up by role or name, then update any provided fields."""
    db = get_db()
    member = _resolve_bishopric_member(db, role_or_name)
    if not member:
        db.close()
        return f"Bishopric member '{role_or_name}' not found."
    updates = []
    params = []
    if name:
        updates.append("name = ?")
        params.append(name)
    if email:
        updates.append("email = ?")
        params.append(email)
    if phone:
        updates.append("phone = ?")
        params.append(phone)
    if slack_id:
        updates.append("slack_id = ?")
        params.append(slack_id)
    if not updates:
        db.close()
        return "No fields to update. Provide at least one of: name, email, phone, slack_id."
    params.append(member["id"])
    db.execute(f"UPDATE bishopric_members SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    db.close()
    return f"Updated {member['name']} ({member['role']})."


@tool
def remove_bishopric_member(role_or_name: str) -> str:
    """Remove a bishopric member and all their availability data."""
    db = get_db()
    member = _resolve_bishopric_member(db, role_or_name)
    if not member:
        db.close()
        return f"Bishopric member '{role_or_name}' not found."
    db.execute("DELETE FROM availability_overrides WHERE bishopric_member_id = ?", (member["id"],))
    db.execute("DELETE FROM availability_blocks WHERE bishopric_member_id = ?", (member["id"],))
    db.execute("DELETE FROM bishopric_members WHERE id = ?", (member["id"],))
    db.commit()
    db.close()
    return f"Removed {member['name']} ({member['role']}) and all their availability data."


@tool
def get_bishopric_members() -> str:
    """List all registered bishopric members with their contact info."""
    db = get_db()
    rows = db.execute("SELECT * FROM bishopric_members ORDER BY role").fetchall()
    db.close()
    if not rows:
        return "No bishopric members registered. Use add_bishopric_member to add them."
    lines = []
    for r in rows:
        parts = [f"*{r['name']}* — {r['role']}"]
        if r["email"]:
            parts.append(f"Email: {r['email']}")
        if r["phone"]:
            parts.append(f"Phone: {r['phone']}")
        if r["slack_id"]:
            parts.append(f"Slack: <@{r['slack_id']}>")
        lines.append(" | ".join(parts))
    return f"*Bishopric Members* ({len(rows)}):\n" + "\n".join(f"• {line}" for line in lines)


@tool
def set_availability(role_or_name: str, day_of_week: str, start_time: str, end_time: str) -> str:
    """Set recurring weekly availability for a bishopric member. Replaces any existing blocks for that day.
    day_of_week: e.g. 'sunday', 'wednesday'.
    start_time/end_time: 24h format 'HH:MM' e.g. '08:00', '12:00'. Blocks are 15 minutes each."""
    day_lower = day_of_week.lower()
    if day_lower not in DAY_NAMES:
        return f"Invalid day '{day_of_week}'. Use: {', '.join(DAY_NAMES)}"
    day_num = DAY_NAMES.index(day_lower)

    blocks = _generate_blocks(start_time, end_time)
    if not blocks:
        return f"No valid blocks between {start_time} and {end_time}."

    db = get_db()
    member = _resolve_bishopric_member(db, role_or_name)
    if not member:
        db.close()
        return f"Bishopric member '{role_or_name}' not found. Register them first with register_bishopric_member."

    # Delete existing blocks for this member+day, then insert new ones
    db.execute(
        "DELETE FROM availability_blocks WHERE bishopric_member_id = ? AND day_of_week = ?",
        (member["id"], day_num),
    )
    for bt in blocks:
        db.execute(
            "INSERT INTO availability_blocks (bishopric_member_id, day_of_week, block_time) VALUES (?, ?, ?)",
            (member["id"], day_num, bt),
        )
    db.commit()
    db.close()

    return f"Set {member['name']}'s availability for {day_lower.capitalize()}: {_fmt_time(start_time)} - {_fmt_time(end_time)} ({len(blocks)} blocks)."


@tool
def remove_availability(role_or_name: str, day_of_week: str = "", start_time: str = "", end_time: str = "") -> str:
    """Remove recurring availability for a bishopric member. If day_of_week given with times, removes that range. If only day_of_week, removes all blocks for that day. If nothing, removes all availability."""
    db = get_db()
    member = _resolve_bishopric_member(db, role_or_name)
    if not member:
        db.close()
        return f"Bishopric member '{role_or_name}' not found."

    if not day_of_week:
        db.execute("DELETE FROM availability_blocks WHERE bishopric_member_id = ?", (member["id"],))
        db.commit()
        db.close()
        return f"Removed all availability for {member['name']}."

    day_lower = day_of_week.lower()
    if day_lower not in DAY_NAMES:
        db.close()
        return f"Invalid day '{day_of_week}'."
    day_num = DAY_NAMES.index(day_lower)

    if start_time and end_time:
        blocks = _generate_blocks(start_time, end_time)
        for bt in blocks:
            db.execute(
                "DELETE FROM availability_blocks WHERE bishopric_member_id = ? AND day_of_week = ? AND block_time = ?",
                (member["id"], day_num, bt),
            )
    else:
        db.execute(
            "DELETE FROM availability_blocks WHERE bishopric_member_id = ? AND day_of_week = ?",
            (member["id"], day_num),
        )

    db.commit()
    db.close()
    return f"Removed availability for {member['name']} on {day_lower.capitalize()}."


@tool
def add_availability_override(role_or_name: str, start_date: str, end_date: str, reason: str = "") -> str:
    """Mark a bishopric member as unavailable for a date range. Use for vacations, out of town, etc.
    Dates in 'YYYY-MM-DD' format."""
    db = get_db()
    member = _resolve_bishopric_member(db, role_or_name)
    if not member:
        db.close()
        return f"Bishopric member '{role_or_name}' not found."

    db.execute(
        "INSERT INTO availability_overrides (bishopric_member_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)",
        (member["id"], start_date, end_date, reason or ""),
    )
    db.commit()
    db.close()
    return f"Marked {member['name']} as unavailable {start_date} to {end_date}" + (f" ({reason})" if reason else "") + "."


@tool
def remove_availability_override(override_id: int) -> str:
    """Remove an availability override by its ID."""
    db = get_db()
    row = db.execute("SELECT o.id, b.name FROM availability_overrides o JOIN bishopric_members b ON o.bishopric_member_id = b.id WHERE o.id = ?", (override_id,)).fetchone()
    if not row:
        db.close()
        return f"Override #{override_id} not found."
    db.execute("DELETE FROM availability_overrides WHERE id = ?", (override_id,))
    db.commit()
    db.close()
    return f"Removed override #{override_id} for {row['name']}."


@tool
def get_availability(role_or_name: str = "") -> str:
    """Get the availability schedule for one or all bishopric members. Shows recurring weekly schedule and any active overrides (upcoming unavailable date ranges)."""
    db = get_db()

    if role_or_name:
        members = [_resolve_bishopric_member(db, role_or_name)]
        if not members[0]:
            db.close()
            return f"Bishopric member '{role_or_name}' not found."
    else:
        members = db.execute("SELECT * FROM bishopric_members ORDER BY role").fetchall()
        if not members:
            db.close()
            return "No bishopric members registered."

    today = datetime.now().strftime("%Y-%m-%d")
    lines = []
    for member in members:
        lines.append(f"*{member['name']}* ({member['role']})")

        # Get recurring blocks grouped by day
        blocks = db.execute(
            "SELECT day_of_week, block_time FROM availability_blocks WHERE bishopric_member_id = ? ORDER BY day_of_week, block_time",
            (member["id"],),
        ).fetchall()

        if blocks:
            days = {}
            for b in blocks:
                days.setdefault(b["day_of_week"], []).append(b["block_time"])
            for day_num in sorted(days.keys()):
                ranges = _collapse_blocks(days[day_num])
                day_name = DAY_NAMES[day_num].capitalize()
                lines.append(f"  {day_name}: {', '.join(ranges)}")
        else:
            lines.append("  No recurring availability set.")

        # Get active overrides
        overrides = db.execute(
            "SELECT id, start_date, end_date, reason FROM availability_overrides WHERE bishopric_member_id = ? AND end_date >= ? ORDER BY start_date",
            (member["id"], today),
        ).fetchall()
        if overrides:
            lines.append("  _Unavailable:_")
            for o in overrides:
                reason = f" — {o['reason']}" if o["reason"] else ""
                lines.append(f"  Override #{o['id']}: {o['start_date']} to {o['end_date']}{reason}")

        lines.append("")

    db.close()
    return "\n".join(lines).strip()


ALL_TOOLS = [
    add_to_interview_list,
    remove_from_interview_list,
    get_interview_list,
    send_email,
    update_notes,
    add_bishopric_member,
    update_bishopric_member,
    remove_bishopric_member,
    get_bishopric_members,
    set_availability,
    remove_availability,
    add_availability_override,
    remove_availability_override,
    get_availability,
]
