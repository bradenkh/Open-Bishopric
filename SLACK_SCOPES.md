# ALMA Slack App Scopes

## Bot Token Scopes (OAuth & Permissions)

### Core Messaging & Events
| Scope | Purpose |
|---|---|
| `app_mentions:read` | Detect when ALMA is @mentioned in channels |
| `chat:write` | Send messages |
| `chat:write.public` | Post to public channels the bot hasn't joined |

### Conversation History
| Scope | Purpose |
|---|---|
| `channels:history` | Read messages in public channels |
| `channels:read` | List public channels |
| `groups:history` | Read messages in private channels |
| `groups:read` | List private channels |
| `groups:write` | Open/manage private channels |
| `im:history` | Read DMs with the bot |
| `im:read` | List DM conversations |
| `im:write` | Open DMs with users |
| `mpim:history` | Read group DMs |
| `mpim:read` | List group DMs |
| `mpim:write` | Open group DMs |

### Users
| Scope | Purpose |
|---|---|
| `users:read` | Look up user info (names, roles) |
| `users:read.email` | Access user email addresses (org leader email integration) |

### Files & Other
| Scope | Purpose |
|---|---|
| `files:write` | Upload files (agendas, programs) |
| `reactions:write` | Add emoji reactions to messages |
| `pins:write` | Pin important messages (agendas, etc.) |
| `commands` | Register and receive slash commands |

## App-Level Token (Settings → Basic Information → App-Level Tokens)

| Scope | Purpose |
|---|---|
| `connections:write` | Socket Mode (no public URL needed) |

## Event Subscriptions (bot events)

- `app_mention` — triggers when ALMA is @mentioned
- `message.im` — triggers on direct messages to ALMA

## Setup Order

1. Enable **Socket Mode** (Settings → Socket Mode) — creates app-level token with `connections:write`
2. Add **Bot Token Scopes** (OAuth & Permissions → Scopes)
3. Enable **Event Subscriptions** (after Socket Mode is on, no request URL needed)
4. Subscribe to **bot events** (`app_mention`, `message.im`)
5. Enable **App Home → Messages Tab** and allow DMs
6. Install to workspace
