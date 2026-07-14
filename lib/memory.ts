import type {
  ActionBacklogItem,
  ActionItem,
  FinalizedMeeting,
  Meeting,
  PersistedProjectMemory,
  ProjectMemory,
  ProjectMemoryDraft,
} from "../types";
import { isOpenAction } from "./actions";

export function toCurrentBacklogAction(action: ActionItem, meeting: Meeting): ActionBacklogItem {
  return {
    ...action,
    sourceType: "current",
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    projectName: meeting.projectName,
    createdAt: "",
  };
}

export function buildProjectMemory(
  projectName: string,
  archives: FinalizedMeeting[],
  actions: ActionBacklogItem[],
  stored?: PersistedProjectMemory,
): ProjectMemory {
  const sortedArchives = [...archives].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestArchive = sortedArchives[0];
  const pendingActions = actions.filter(isOpenAction);
  if (stored) {
    return {
      overview: stored.overview || `${projectName} 已建立项目记忆，但暂时没有概览内容。`,
      facts: (stored.facts ?? []).slice(0, 12),
      goals: (stored.goals ?? []).slice(0, 10),
      currentTopics: stored.currentTopics.slice(0, 8),
      decisions: stored.decisions.slice(0, 8),
      risks: stored.risks.slice(0, 8),
      openQuestions: stored.openQuestions.slice(0, 8),
      changes: (stored.changes ?? []).slice(0, 8),
      stage: stored.stage || "",
      pendingActions,
      latestArchive,
      updatedAt: stored.updatedAt,
      source: "persisted",
    };
  }

  const currentTopics = sortedArchives.flatMap((archive) => archive.topics.map((topic) => topic.title)).filter(Boolean);
  const decisions = sortedArchives.flatMap((archive) => archive.decisions).filter(Boolean);
  const risks = sortedArchives.flatMap((archive) => archive.risks).filter(Boolean);
  const openQuestions = sortedArchives.flatMap((archive) => archive.openQuestions).filter(Boolean);

  return {
    overview: latestArchive?.overview || `${projectName} 还没有形成稳定项目记忆。完成并归档会议后，系统会在这里沉淀项目背景、关键结论、风险和待办。`,
    facts: [],
    goals: [],
    currentTopics: Array.from(new Set(currentTopics)).slice(0, 8),
    decisions: Array.from(new Set(decisions)).slice(0, 8),
    risks: Array.from(new Set(risks)).slice(0, 8),
    openQuestions: Array.from(new Set(openQuestions)).slice(0, 8),
    changes: [],
    stage: "",
    pendingActions,
    latestArchive,
    source: "derived",
  };
}

export function splitMemoryLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function hasMemoryDraftContent(draft?: ProjectMemoryDraft) {
  if (!draft) return false;
  return [
    draft.overview,
    ...(draft.facts || []),
    ...(draft.goals || []),
    ...(draft.topics || []),
    ...(draft.decisions || []),
    ...(draft.risks || []),
    ...(draft.openQuestions || []),
    ...(draft.changes || []),
  ].some((item) => String(item || "").trim());
}

export function mergeMemoryWithDraft(memory: ProjectMemory, draft: ProjectMemoryDraft): ProjectMemory {
  return {
    ...memory,
    overview: draft.overview?.trim() || memory.overview,
    facts: mergeMemoryLines(memory.facts, draft.facts),
    goals: mergeMemoryLines(memory.goals, draft.goals),
    currentTopics: mergeMemoryLines(memory.currentTopics, draft.topics),
    decisions: mergeMemoryLines(memory.decisions, draft.decisions),
    risks: mergeMemoryLines(memory.risks, draft.risks),
    openQuestions: mergeMemoryLines(memory.openQuestions, draft.openQuestions),
    changes: mergeMemoryLines(memory.changes, draft.changes),
  };
}

function mergeMemoryLines(existing: string[], incoming?: string[]) {
  const result: string[] = [];
  for (const item of [...existing, ...(incoming || [])]) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = normalizeMemoryLineKey(text);
    if (result.some((current) => normalizeMemoryLineKey(current) === key || areMemoryLinesSimilar(normalizeMemoryLineKey(current), key))) continue;
    result.push(text);
  }
  return result.slice(0, 40);
}

function normalizeMemoryLineKey(value: string) {
  return value
    .toLowerCase()
    .replace(/^(本次新增|历史延续|历史更新|历史关闭|风险|依赖|待澄清|决策)[：:]\s*/g, "")
    .replace(/[，。、“”‘’：:；;（）()\[\]\s]/g, "")
    .slice(0, 80);
}

function areMemoryLinesSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aChars = new Set([...a]);
  const bChars = new Set([...b]);
  let overlap = 0;
  for (const char of aChars) {
    if (bChars.has(char)) overlap += 1;
  }
  const shorter = Math.min(aChars.size, bChars.size);
  return shorter >= 8 && overlap / shorter >= 0.76;
}
