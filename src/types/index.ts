export type UserRole = "bishop" | "counselor" | "clerk" | "exec-secretary";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  householdId?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskType =
  | "interview"
  | "follow_up"
  | "contact"
  | "todo"
  | "calling"
  | "agenda_item"
  | "announcement"
  | "general";

export type TaskStatus = "active" | "in_progress" | "waiting" | "completed" | "cancelled";

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
  memberId?: string;
  memberName?: string;
  dueDate?: string;
  context?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CallingStage =
  | "identified"
  | "approved"
  | "extended"
  | "responded"
  | "sustained"
  | "set_apart"
  | "recorded";

export interface Calling {
  id: string;
  memberId: string;
  memberName: string;
  position: string;
  organization: string;
  stage: CallingStage;
  notes?: string;
  approvedBy?: string;
  extendedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const CALLING_STAGES: { stage: CallingStage; label: string }[] = [
  { stage: "identified", label: "Identified" },
  { stage: "approved", label: "Approved" },
  { stage: "extended", label: "Extended" },
  { stage: "responded", label: "Response Received" },
  { stage: "sustained", label: "Sustained" },
  { stage: "set_apart", label: "Set Apart" },
  { stage: "recorded", label: "Recorded" },
];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  interview: "Interview",
  follow_up: "Follow Up",
  contact: "Contact",
  todo: "To Do",
  calling: "Calling",
  agenda_item: "Agenda Item",
  announcement: "Announcement",
  general: "General",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  waiting: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};
