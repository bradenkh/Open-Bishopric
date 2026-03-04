// Block Kit builders for the todo list UI

const PRIORITY_EMOJI = { high: ':red_circle:', normal: ':white_circle:', low: ':white_circle:' };
const PRIORITY_LABEL = { high: 'High', normal: 'Normal', low: 'Low' };

function priorityEmoji(priority) {
  return PRIORITY_EMOJI[priority] ?? ':white_circle:';
}

function formatTodo(todo) {
  const assignee = todo.assigned_to ? ` — assigned to <@${todo.assigned_to}>` : '';
  const priority = todo.priority === 'high' ? ' *[HIGH]*' : '';
  return `${priorityEmoji(todo.priority)}  *#${todo.id}*${priority}  ${todo.task}${assignee}`;
}

function todoListBlocks(todos, workspaceTitle = 'Bishopric Todo List') {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 ${workspaceTitle}`, emoji: true },
    },
  ];

  if (todos.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No open todos. Nice work!_ :tada:' },
    });
  } else {
    for (const todo of todos) {
      blocks.push(
        {
          type: 'section',
          text: { type: 'mrkdwn', text: formatTodo(todo) },
          accessory: {
            type: 'overflow',
            action_id: `todo_overflow_${todo.id}`,
            options: [
              { text: { type: 'plain_text', text: '✅ Mark done', emoji: true }, value: `done_${todo.id}` },
              { text: { type: 'plain_text', text: '🔴 High priority', emoji: true }, value: `priority_high_${todo.id}` },
              { text: { type: 'plain_text', text: '⚪ Normal priority', emoji: true }, value: `priority_normal_${todo.id}` },
              { text: { type: 'plain_text', text: '🗑️ Delete', emoji: true }, value: `delete_${todo.id}` },
            ],
          },
        },
        { type: 'divider' },
      );
    }
  }

  blocks.push(
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'open_add_todo_modal',
          text: { type: 'plain_text', text: '+ Add Todo', emoji: true },
          style: 'primary',
        },
        {
          type: 'button',
          action_id: 'refresh_todos',
          text: { type: 'plain_text', text: '↻ Refresh', emoji: true },
        },
      ],
    },
  );

  return blocks;
}

function addTodoModal(triggerId) {
  return {
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'add_todo_modal_submit',
      title: { type: 'plain_text', text: 'Add Todo' },
      submit: { type: 'plain_text', text: 'Add' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'task_block',
          label: { type: 'plain_text', text: 'Task' },
          element: {
            type: 'plain_text_input',
            action_id: 'task_input',
            placeholder: { type: 'plain_text', text: 'e.g. Prepare tithing slips for Sunday' },
            multiline: false,
          },
        },
        {
          type: 'input',
          block_id: 'priority_block',
          label: { type: 'plain_text', text: 'Priority' },
          element: {
            type: 'static_select',
            action_id: 'priority_input',
            initial_option: { text: { type: 'plain_text', text: 'Normal' }, value: 'normal' },
            options: [
              { text: { type: 'plain_text', text: '🔴 High', emoji: true }, value: 'high' },
              { text: { type: 'plain_text', text: '⚪ Normal', emoji: true }, value: 'normal' },
              { text: { type: 'plain_text', text: '🔵 Low', emoji: true }, value: 'low' },
            ],
          },
        },
        {
          type: 'input',
          block_id: 'assign_block',
          optional: true,
          label: { type: 'plain_text', text: 'Assign to' },
          element: {
            type: 'users_select',
            action_id: 'assign_input',
            placeholder: { type: 'plain_text', text: 'Optional — assign to a bishopric member' },
          },
        },
      ],
    },
  };
}

function ephemeralError(message) {
  return {
    response_type: 'ephemeral',
    text: `:warning: ${message}`,
  };
}

module.exports = { todoListBlocks, addTodoModal, ephemeralError, formatTodo };
