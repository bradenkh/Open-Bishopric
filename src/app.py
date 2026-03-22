import os
import re
import threading

from dotenv import load_dotenv
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

load_dotenv()

from src.db import run_migrations
from src.actions.scheduling import register as register_scheduling_actions
from src.actions.email_approval import register as register_email_approval_actions
from src.agent import run_agent

app = App(
    token=os.environ["SLACK_BOT_TOKEN"],
    signing_secret=os.environ["SLACK_SIGNING_SECRET"],
)

register_scheduling_actions(app)
register_email_approval_actions(app)

# Z.AI allows only one concurrent request — serialize agent calls
agent_lock = threading.Lock()


@app.event("app_mention")
def handle_mention(event, say, client):
    if event.get("bot_id"):
        return
    text = re.sub(r"<@\w+>", "", event["text"]).strip()
    if not text:
        say("Hi! I'm ALMA. How can I help today?")
        return
    client.reactions_add(channel=event["channel"], timestamp=event["ts"], name="hourglass_flowing_sand")
    with agent_lock:
        response = run_agent(text, event["user"], event["channel"], say, client)
    try:
        client.reactions_remove(channel=event["channel"], timestamp=event["ts"], name="hourglass_flowing_sand")
    except Exception:
        pass
    say(response)


@app.event("message")
def handle_dm(event, say, client):
    if event.get("bot_id") or event.get("channel_type") != "im":
        return
    text = event.get("text", "").strip()
    if not text:
        return
    client.reactions_add(channel=event["channel"], timestamp=event["ts"], name="hourglass_flowing_sand")
    with agent_lock:
        response = run_agent(text, event["user"], event["channel"], say, client)
    try:
        client.reactions_remove(channel=event["channel"], timestamp=event["ts"], name="hourglass_flowing_sand")
    except Exception:
        pass
    say(response)


if __name__ == "__main__":
    run_migrations()

    # Start IMAP poller for email reply handling
    from src.reply_processor import init as init_reply_processor, process_reply
    from src.imap_client import start_imap_poller

    init_reply_processor(slack_app=app, agent_lock=agent_lock)
    imap_interval = int(os.environ.get("IMAP_POLL_INTERVAL", "60"))
    start_imap_poller(process_reply_fn=process_reply, interval_seconds=imap_interval)

    handler = SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])
    print("⚡ ALMA is running in Socket Mode!")
    handler.start()
