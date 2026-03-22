import json
import logging
from datetime import datetime

from langchain_core.tools import tool

from src.db import get_db
from src.email_client import send_email as _smtp_send

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

logger = logging.getLogger(__name__)

# Global per-request context, set by the agent runner before each invocation
_say_fn = None
_slack_user_id = None
_slack_client = None


def set_request_context(say, slack_user_id, client=None):
    global _say_fn, _slack_user_id, _slack_client
    _say_fn = say
    _slack_user_id = slack_user_id
    _slack_client = client


# ---------------------------------------------------------------------------
# Task management tools
# ---------------------------------------------------------------------------

@tool
def create_task(task_type: str, summary: str, context_json: str = "{}") -> str:
    """Create a task to track a multi-step workflow.
    task_type: 'schedule_interview', 'follow_up', 'contact', 'general'.
    summary: brief human-readable description (e.g. 'Schedule interview for John Doe with Bishop').
    context_json: JSON object with workflow state. For schedule_interview include at minimum:
      member_name, member_email, interviewer_role, reason. Other useful fields:
      member_phone, step, proposed_times, scheduled_at, notes (list of strings)."""
    valid_types = ["schedule_interview", "follow_up", "contact", "general"]
    if task_type not in valid_types:
        return f"Invalid task_type '{task_type}'. Must be one of: {', '.join(valid_types)}"

    # Validate context is valid JSON
    try:
        ctx = json.loads(context_json)
    except json.JSONDecodeError:
        return "Invalid context_json — must be valid JSON."

    db = get_db()
    cursor = db.execute(
        "INSERT INTO tasks (task_type, status, summary, context, created_by, notify_channel) "
        "VALUES (?, 'active', ?, ?, ?, ?)",
        (task_type, summary, json.dumps(ctx), _slack_user_id, None),
    )
    task_id = cursor.lastrowid
    db.commit()
    db.close()
    return f"Created task #{task_id}: {summary}"


@tool
def update_task(task_id: int, status: str = "", context_json: str = "", summary: str = "") -> str:
    """Update a task's status, context, and/or summary.
    status: 'active', 'waiting_reply', 'completed', 'cancelled'.
    context_json: full replacement JSON for the context field.
    summary: updated summary text."""
    db = get_db()
    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        db.close()
        return f"Task #{task_id} not found."

    updates = ["updated_at = CURRENT_TIMESTAMP"]
    params = []

    if status:
        valid = ["active", "waiting_reply", "completed", "cancelled"]
        if status not in valid:
            db.close()
            return f"Invalid status '{status}'. Must be one of: {', '.join(valid)}"
        updates.append("status = ?")
        params.append(status)

    if context_json:
        try:
            json.loads(context_json)
        except json.JSONDecodeError:
            db.close()
            return "Invalid context_json — must be valid JSON."
        updates.append("context = ?")
        params.append(context_json)

    if summary:
        updates.append("summary = ?")
        params.append(summary)

    params.append(task_id)
    db.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    db.close()
    return f"Updated task #{task_id}."


@tool
def get_tasks(task_type: str = "", status: str = "") -> str:
    """List tasks, optionally filtered by task_type and/or status.
    task_type: 'schedule_interview', 'follow_up', 'contact', 'general' or '' for all.
    status: 'active', 'waiting_reply', 'completed', 'cancelled' or '' for all."""
    db = get_db()
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if task_type:
        query += " AND task_type = ?"
        params.append(task_type)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    rows = db.execute(query, params).fetchall()
    db.close()

    if not rows:
        filters = []
        if task_type:
            filters.append(f"type={task_type}")
        if status:
            filters.append(f"status={status}")
        filter_str = f" ({', '.join(filters)})" if filters else ""
        return f"No tasks found{filter_str}."

    lines = []
    for r in rows:
        ctx = json.loads(r["context"])
        parts = [f"#{r['id']} — *{r['summary']}* [{r['status']}]"]
        if ctx.get("member_name"):
            parts.append(f"Member: {ctx['member_name']}")
        if ctx.get("member_email"):
            parts.append(f"Email: {ctx['member_email']}")
        if ctx.get("step"):
            parts.append(f"Step: {ctx['step']}")
        if ctx.get("scheduled_at"):
            parts.append(f"Scheduled: {ctx['scheduled_at']}")
        lines.append(" | ".join(parts))

    return f"*Tasks* ({len(rows)}):\n" + "\n".join(f"• {line}" for line in lines)


@tool
def complete_task(task_id: int) -> str:
    """Mark a task as completed."""
    db = get_db()
    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        db.close()
        return f"Task #{task_id} not found."
    db.execute(
        "UPDATE tasks SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (task_id,),
    )
    db.commit()
    db.close()
    return f"Task #{task_id} marked as completed."


# ---------------------------------------------------------------------------
# Email tool
# ---------------------------------------------------------------------------

@tool
def send_email(to_email: str, subject: str, body: str, task_id: int = 0) -> str:
    """Send a real email via ALMA's email account. Provide the recipient email, subject, and body.
    If this is part of a task, include the task_id so replies can be automatically matched back.
    After sending, the task status will be updated to 'waiting_reply'."""
    tid = task_id if task_id else None
    try:
        message_id = _smtp_send(to_email, subject, body, task_id=tid)
    except Exception as e:
        return f"Failed to send email to {to_email}: {e}"

    result = f"Email sent to {to_email} (Message-ID: {message_id})."

    if task_id:
        db = get_db()
        # Update task status to waiting_reply and add note
        row = db.execute("SELECT context FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row:
            ctx = json.loads(row["context"])
            notes = ctx.get("notes", [])
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            notes.append(f"[{timestamp}] Email sent to {to_email}: {subject}")
            ctx["step"] = "waiting_for_reply"
            ctx["notes"] = notes
            db.execute(
                "UPDATE tasks SET status = 'waiting_reply', context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (json.dumps(ctx), task_id),
            )
            db.commit()
        db.close()
        result += f" Task #{task_id} status updated to *waiting_reply*."

    return result


# ---------------------------------------------------------------------------
# Bishopric member tools (unchanged)
# ---------------------------------------------------------------------------

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
    """Add a bishopric member. Role must be one of: bishop, first_counselor, second_counselor, exec_secretary. Provide email and/or phone. Provide slack_id so ALMA can DM them for scheduling confirmations."""
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


# ---------------------------------------------------------------------------
# Availability tools (unchanged)
# ---------------------------------------------------------------------------

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
        return f"Bishopric member '{role_or_name}' not found. Register them first with add_bishopric_member."

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


# ---------------------------------------------------------------------------
# Scheduling tools (task-based)
# ---------------------------------------------------------------------------

@tool
def ask_bishopric_member(role_or_name: str, task_id: int, proposed_times: str) -> str:
    """Send a Slack DM to a bishopric member asking them to pick a time for an interview.
    The member will see buttons for each proposed time and can select one or decline all.
    role_or_name: the bishopric member (e.g. 'bishop' or their name).
    task_id: the task tracking this interview.
    proposed_times: JSON list of time strings in 'YYYY-MM-DD HH:MM' format, e.g. '["2026-03-22 10:00", "2026-03-22 11:00"]'."""
    if not _slack_client:
        return "Slack client not available. Cannot send DMs."

    try:
        times = json.loads(proposed_times)
    except json.JSONDecodeError:
        return "Invalid proposed_times format. Provide a JSON list of 'YYYY-MM-DD HH:MM' strings."

    if not times:
        return "No times provided."

    db = get_db()
    member = _resolve_bishopric_member(db, role_or_name)
    if not member:
        db.close()
        return f"Bishopric member '{role_or_name}' not found."
    if not member["slack_id"]:
        db.close()
        return f"{member['name']} does not have a Slack ID set. Use update_bishopric_member to set their slack_id first."

    task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        db.close()
        return f"Task #{task_id} not found."

    ctx = json.loads(task["context"])
    member_name = ctx.get("member_name", "someone")

    # Update task context with proposed times and step
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    notes = ctx.get("notes", [])
    notes.append(f"[{timestamp}] Asked {member['name']} to pick a time: {', '.join(times)}")
    ctx["step"] = "waiting_for_bishopric_confirmation"
    ctx["proposed_times"] = times
    ctx["notes"] = notes
    db.execute(
        "UPDATE tasks SET context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (json.dumps(ctx), task_id),
    )
    db.commit()

    # Build Block Kit message with time buttons
    # Encode task_id into button values so scheduling actions can find the task
    time_buttons = []
    for t in times:
        dt = datetime.strptime(t, "%Y-%m-%d %H:%M")
        time_str = _fmt_time(dt.strftime("%H:%M"))
        label = dt.strftime(f"%a %b %d, {time_str}")
        time_buttons.append({
            "type": "button",
            "text": {"type": "plain_text", "text": label},
            "style": "primary",
            "action_id": "schedule_select",
            "value": f"{task_id}|{t}",
        })

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"Hi! Can you do any of these times for an interview with *{member_name}*?",
            },
        },
        {
            "type": "actions",
            "elements": time_buttons + [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "None of these work"},
                    "style": "danger",
                    "action_id": "schedule_reject",
                    "value": str(task_id),
                },
            ],
        },
    ]

    try:
        _slack_client.chat_postMessage(
            channel=member["slack_id"],
            text=f"Can you do any of these times for an interview with {member_name}?",
            blocks=blocks,
        )
    except Exception as e:
        db.close()
        return f"Failed to send DM to {member['name']}: {e}"

    db.close()
    return f"Sent scheduling options to {member['name']} for interview with {member_name} (Task #{task_id}). Waiting for their response."


@tool
def get_pending_schedules() -> str:
    """Get all tasks that are waiting for a reply or in an active scheduling step."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM tasks WHERE status IN ('active', 'waiting_reply') ORDER BY created_at DESC"
    ).fetchall()
    db.close()

    if not rows:
        return "No active or waiting tasks."

    lines = []
    for r in rows:
        ctx = json.loads(r["context"])
        status_icon = {"active": ":gear:", "waiting_reply": ":hourglass:"}.get(r["status"], "")
        line = f"#{r['id']} {status_icon} *{r['summary']}* [{r['status']}]"
        if ctx.get("step"):
            line += f" — step: {ctx['step']}"
        lines.append(line)

    return f"*Active/Waiting Tasks* ({len(rows)}):\n" + "\n".join(f"• {line}" for line in lines)


ALL_TOOLS = [
    # Task management
    create_task,
    update_task,
    get_tasks,
    complete_task,
    # Email
    send_email,
    # Bishopric members
    add_bishopric_member,
    update_bishopric_member,
    remove_bishopric_member,
    get_bishopric_members,
    # Availability
    set_availability,
    remove_availability,
    add_availability_override,
    remove_availability_override,
    get_availability,
    # Scheduling
    ask_bishopric_member,
    get_pending_schedules,
]
