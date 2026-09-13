/**
 * The reminder email the bishopric sends about an open task.
 *
 * The subject and body are a template: `{name}` (the task owner's first name),
 * `{task}` (the task title), `{description}` (the task's notes), and `{due}`
 * (a ready-made "Due: <date>" line, blank when the task has no due date) are
 * substituted when a reminder is composed. The bishopric can override the copy
 * in Settings → Email; when they haven't, these defaults are used. Kept
 * framework-free so the settings UI, the Tasks page, and the AI agent can all
 * import it.
 */

export interface TaskReminderTemplate {
  subject: string;
  body: string;
}

export const DEFAULT_TASK_REMINDER: TaskReminderTemplate = {
  subject: "Reminder: {task}",
  body: [
    "Hi {name},",
    "",
    "This is a reminder about a task assigned to you: {task}.",
    "",
    "{description}",
    "{due}",
    "",
    "Thank you,",
    "The Bishopric",
  ].join("\n"),
};

/** The placeholders a reminder template may use, for help text / previews. */
export const TASK_REMINDER_PLACEHOLDERS = ["{name}", "{task}", "{description}", "{due}"] as const;

export interface TaskReminderVars {
  /** The owner's first name (or a preview stand-in). Falls back to "there". */
  name: string;
  /** The task title. */
  task: string;
  /** The task's notes/description; "" when none. */
  description?: string;
  /** A ready-made due-date line, e.g. "Due: March 3, 2026"; "" when no due date. */
  due?: string;
}

// Non-global for detecting placeholders; global for substituting them. Keeping
// them separate avoids the shared-lastIndex pitfall of reusing one /g regex.
const HAS_PLACEHOLDER = /\{(name|task|description|due)\}/;
const PLACEHOLDER_RE = /\{(name|task|description|due)\}/g;

/**
 * Substitute {name}/{task}/{description}/{due} throughout a template. Body lines
 * that carry only placeholders which render empty (an absent description or due
 * date) are dropped, so optional fields don't leave blank gaps; intentionally
 * blank lines the author wrote are preserved.
 */
export function renderTaskReminder(
  template: TaskReminderTemplate,
  vars: TaskReminderVars,
): TaskReminderTemplate {
  const map: Record<string, string> = {
    "{name}": vars.name || "there",
    "{task}": vars.task,
    "{description}": vars.description ?? "",
    "{due}": vars.due ?? "",
  };
  const fill = (s: string) => s.replace(PLACEHOLDER_RE, (m) => map[m] ?? "");

  const body = template.body
    .split("\n")
    // Drop a line only when it had placeholders and rendered blank.
    .filter((line) => !HAS_PLACEHOLDER.test(line) || fill(line).trim() !== "")
    .map(fill)
    .join("\n");

  return { subject: fill(template.subject), body };
}

/** A stored template with blank fields falls back to the defaults, field by field. */
export function withReminderDefaults(
  partial?: Partial<TaskReminderTemplate> | null,
): TaskReminderTemplate {
  return {
    subject: partial?.subject?.trim() ? partial.subject : DEFAULT_TASK_REMINDER.subject,
    body: partial?.body?.trim() ? partial.body : DEFAULT_TASK_REMINDER.body,
  };
}
