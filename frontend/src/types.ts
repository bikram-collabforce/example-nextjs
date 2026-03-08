export interface MeetingSummary {
  id: string;
  title: string;
  summary: string;
}

export interface FollowUp {
  id: string;
  text: string;
  done: boolean;
}

export interface ScheduleEvent {
  id: string;
  time: string;
  title: string;
  tag: string | null;
  description: string;
  actions: string[];
}

export interface TodaySchedule {
  meetingCount: number;
  pendingApprovals: number;
  events: ScheduleEvent[];
}

export interface PendingItem {
  id: string;
  title: string;
  badge: string | null;
  description: string;
  actions: string[];
}

export interface Highlight {
  label: string;
  text: string;
}

export interface DashboardData {
  highlight: Highlight;
  meetingSummaries: MeetingSummary[];
  followUps: FollowUp[];
  todaySchedule: TodaySchedule;
  pendingItems: PendingItem[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface Integration {
  serviceKey: string;
  displayName: string;
  groupName: string;
  enabled: boolean;
  clientId: string | null;
  redirectUri: string | null;
  hasCredentials: boolean;
  hasApiKey?: boolean;
}
