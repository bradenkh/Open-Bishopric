# ALMA — Automated Leadership Management Assistant

## Overview

ALMA is a Slack-based AI assistant for LDS ward bishoprics. It runs as a self-hosted Python app on a ward Windows machine, using SQLite for storage and Z.AI GLM-4.7-Flash as the LLM via LangChain. Communication happens through Slack (Bolt SDK, Socket Mode) and email (SMTP/IMAP). Non-Slack users (organization leaders, ward members) interact with ALMA through email; automated emails clearly identify themselves as coming from ALMA.

Everything ALMA does is modeled as a **task**. Tasks are the universal unit of work — every workflow, follow-up, reminder, and multi-step process is tracked as a task with typed context, status transitions, and email/Slack integration.

---

## Roles

| Role | Slack User | Notes |
|------|-----------|-------|
| Bishop | Yes | Primary interviewer, approves agendas and programs |
| Bishopric Counselor (x2) | Yes | Conduct interviews, extend callings, direct sacrament meeting |
| Executive Secretary | Yes | Primary ALMA operator — schedules interviews, manages tasks |
| Assistant Executive Secretary | Yes | Supports exec sec, coordinates with quorum leaders |
| Clerk / Assistant Clerks | Yes | Update LCR records, notified for calling completions |
| Organization Leaders (RS, EQ, YW, SS, custom) | No — email only | Provide agenda items, report on assignments |

---

## Core Architecture: The Task System

### Task Model

Every unit of work is a `task` with:

- **task_type** — categorizes the workflow (see types below)
- **status** — `active`, `waiting_reply`, `completed`, `cancelled`
- **summary** — human-readable description
- **context** — JSON blob holding all workflow-specific state (current step, proposed times, assignee info, due dates, etc.)
- **created_by** — Slack user who initiated
- **notify_channel** — where to post updates
- **assignee** — person responsible (may be a Slack user or external contact name/email)
- **due_date** — when the task should be completed (nullable)
- **parent_task_id** — links sub-tasks to a parent task for multi-step workflows
- **source** — origin of the task (`meeting_notes`, `manual`, `system`, `calling_workflow`)

### Task Types

| Type | Description |
|------|-------------|
| `schedule_interview` | Full scheduling workflow: email outreach, reply processing, availability check, ICS invite |
| `follow_up` | Post-interview or post-assignment check-in |
| `contact` | One-off outreach to a ward member |
| `todo` | Action item with assignee and due date, often created from meeting notes |
| `calling` | Multi-step calling workflow (see Calling Management) |
| `agenda_item` | Item to be included in a meeting agenda |
| `sacrament_item` | Business or program item for sacrament meeting |
| `announcement` | Recurring announcement with expiry date |
| `general` | Catch-all |

### Task Lifecycle

Tasks move through statuses driven by agent actions, email replies, Slack button interactions, and scheduled checks:

1. **Created** (`active`) — by agent tool call, meeting notes processing, or system trigger
2. **Waiting** (`waiting_reply`) — email sent or Slack interaction pending
3. **Completed** (`completed`) — work finished, outcome recorded in context
4. **Cancelled** (`cancelled`) — no longer needed

Sub-tasks can be spawned from parent tasks. A parent task's completion may depend on all sub-tasks completing.

### Scheduled Task Processing

A periodic check (configurable interval) should:
- Find `todo` tasks approaching their due date: send a reminder at the halfway point, and request a status report one day before
- Find `waiting_reply` tasks that have gone stale (no response after configurable days) and notify the exec secretary
- Find `announcement` tasks past their expiry date and mark them completed
- Trigger pre-meeting workflows (agenda solicitation, agenda distribution) based on meeting schedules

---

## Workflows

### 1. Interview Scheduling (Implemented)

**Participants:** Executive Secretary, Bishopric Member (interviewer), Ward Member (interviewee)

**Interview Types & Durations:**
| Type | Duration |
|------|----------|
| Child baptism | 15 min |
| Youth temple recommend / annual | 10 min |
| Adult temple recommend renewal | 15 min |
| First-time temple recommend, mission prep, marriage/sealing | 30 min |
| Undisclosed (repentance, welfare) | 20 min default, adjustable |

**Flow:**
1. Exec sec tells ALMA to schedule an interview (or adds to interview list) -> `schedule_interview` task created
2. ALMA checks interviewer availability via `get_availability()`
3. ALMA sends email to interviewee proposing available times (task moves to `waiting_reply`)
4. Interviewee replies (IMAP polling matches reply to task)
5. Agent processes reply, cross-references with interviewer availability
6. ALMA sends Slack DM to interviewer with time-picker buttons via `ask_bishopric_member()`
7. Interviewer picks a time -> ICS invite sent to both parties, task completed
8. If interviewer rejects all times -> task returns to `active`, exec sec notified to get more options
9. **Post-interview follow-up:** After the scheduled time passes, ALMA creates a `follow_up` task — asks the interviewer (via Slack) if the interview happened, if a follow-up is needed, or if the person needs to be rescheduled

**Agent should also:**
- Maintain a persistent interview list (people who need to be scheduled)
- Send weekly reminders to exec sec of unscheduled people on the list
- Track last-contacted date per person
- Provide `sms:` and `mailto:` links in Slack for the exec sec to easily contact people outside the system

### 2. Meeting Notes & Agendas

**Meeting Types:** Bishopric Meeting, Ward Council, Youth Council, EQ/RS Coordination (extensible)

Each meeting type has a recurring schedule (day of week + time) stored in configuration.

**Flow:**
1. Exec sec starts a meeting notes session via ALMA (specifies meeting type)
2. During the meeting, exec sec sends notes into the chat with ALMA
3. ALMA processes notes into structured sections matching the agenda format
4. ALMA extracts action items and creates `todo` tasks with assignees and due dates (default due date = next meeting of that type)
5. After the meeting:
   - ALMA compiles items from the notes + carryover items from the previous agenda
   - Bishop receives a checklist of items to include/exclude from the next agenda
   - Once confirmed, ALMA generates the draft agenda and sends to bishopric for review
   - Bishopric can provide feedback; ALMA refines until approved
6. **Two days before** the next meeting: ALMA emails organization leaders (and messages bishopric members) asking if they have items to add, including reminders about their open `todo` tasks
7. Responses are incorporated into the agenda
8. **One hour before** the meeting: final agenda sent via email to all attendees and posted in the meeting's Slack channel

**Agenda Storage:**
- Current agenda is the active document; previous agendas are archived
- Format TBD (Google Docs, or a generated document — avoid paid Slack features)

### 3. Sacrament Meeting Program

**Components tracked as tasks/records:**
- Speakers and topics
- Musical numbers / hymns
- Prayers (assigned well in advance with history tracking — who prayed last and when)
- Announcements (title, date/time, description — included until date passes, then auto-expired)
- Second hour meeting info
- Ward/stake business items (callings, ordinations, etc.)

**Flow:**
1. Bishopric members add program items through ALMA (conversationally or via commands) -> each becomes a `sacrament_item` or `announcement` task
2. ALMA maintains a running view of the upcoming week's program
3. If any required information is missing for the upcoming Sunday, ALMA proactively asks a bishopric member to fill it in
4. Once bishopric approves the program, ALMA generates:
   - **Business items sheet** — for the conducting counselor (includes program items + callings + announcements + ward/stake business)
   - **Ward bulletin** — date, hymns, speakers, musical numbers, announcements, second hour, building cleaning schedule
5. Bulletin converted to PDF and emailed to the ward
6. Reminder to print copies of the bulletin and sacrament meeting agenda on Sunday

**Prayer Assignment:**
- ALMA maintains a history of prayer assignments per person
- When assigning prayers, prioritize people who haven't prayed recently
- Create a `contact` task to reach out and confirm with the assigned person

### 4. Calling Management

A calling goes through a multi-step lifecycle, modeled as a `calling` task with sub-tasks:

1. **Identified** — from bishopric meeting notes, someone is called to a position. Bishopric discusses and decides who to extend the calling to -> `calling` task created
2. **Extend** — a `todo` sub-task is created for the assigned bishopric member to extend the calling
3. **Response** — bishopric member reports back:
   - **Accepted:** ALMA asks if the calling should be sustained in sacrament meeting or only announced in classes. Creates a `sacrament_item` task for the appropriate action
   - **Declined:** item added to next bishopric meeting agenda to discuss a replacement
4. **Sustain/Announce** — added to sacrament meeting business items
5. **Set Apart** — added to a list of people to set apart. One hour after church, bishopric gets a checklist to indicate who was set apart
6. **Record** — clerk notified to update calling in LCR and record the setting apart
7. **Release** (if replacing someone) — notify the person being released, handle separately or as part of the same workflow

The previous calling holder's release follows a parallel track: collect replacement suggestions, release the person, sustain the new person.

### 5. Todo / Action Items

Todos are `todo`-type tasks with:
- **assignee** — can be a Slack user or an external person (name + email)
- **due_date** — explicit or defaults to next meeting of the originating meeting type
- **source** — `meeting_notes`, `manual`, `calling_workflow`, etc.

**Automated follow-up:**
- **Halfway to due date:** ALMA sends a reminder to the assignee
- **One day before due date:** ALMA asks for a status report
- **If the assignee is an org leader and a meeting is approaching:** the pre-meeting solicitation email also asks about their open todos
- **Overdue:** exec sec notified of overdue items weekly

### 6. Temple Recommend Monitoring

- Track member temple recommend expiry dates
- As recommends approach expiry, create `schedule_interview` tasks to get them renewed
- Youth recommends: schedule through head of household
- Full-use recommends: follow up to ensure the member can meet with the stake presidency after the bishop interview

---

## Communication Channels

### Slack
- **Bishopric channel** — clerks, secretaries, counselors, bishop
- **Clerk channel** — clerk + assistant clerks
- **Executive secretary channel** — exec sec + assistant exec secs
- **Meeting channels** — one per recurring meeting type (ward council, youth council, etc.)
- **DMs** — ALMA sends individual messages for scheduling confirmations, follow-ups, and task-specific interactions

### Email
- Outbound emails are HTML-formatted with ALMA branding and ward name
- Each outbound email is linked to a task via Message-ID for reply matching
- IMAP polling matches inbound replies to tasks (In-Reply-To header, References header, subject line fallback)
- ICS calendar invites attached for scheduled events
- All automated emails clearly state they are from ALMA

### Future: Texting
- Trigger texts via iPhone Shortcuts integration (phone number + separator + message)
- Batch text message support
- For now, ALMA provides `sms:` links in Slack as a bridge

---

## Technical Constraints

- **Z.AI free tier:** one concurrent LLM request at a time (serialized with a lock)
- **Self-hosted:** runs on ward Windows machines, SQLite for storage
- **No Google Calendar API:** scheduling uses ICS email invites + Slack buttons
- **Programmatic over agentic:** where possible, implement deterministic processes rather than relying on the LLM to follow multi-step procedures. Use the agent for interpretation and decision-making, not for rote sequencing.
- **Sub-agents:** use sub-agents for complex tasks to work within the smaller model's capabilities

---

## Configuration

| Setting | Description |
|---------|-------------|
| `WARD_NAME` | Ward name for branding |
| `WARD_TIMEZONE` | Timezone for scheduling (e.g., America/New_York) |
| `IMAP_POLL_INTERVAL` | Seconds between inbox checks (default: 60) |
| Meeting schedules | Day/time for each recurring meeting type |
| Interview durations | Configurable per interview type |
| Reminder intervals | How far before due dates to send reminders |
| Stale task threshold | Days before a `waiting_reply` task is flagged |

---

## App Home

The Slack App Home tab should provide an interface for:
- Specifying organization leader emails and names
- Viewing current task summary / dashboard
- Quick actions (add to interview list, create announcement, etc.)
