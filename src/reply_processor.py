import json
import logging
import threading

from src.db import get_db
from src.agent import run_agent

logger = logging.getLogger(__name__)

# These are set by app.py at startup
_slack_app = None
_agent_lock = None


def init(slack_app, agent_lock: threading.Lock):
    """Initialize the reply processor with Slack app and agent lock references."""
    global _slack_app, _agent_lock
    _slack_app = slack_app
    _agent_lock = agent_lock


def process_reply(task_id: int, reply_text: str, from_email: str, subject: str):
    """Process an inbound email reply by re-invoking the agent with task context.

    1. Load task from DB
    2. Build a synthetic prompt combining task context + reply
    3. Invoke the agent (serialized via agent_lock)
    4. Post the agent's response to Slack (notify_channel or fallback to task creator's DM)
    """
    if not _slack_app or not _agent_lock:
        logger.error("Reply processor not initialized. Call init() first.")
        return

    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        db.close()
        logger.warning("Task #%d not found for reply from %s", task_id, from_email)
        return

    ctx = json.loads(task["context"])
    db.close()

    # Build the synthetic prompt for the agent
    prompt = (
        f"[EMAIL REPLY RECEIVED]\n\n"
        f"You have an active task (Task #{task_id}): {task['summary']}\n"
        f"Task type: {task['task_type']}\n"
        f"Current status: {task['status']}\n"
        f"Task context: {json.dumps(ctx, indent=2)}\n\n"
        f"The person ({from_email}) just replied to your email with:\n"
        f"---\n"
        f"{reply_text}\n"
        f"---\n\n"
        f"Process this reply and take the next appropriate step in the workflow. "
        f"Update the task context when done. "
        f"Summarize what happened and what you did."
    )

    # Determine where to post the response
    notify_channel = task["notify_channel"]
    created_by = task["created_by"]

    # We need a say function and client to pass to run_agent
    client = _slack_app.client

    # If no notify_channel, try to DM the task creator
    if not notify_channel and created_by:
        try:
            dm = client.conversations_open(users=[created_by])
            notify_channel = dm["channel"]["id"]
        except Exception:
            logger.warning("Could not open DM with task creator %s", created_by)

    if not notify_channel:
        logger.error("No channel to notify for task #%d reply", task_id)
        return

    def say(text=None, **kwargs):
        """Post to the notify channel."""
        if text:
            kwargs["text"] = text
        client.chat_postMessage(channel=notify_channel, **kwargs)

    logger.info("Processing reply from %s for task #%d", from_email, task_id)

    with _agent_lock:
        response = run_agent(
            text=prompt,
            slack_user_id=created_by or "system",
            channel_id=notify_channel,
            say=say,
            client=client,
        )

    # Post the agent's response to Slack
    say(f":incoming_envelope: *Email reply received for Task #{task_id}*\n\n{response}")
    logger.info("Posted reply processing result for task #%d to %s", task_id, notify_channel)
