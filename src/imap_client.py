import email
import imaplib
import logging
import os
import threading
import time
from email.header import decode_header
from email.utils import parseaddr

from src.db import get_db

logger = logging.getLogger(__name__)


def _decode_header_value(value: str) -> str:
    """Decode an RFC 2047 encoded header into a plain string."""
    if not value:
        return ""
    parts = decode_header(value)
    decoded = []
    for text, charset in parts:
        if isinstance(text, bytes):
            decoded.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(text)
    return "".join(decoded)


def _extract_text_body(msg: email.message.Message) -> str:
    """Extract the plain-text body from an email message."""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))
            if content_type == "text/plain" and "attachment" not in disposition:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace")
        return ""
    else:
        payload = msg.get_payload(decode=True)
        charset = msg.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace") if payload else ""


def _strip_quoted_reply(text: str) -> str:
    """Try to extract just the new reply content, stripping quoted original text."""
    lines = text.splitlines()
    result = []
    for line in lines:
        # Common reply separators
        if line.strip().startswith("On ") and line.strip().endswith("wrote:"):
            break
        if line.strip() == "---":
            break
        if line.strip().startswith(">"):
            continue
        if "Original Message" in line:
            break
        result.append(line)
    return "\n".join(result).strip()


def _match_reply(in_reply_to: str, references: str, subject: str) -> int | None:
    """Find the task_id for an inbound reply by matching against outbound_emails.

    Strategy:
    1. Match In-Reply-To header against outbound_emails.message_id
    2. Match any message_id in References header
    3. Fallback: match subject line (strip Re:/Fwd: prefixes)
    """
    db = get_db()
    try:
        # Strategy 1: In-Reply-To
        if in_reply_to:
            row = db.execute(
                "SELECT task_id FROM outbound_emails WHERE message_id = ?",
                (in_reply_to.strip(),),
            ).fetchone()
            if row and row["task_id"]:
                return row["task_id"]

        # Strategy 2: References header (may contain multiple message-ids)
        if references:
            for ref in references.split():
                ref = ref.strip()
                if ref:
                    row = db.execute(
                        "SELECT task_id FROM outbound_emails WHERE message_id = ?",
                        (ref,),
                    ).fetchone()
                    if row and row["task_id"]:
                        return row["task_id"]

        # Strategy 3: Subject line fallback
        if subject:
            clean_subject = subject
            for prefix in ["Re:", "RE:", "Fwd:", "FWD:", "re:", "fwd:"]:
                clean_subject = clean_subject.replace(prefix, "")
            clean_subject = clean_subject.strip()
            if clean_subject:
                row = db.execute(
                    "SELECT task_id FROM outbound_emails WHERE subject = ? ORDER BY sent_at DESC LIMIT 1",
                    (clean_subject,),
                ).fetchone()
                if row and row["task_id"]:
                    return row["task_id"]

        return None
    finally:
        db.close()


def poll_inbox() -> list[dict]:
    """Check for new unread emails, match to tasks, store in inbound_emails.

    Returns a list of dicts for matched replies:
        [{"inbound_id": int, "task_id": int, "from_email": str, "body": str, "subject": str}, ...]
    """
    host = os.environ.get("IMAP_HOST", "imap.gmail.com")
    port = int(os.environ.get("IMAP_PORT", "993"))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]

    matched_replies = []

    try:
        mail = imaplib.IMAP4_SSL(host, port)
        mail.login(user, password)
        mail.select("INBOX")

        # Search for unread messages
        status, data = mail.search(None, "UNSEEN")
        if status != "OK" or not data[0]:
            mail.logout()
            return []

        msg_ids = data[0].split()
        logger.info("IMAP: Found %d unread messages", len(msg_ids))

        for msg_id in msg_ids:
            try:
                status, msg_data = mail.fetch(msg_id, "(RFC822)")
                if status != "OK":
                    continue

                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                from_header = msg.get("From", "")
                _, from_email = parseaddr(from_header)
                subject = _decode_header_value(msg.get("Subject", ""))
                in_reply_to = msg.get("In-Reply-To", "")
                references = msg.get("References", "")
                body = _extract_text_body(msg)
                reply_body = _strip_quoted_reply(body)

                # Skip emails from ourselves
                our_email = os.environ.get("EMAIL_FROM", user)
                if from_email.lower() == our_email.lower():
                    continue

                # Try to match to a task
                task_id = _match_reply(in_reply_to, references, subject)

                # Store in inbound_emails
                db = get_db()
                cursor = db.execute(
                    "INSERT INTO inbound_emails (task_id, from_email, subject, body, in_reply_to, "
                    "references_header, matched) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (task_id, from_email, subject, body, in_reply_to or None,
                     references or None, 1 if task_id else 0),
                )
                inbound_id = cursor.lastrowid
                db.commit()
                db.close()

                if task_id:
                    matched_replies.append({
                        "inbound_id": inbound_id,
                        "task_id": task_id,
                        "from_email": from_email,
                        "body": reply_body or body,
                        "subject": subject,
                    })
                    logger.info("IMAP: Matched reply from %s to task #%d", from_email, task_id)
                else:
                    logger.info("IMAP: Unmatched email from %s: %s", from_email, subject)

            except Exception:
                logger.exception("IMAP: Error processing message %s", msg_id)

        mail.logout()

    except Exception:
        logger.exception("IMAP: Error connecting or polling inbox")

    return matched_replies


def start_imap_poller(process_reply_fn, interval_seconds: int = 60):
    """Start a daemon thread that polls IMAP on an interval.

    process_reply_fn: callable(task_id, reply_text, from_email, subject) called for each matched reply.
    """
    def _poll_loop():
        logger.info("IMAP poller started (interval=%ds)", interval_seconds)
        while True:
            try:
                replies = poll_inbox()
                for reply in replies:
                    try:
                        process_reply_fn(
                            task_id=reply["task_id"],
                            reply_text=reply["body"],
                            from_email=reply["from_email"],
                            subject=reply["subject"],
                        )
                        # Mark as processed
                        db = get_db()
                        db.execute(
                            "UPDATE inbound_emails SET processed = 1 WHERE id = ?",
                            (reply["inbound_id"],),
                        )
                        db.commit()
                        db.close()
                    except Exception:
                        logger.exception("IMAP: Error processing reply for task #%d", reply["task_id"])
            except Exception:
                logger.exception("IMAP: Error in poll loop")

            time.sleep(interval_seconds)

    thread = threading.Thread(target=_poll_loop, daemon=True, name="imap-poller")
    thread.start()
    return thread
