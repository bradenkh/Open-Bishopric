require('dotenv').config();

const { App } = require('@slack/bolt');
const db = require('./db');
const { todoListBlocks, addTodoModal, ephemeralError } = require('./blocks');

// ── App init ──────────────────────────────────────────────────────────────────

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function postTodoList(client, channelId, workspaceId) {
  const todos = db.getTodos(workspaceId);
  await client.chat.postMessage({
    channel: channelId,
    text: 'Bishopric Todo List',
    blocks: todoListBlocks(todos),
  });
}

// ── /todo slash command ───────────────────────────────────────────────────────
//
//   /todo               → show the todo list
//   /todo add <task>    → quick-add a todo (normal priority)
//   /todo help          → show usage

app.command('/todo', async ({ command, ack, respond, client }) => {
  await ack();

  const workspaceId = command.team_id;
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = (command.text || '').trim();
  const [subcommand, ...rest] = text.split(/\s+/);

  if (!text || subcommand === 'list') {
    // Show todo list in the channel
    const todos = db.getTodos(workspaceId);
    await respond({
      response_type: 'in_channel',
      text: 'Bishopric Todo List',
      blocks: todoListBlocks(todos),
    });
    return;
  }

  if (subcommand === 'add') {
    const task = rest.join(' ').trim();
    if (!task) {
      await respond(ephemeralError('Please provide a task description. Usage: `/todo add <task>`'));
      return;
    }
    const id = db.addTodo(workspaceId, task, userId);
    await respond({
      response_type: 'in_channel',
      text: `Todo added`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `:white_check_mark: Added todo *#${id}*: ${task}` },
        },
      ],
    });
    return;
  }

  if (subcommand === 'done') {
    const id = parseInt(rest[0], 10);
    if (!id) {
      await respond(ephemeralError('Usage: `/todo done <id>`'));
      return;
    }
    const success = db.markDone(id, workspaceId);
    if (!success) {
      await respond(ephemeralError(`Todo #${id} not found or already completed.`));
      return;
    }
    await respond({
      response_type: 'in_channel',
      text: `Todo #${id} marked as done`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `:white_check_mark: Todo *#${id}* marked as done. Great work!` },
        },
      ],
    });
    return;
  }

  if (subcommand === 'delete' || subcommand === 'remove') {
    const id = parseInt(rest[0], 10);
    if (!id) {
      await respond(ephemeralError('Usage: `/todo delete <id>`'));
      return;
    }
    const success = db.deleteTodo(id, workspaceId);
    if (!success) {
      await respond(ephemeralError(`Todo #${id} not found.`));
      return;
    }
    await respond({
      response_type: 'in_channel',
      text: `Todo #${id} deleted`,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `:wastebasket: Todo *#${id}* deleted.` } }],
    });
    return;
  }

  if (subcommand === 'assign') {
    // /todo assign <id> @user
    const id = parseInt(rest[0], 10);
    const rawUserId = rest[1] ? rest[1].replace(/[<@>]/g, '') : null;
    if (!id || !rawUserId) {
      await respond(ephemeralError('Usage: `/todo assign <id> @user`'));
      return;
    }
    const success = db.assignTodo(id, workspaceId, rawUserId);
    if (!success) {
      await respond(ephemeralError(`Todo #${id} not found or already completed.`));
      return;
    }
    await respond({
      response_type: 'in_channel',
      text: `Todo #${id} assigned`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `:bust_in_silhouette: Todo *#${id}* assigned to <@${rawUserId}>.` },
        },
      ],
    });
    return;
  }

  // /todo help (or unknown subcommand)
  await respond({
    response_type: 'ephemeral',
    text: 'Bishopric Todo — Help',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '*Bishopric Todo — Available Commands*',
            '`/todo` or `/todo list` — Show all open todos',
            '`/todo add <task>` — Quick-add a todo',
            '`/todo done <id>` — Mark a todo as complete',
            '`/todo delete <id>` — Delete a todo',
            '`/todo assign <id> @user` — Assign a todo to someone',
            '`/todo help` — Show this message',
            '',
            'You can also use the *+ Add Todo* button and overflow menu (⋮) on each item.',
          ].join('\n'),
        },
      },
    ],
  });
});

// ── Button: open "Add Todo" modal ─────────────────────────────────────────────

app.action('open_add_todo_modal', async ({ ack, body, client }) => {
  await ack();
  await client.views.open(addTodoModal(body.trigger_id));
});

// ── Button: refresh todo list ─────────────────────────────────────────────────

app.action('refresh_todos', async ({ ack, body, client }) => {
  await ack();
  const workspaceId = body.team.id;
  const todos = db.getTodos(workspaceId);
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'Bishopric Todo List',
    blocks: todoListBlocks(todos),
  });
});

// ── Overflow menu on each todo item ──────────────────────────────────────────

app.action(/^todo_overflow_\d+$/, async ({ ack, body, action, client }) => {
  await ack();

  const workspaceId = body.team.id;
  const selectedValue = action.selected_option.value; // e.g. "done_3", "delete_3", "priority_high_3"
  const [op, ...parts] = selectedValue.split('_');
  const id = parseInt(parts[parts.length - 1], 10);

  let message = '';

  if (op === 'done') {
    const ok = db.markDone(id, workspaceId);
    message = ok ? `:white_check_mark: Todo *#${id}* marked as done!` : `:warning: Could not mark #${id} as done.`;
  } else if (op === 'delete') {
    const ok = db.deleteTodo(id, workspaceId);
    message = ok ? `:wastebasket: Todo *#${id}* deleted.` : `:warning: Todo #${id} not found.`;
  } else if (op === 'priority') {
    const priority = parts[0]; // "high" or "normal"
    const ok = db.setPriority(id, workspaceId, priority);
    message = ok
      ? `:pencil: Todo *#${id}* priority set to *${priority}*.`
      : `:warning: Could not update priority for #${id}.`;
  }

  // Refresh the todo list in place
  const todos = db.getTodos(workspaceId);
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'Bishopric Todo List',
    blocks: todoListBlocks(todos),
  });

  // Send an ephemeral confirmation to the acting user
  if (message) {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: message,
    });
  }
});

// ── Modal submit: Add Todo ────────────────────────────────────────────────────

app.view('add_todo_modal_submit', async ({ ack, body, view, client }) => {
  await ack();

  const workspaceId = body.team.id;
  const userId = body.user.id;
  const values = view.state.values;

  const task = values.task_block.task_input.value.trim();
  const priority = values.priority_block.priority_input.selected_option?.value ?? 'normal';
  const assignedTo = values.assign_block.assign_input.selected_user ?? null;

  if (!task) return; // shouldn't happen — Slack validates required fields

  const id = db.addTodo(workspaceId, task, userId, assignedTo, priority);

  // Notify the channel the user was in (stored in private_metadata if set, else DM the user)
  // For simplicity, we post a DM to the user who added it
  await client.chat.postMessage({
    channel: userId,
    text: `Todo added`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_check_mark: Added todo *#${id}*: ${task}${assignedTo ? ` (assigned to <@${assignedTo}>)` : ''}`,
        },
      },
    ],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡ Open-Bishopric Slack app is running (Socket Mode)`);
})();
