export type ActionStatus = "candidate" | "clarify" | "confirmed" | "in_progress" | "done" | "cancelled";
export type AppView = "home" | "meeting" | "projects" | "projectList" | "history" | "actions" | "glossary" | "trash";
export const ALL_PROJECTS = "__all_projects__";
export type LiveAsrStatus = "idle" | "connecting" | "recording" | "reconnecting" | "stopping" | "error";

export type AsrDisconnectInfo = {
  code: number;
  reason: string;
  at: string;
  attempt: number;
};

export type TaskEvent = {
  id: string;
  actionId: string;
  label: string;
  detail: string;
  at: string;
};

export type FlowStep = {
  label: string;
  value: string;
  state: "done" | "active" | "warning" | "idle";
};

export type FinishCheck = {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "blue" | "amber" | "neutral";
  actionLabel?: string;
  action?: () => void;
  actionDisabled?: boolean;
};

export type TranscriptLine = {
  id: number;
  time: string;
  speaker: string;
  text: string;
  rawText?: string;
  correctionApplied?: boolean;
  correctionReason?: string;
  correctionText?: string;
  correctionConsistency?: "normal" | "needs_review" | "forced";
  alignmentMode?: "single" | "llm" | "file_timing" | "timing_guard" | "timing_fallback" | "";
  correctionSource?: string;
  correctedAt?: string;
  userEdited?: boolean;
  stabilityStatus?: "draft" | "stable";
  qualityStatus?: "realtime" | "calibrated" | "disputed" | "fallback" | "manual" | "unknown";
  stableRevision?: number;
  asrModel?: string;
  flushReason?: string;
  hotwords?: string[];
  asrQuality?: {
    durationMs: number;
    audioBytes: number;
    rms: number;
    peak: number;
    silenceRatio: number;
  };
  speakerSource?: "embedding" | "diarization" | "local" | "manual" | "pending";
  speakerConfidence?: number;
  audioPath?: string;
  audioStartMs?: number;
  audioEndMs?: number;
  isRealtimePreview?: boolean;
  focus?: boolean;
};

export type TranscriptPreviewState = {
  title: string;
  lines: TranscriptLine[];
  target?: { time?: string; text?: string };
};

export type SpeakerStat = {
  name: string;
  count: number;
  source?: TranscriptLine["speakerSource"];
  confidence: number;
};

export type ActionItem = {
  id: number;
  title: string;
  owner: string;
  due: string;
  status: ActionStatus;
  confidence: number;
  source: string;
  userEdited?: boolean;
  aiLocked?: boolean;
};

export type ActionBacklogItem = Omit<ActionItem, "id"> & {
  id: number | string;
  sourceType: "current" | "archive";
  meetingId: number;
  meetingTitle: string;
  projectName: string;
  createdAt?: string;
};

export type SummaryBlock = {
  id?: number;
  title: string;
  parentTitle?: string;
  cardType?: "text" | "metric" | "timeline" | "capability" | "risk" | "decision";
  evidence?: string[];
  items: string[];
  state: "done" | "live" | "next";
};

export type MeetingSegment = {
  id?: number;
  title: string;
  startTime: string;
  endTime: string;
  transcriptIds: number[];
  speakers: string[];
  summary: string;
  evidenceQuotes: string[];
  candidateActions: string[];
  candidateDecisions: string[];
  candidateRisks: string[];
  candidateQuestions: string[];
  status: "active" | "closed" | "merged";
  sourceRevision?: number;
  updatedAt?: string;
};

export type Project = {
  id?: number;
  name: string;
  count: number;
  active: boolean | number;
};

export type GlossaryEntry = {
  id: number;
  scope: "global" | "project" | "meeting";
  projectId?: number | null;
  meetingId?: number | null;
  term: string;
  aliases: string[];
  category: string;
  weight: number;
  enabled: boolean;
  updatedAt?: string;
};

export type Meeting = {
  id: number;
  title: string;
  status: string;
  stableRevision?: number;
  elapsedSeconds: number;
  projectName: string;
};

export type HistoryBlockData = {
  id?: number;
  title: string;
  meta: string;
  link: string;
  items: string[];
};

export type HistoryContextSummary = {
  meetingId: number;
  title: string;
  projectName: string;
  dateLabel: string;
  overview: string;
  topicCount: number;
  pendingActionCount: number;
  decisionCount: number;
  riskCount: number;
};

export type ProjectMemoryDraft = {
  overview?: string;
  stage?: string;
  facts?: string[];
  goals?: string[];
  topics?: string[];
  decisions?: string[];
  risks?: string[];
  openQuestions?: string[];
  changes?: string[];
};

export type FinalizedMeeting = {
  id: number;
  meetingId: number;
  title: string;
  projectName: string;
  model: string;
  overview: string;
  topics: { title: string; bullets: string[] }[];
  timelineChapters?: { startTime: string; title: string; summary: string }[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  quoteMoments?: { quote: string; speaker: string; reason: string }[];
  speakerViewpoints?: { speaker: string; viewpoints: string[] }[];
  memoryUpdates?: ProjectMemoryDraft;
  actionSnapshot: { title: string; owner: string; due: string; status: ActionStatus; source: string }[];
  transcriptCount: number;
  sourceRevision?: number;
  createdAt: string;
};

export type PersistedProjectMemory = {
  projectId: number;
  projectName: string;
  overview: string;
  facts?: string[];
  goals?: string[];
  currentTopics: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  changes?: string[];
  stage?: string;
  updatedAt: string;
  sourceMeetingId?: number | null;
};

export type ProjectMemory = {
  overview: string;
  facts: string[];
  goals: string[];
  currentTopics: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  changes: string[];
  stage?: string;
  pendingActions: ActionBacklogItem[];
  latestArchive?: FinalizedMeeting;
  updatedAt?: string;
  source: "persisted" | "derived";
};

export type ProjectChatResponse = {
  ok: boolean;
  answer?: string;
  sources?: string[];
  followUps?: string[];
  memoryUpdates?: ProjectMemoryDraft;
  actionSuggestion?: ProjectChatActionSuggestion | null;
  model?: string;
  message?: string;
};

export type ProjectChatActionSuggestion = {
  title: string;
  owner: string;
  due: string;
  reason: string;
};

export type ProjectChatMessage = {
  id?: number;
  role: "user" | "assistant" | "action_suggestion";
  content: string;
  sources?: string[];
  followUps?: string[];
  memoryUpdates?: ProjectMemoryDraft;
  savedToMemory?: boolean;
  createdAt?: string;
  actionSuggestion?: ProjectChatActionSuggestion | null;
};

export type TranscriptSearchMatch = {
  transcriptId: number;
  time: string;
  speaker: string;
  snippet: string;
};

export type TranscriptSearchResult = {
  meetingId: number;
  title: string;
  projectName: string;
  createdAt: string;
  matchCount: number;
  matches: TranscriptSearchMatch[];
};

export type TranscriptSearchResponse = {
  ok: boolean;
  results: TranscriptSearchResult[];
};

export type AsrModel = {
  id: string;
  vendor: string;
  pricePerHour: number;
  endpoint: string;
  recommendation: string;
  reason: string;
};

export type AiRun = {
  id: number;
  model: string;
  triggerType: "manual" | "auto" | string;
  status: "success" | "failed" | string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  summaryCount: number;
  actionCount: number;
  sourceRevision?: number;
  error?: string | null;
  createdAt: string;
};

export type FinalMinutesDraft = {
  title?: string;
  projectName?: string;
  model?: string;
  overview: string;
  topics: { title: string; bullets: string[] }[];
  timelineChapters?: { startTime: string; title: string; summary: string }[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  quoteMoments?: { quote: string; speaker: string; reason: string }[];
  speakerViewpoints?: { speaker: string; viewpoints: string[] }[];
  projectMemory?: ProjectMemoryDraft;
  actionUpdates: { title: string; owner: string; due: string; status: ActionStatus; source: string }[];
  transcriptCount: number;
};

export type ApiState = {
  projects: Project[];
  meeting: Meeting;
  transcripts: TranscriptLine[];
  summaryBlocks: SummaryBlock[];
  segments?: MeetingSegment[];
  actions: ActionItem[];
  actionBacklog?: ActionBacklogItem[];
  taskEvents?: TaskEvent[];
  historyBlocks: HistoryBlockData[];
  historyContext?: HistoryContextSummary | null;
  finalized?: FinalizedMeeting[];
  projectMemories?: PersistedProjectMemory[];
  projectChats?: Record<number, ProjectChatMessage[]>;
  glossaryEntries?: GlossaryEntry[];
  asr: {
    selected: string;
    endpoint: string;
    models: AsrModel[];
  };
  ai?: {
    selected: string;
    finalModel?: string;
    finalFastModel?: string;
    runs?: AiRun[];
  };
};
