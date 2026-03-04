# Open-Bishopric

A Slack integration for managing an LDS bishopric, starting with a todo list.

## Features

- `/todo` slash command with subcommands
- Interactive Block Kit UI with overflow menus per item
- Add todos via modal with priority and assignee
- Persistent SQLite storage per Slack workspace
- Assign tasks to bishopric members directly in Slack

## Todo Commands

| Command | Description |
|---------|-------------|
| `/todo` | Show all open todos |
| `/todo list` | Same as above |
| `/todo add <task>` | Quick-add a todo at normal priority |
| `/todo done <id>` | Mark a todo as complete |
| `/todo delete <id>` | Delete a todo |
| `/todo assign <id> @user` | Assign a todo to a bishopric member |
| `/todo help` | Show command reference |

You can also use the **+ Add Todo** button and the **⋮ overflow menu** on each item to complete, delete, or change priority without typing commands.

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.
2. Name it something like `Bishopric` and pick your workspace.

### 2. Enable Socket Mode

1. In your app settings, go to **Socket Mode** and toggle it on.
2. Generate an **App-Level Token** with the `connections:write` scope. Copy it — this is your `SLACK_APP_TOKEN`.

### 3. Add a Slash Command

1. Go to **Slash Commands → Create New Command**.
2. Set the command to `/todo` and a short description like `Bishopric todo list`.
3. Save.

### 4. Set Bot Token Scopes

Under **OAuth & Permissions → Scopes → Bot Token Scopes**, add:

- `chat:write`
- `chat:write.public`
- `commands`
- `users:read`

### 5. Enable Interactivity

Go to **Interactivity & Shortcuts** and toggle **Interactivity** on. (The Request URL can be anything in Socket Mode — Slack won't use it.)

### 6. Install the App

Go to **Install App** and install it to your workspace. Copy the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN`.

Copy your **Signing Secret** from **Basic Information → App Credentials**.

### 7. Configure Environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
```

### 8. Install Dependencies & Run

```bash
npm install
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Project Structure

```
src/
  index.js   # Slack Bolt app — commands, actions, modals
  db.js      # SQLite queries via better-sqlite3
  blocks.js  # Block Kit UI builders
.env.example # Environment variable template
todos.db     # Created automatically on first run (gitignored)
```

## Roadmap

- [ ] Meeting agenda builder
- [ ] Member visit tracker
- [ ] Sacrament meeting assignment scheduler
- [ ] Bishopric interview reminders
