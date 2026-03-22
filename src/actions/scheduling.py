import json
import logging
import os
from datetime import datetime

from src.db import get_db
from src.ics_util import build_ics
from src.email_client import send_email_with_ics

logger = logging.getLogger(__name__)


def _fmt_time(t: str) -> str:
    """Convert 'HH:MM' to '8:00am' style."""
    h, m = int(t[:2]), int(t[3:5])
    suffix = "am" if h < 12 else "pm"
    display_h = h if h <= 12 else h - 12
    if display_h == 0:
        display_h = 12
    return f"{display_h}:{m:02d}{suffix}"


def register(app):
    """Register scheduling action handlers with the Slack app."""

    @app.action("schedule_select")
    def handle_schedule_select(ack, body, client):
        ack()
        try:
            value = body["actions"][0]["value"]
            task_id_str, confirmed_time = value.split("|", 1)
            task_id = int(task_id_str)
        except (KeyError, ValueError):
            logger.error("[SCHEDULING] Failed to parse schedule_select action value")
            return

        db = get_db()
        task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            logger.error("[SCHEDULING] Task #%d not found", task_id)
            db.close()
            return

        ctx = json.loads(task["context"])
        member_name = ctx.get("member_name", "someone")
        member_email = ctx.get("member_email")
        interviewer_role = ctx.get("interviewer_role", "")

        # Look up the interviewer's name from bishopric_members
        interviewer_name = interviewer_role
        if interviewer_role:
            bm = db.execute(
                "SELECT name FROM bishopric_members WHERE LOWER(role) = LOWER(?)",
                (interviewer_role,),
            ).fetchone()
            if bm:
                interviewer_name = bm["name"]

        # Update task context and status
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        notes = ctx.get("notes", [])
        notes.append(f"[{timestamp}] Scheduled with {interviewer_name} on {confirmed_time}. ICS invite sent.")
        ctx["step"] = "completed"
        ctx["scheduled_at"] = confirmed_time
        ctx["notes"] = notes

        db.execute(
            "UPDATE tasks SET status = 'completed', context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(ctx), task_id),
        )
        db.commit()

        # Send ICS to interviewee if they have an email
        if member_email:
            date_part, time_part = confirmed_time.split(" ")
            start_dt = f"{date_part}T{time_part}:00"
            # Default 30 min interview
            start_h, start_m = int(time_part[:2]), int(time_part[3:5])
            end_mins = start_h * 60 + start_m + 30
            end_h, end_m = divmod(end_mins, 60)
            end_dt = f"{date_part}T{end_h:02d}:{end_m:02d}:00"

            tz = os.environ.get("WARD_TIMEZONE", "America/New_York")
            organizer_email = os.environ.get("EMAIL_FROM", "")
            ics_content = build_ics(
                summary=f"Interview with {interviewer_name}",
                start_dt=start_dt,
                end_dt=end_dt,
                timezone=tz,
                organizer_email=organizer_email,
                attendee_email=member_email,
                description=f"Interview with {interviewer_name} ({interviewer_role})",
            )
            try:
                send_email_with_ics(
                    to=member_email,
                    subject=f"Interview Scheduled — {confirmed_time}",
                    body=(
                        f"Hi {member_name},\n\n"
                        f"Your interview with {interviewer_name} has been scheduled for {confirmed_time}.\n\n"
                        f"A calendar invite is attached. Please add it to your calendar.\n\n"
                        f"Thanks!\nALMA"
                    ),
                    ics_content=ics_content,
                    task_id=task_id,
                )
                logger.info("[SCHEDULING] ICS sent to %s for task #%d", member_email, task_id)
            except Exception as e:
                logger.error("[SCHEDULING] Failed to send ICS email: %s", e)

        db.close()

        # Update the DM to remove buttons
        try:
            client.chat_update(
                channel=body["channel"]["id"],
                ts=body["message"]["ts"],
                text=f"You selected *{confirmed_time}* for the interview with {member_name}. ICS invite sent!",
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f":white_check_mark: You selected *{confirmed_time}* for the interview with *{member_name}*. ICS invite sent!",
                        },
                    }
                ],
            )
        except Exception as e:
            logger.error("[SCHEDULING] Failed to update DM: %s", e)

        # Notify exec secretary (task creator)
        if task["created_by"]:
            try:
                client.chat_postMessage(
                    channel=task["created_by"],
                    text=(
                        f":white_check_mark: *{interviewer_name}* selected *{confirmed_time}* "
                        f"for the interview with *{member_name}* (Task #{task_id}). "
                        f"ICS invite has been sent."
                    ),
                )
            except Exception as e:
                logger.error("[SCHEDULING] Failed to notify exec secretary: %s", e)

    @app.action("schedule_reject")
    def handle_schedule_reject(ack, body, client):
        ack()
        try:
            task_id = int(body["actions"][0]["value"])
        except (KeyError, ValueError):
            logger.error("[SCHEDULING] Failed to parse schedule_reject action value")
            return

        db = get_db()
        task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            logger.error("[SCHEDULING] Task #%d not found", task_id)
            db.close()
            return

        ctx = json.loads(task["context"])
        member_name = ctx.get("member_name", "someone")
        interviewer_role = ctx.get("interviewer_role", "")

        # Look up interviewer name
        interviewer_name = interviewer_role
        if interviewer_role:
            bm = db.execute(
                "SELECT name FROM bishopric_members WHERE LOWER(role) = LOWER(?)",
                (interviewer_role,),
            ).fetchone()
            if bm:
                interviewer_name = bm["name"]

        # Update task context
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        notes = ctx.get("notes", [])
        proposed = ctx.get("proposed_times", [])
        notes.append(f"[{timestamp}] {interviewer_name} declined proposed times: {', '.join(proposed)}.")
        ctx["step"] = "times_rejected"
        ctx["notes"] = notes

        db.execute(
            "UPDATE tasks SET status = 'active', context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(ctx), task_id),
        )
        db.commit()
        db.close()

        # Update DM to remove buttons
        try:
            client.chat_update(
                channel=body["channel"]["id"],
                ts=body["message"]["ts"],
                text=f"None of these times work for {member_name}. The exec secretary has been notified.",
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f":x: None of these times work for *{member_name}*. The exec secretary has been notified.",
                        },
                    }
                ],
            )
        except Exception as e:
            logger.error("[SCHEDULING] Failed to update DM: %s", e)

        # Notify exec secretary
        if task["created_by"]:
            try:
                client.chat_postMessage(
                    channel=task["created_by"],
                    text=(
                        f":x: *{interviewer_name}* can't do any of the proposed times "
                        f"for *{member_name}* (Task #{task_id}). "
                        f"Please provide other times to try."
                    ),
                )
            except Exception as e:
                logger.error("[SCHEDULING] Failed to notify exec secretary: %s", e)
