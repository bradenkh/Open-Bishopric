import json
import logging
from datetime import datetime

from src.db import get_db
from src.email_client import send_email as smtp_send

logger = logging.getLogger(__name__)


def _claim_pending_email(pending_id, new_status):
    """Atomically claim a pending email by updating its status from 'pending'.

    Returns the row if successfully claimed, None if already processed.
    This prevents duplicate sends when the user clicks the button multiple times.
    """
    db = get_db()
    # Only update if still pending — this is the concurrency guard
    db.execute(
        "UPDATE pending_emails SET status = ?, resolved_at = CURRENT_TIMESTAMP "
        "WHERE id = ? AND status = 'pending'",
        (new_status, pending_id),
    )
    db.commit()
    if db.execute("SELECT changes()").fetchone()[0] == 0:
        # Already processed by a prior click
        db.close()
        return None, None
    row = db.execute("SELECT * FROM pending_emails WHERE id = ?", (pending_id,)).fetchone()
    return db, row


def register(app):
    """Register email approval/denial action handlers with the Slack app."""

    @app.action("email_approve")
    def handle_email_approve(ack, body, client):
        ack()
        try:
            pending_id = int(body["actions"][0]["value"])
        except (KeyError, ValueError):
            logger.error("[EMAIL_APPROVAL] Failed to parse email_approve action value")
            return

        # Immediately remove the buttons so the user can't click again
        try:
            client.chat_update(
                channel=body["channel"]["id"],
                ts=body["message"]["ts"],
                text="Sending email...",
                blocks=[{
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": ":hourglass_flowing_sand: *Sending email...*",
                    },
                }],
            )
        except Exception as e:
            logger.error("[EMAIL_APPROVAL] Failed to update message to processing state: %s", e)

        # Atomically claim the pending email
        db, row = _claim_pending_email(pending_id, "approved")
        if row is None:
            # Already processed — update message to reflect that
            try:
                client.chat_update(
                    channel=body["channel"]["id"],
                    ts=body["message"]["ts"],
                    text="This email was already processed.",
                    blocks=[{
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": ":information_source: This email was already processed.",
                        },
                    }],
                )
            except Exception:
                pass
            return

        # Send the actual email
        try:
            message_id = smtp_send(
                to=row["to_email"],
                subject=row["subject"],
                body=row["body"],
                task_id=row["task_id"],
            )
        except Exception as e:
            logger.error("[EMAIL_APPROVAL] Failed to send email #%d: %s", pending_id, e)
            db.execute(
                "UPDATE pending_emails SET status = 'failed' WHERE id = ?",
                (pending_id,),
            )
            db.commit()
            db.close()
            try:
                client.chat_update(
                    channel=body["channel"]["id"],
                    ts=body["message"]["ts"],
                    text=f"Failed to send email to {row['to_email']}: {e}",
                    blocks=[{
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f":x: *Email failed to send*\n*To:* {row['to_email']}\n*Error:* {e}",
                        },
                    }],
                )
            except Exception:
                pass
            return

        # If linked to a task, update the task status
        if row["task_id"]:
            task = db.execute("SELECT context FROM tasks WHERE id = ?", (row["task_id"],)).fetchone()
            if task:
                ctx = json.loads(task["context"])
                notes = ctx.get("notes", [])
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
                notes.append(f"[{timestamp}] Email sent to {row['to_email']}: {row['subject']}")
                ctx["step"] = "waiting_for_reply"
                ctx["notes"] = notes
                db.execute(
                    "UPDATE tasks SET status = 'waiting_reply', context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (json.dumps(ctx), row["task_id"]),
                )
                db.commit()

        db.close()

        # Update the Slack message to show success
        try:
            client.chat_update(
                channel=body["channel"]["id"],
                ts=body["message"]["ts"],
                text=f"Email approved and sent to {row['to_email']}",
                blocks=[{
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f":white_check_mark: *Email approved and sent*\n"
                            f"*To:* {row['to_email']}\n"
                            f"*Subject:* {row['subject']}"
                        ),
                    },
                }],
            )
        except Exception as e:
            logger.error("[EMAIL_APPROVAL] Failed to update Slack message: %s", e)

    @app.action("email_deny")
    def handle_email_deny(ack, body, client):
        ack()
        try:
            pending_id = int(body["actions"][0]["value"])
        except (KeyError, ValueError):
            logger.error("[EMAIL_APPROVAL] Failed to parse email_deny action value")
            return

        # Immediately remove the buttons
        try:
            client.chat_update(
                channel=body["channel"]["id"],
                ts=body["message"]["ts"],
                text="Email denied.",
                blocks=[{
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": ":hourglass_flowing_sand: *Processing...*",
                    },
                }],
            )
        except Exception:
            pass

        # Atomically claim the pending email
        db, row = _claim_pending_email(pending_id, "denied")
        if row is None:
            try:
                client.chat_update(
                    channel=body["channel"]["id"],
                    ts=body["message"]["ts"],
                    text="This email was already processed.",
                    blocks=[{
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": ":information_source: This email was already processed.",
                        },
                    }],
                )
            except Exception:
                pass
            return

        db.close()

        # Update the Slack message to show denial
        try:
            client.chat_update(
                channel=body["channel"]["id"],
                ts=body["message"]["ts"],
                text=f"Email to {row['to_email']} was denied",
                blocks=[{
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f":no_entry_sign: *Email denied — not sent*\n"
                            f"*To:* {row['to_email']}\n"
                            f"*Subject:* {row['subject']}"
                        ),
                    },
                }],
            )
        except Exception as e:
            logger.error("[EMAIL_APPROVAL] Failed to update Slack message: %s", e)
