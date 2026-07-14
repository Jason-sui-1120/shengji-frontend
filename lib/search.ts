import type { TranscriptLine, TranscriptPreviewState } from "../types";

export function doesArchiveMatchSearch<T extends {
  title: string;
  projectName: string;
  overview: string;
  topics: { title: string; bullets: string[] }[];
  timelineChapters?: { title: string; summary: string; startTime: string }[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  quoteMoments?: { quote: string; speaker: string; reason: string }[];
  speakerViewpoints?: { speaker: string; viewpoints: string[] }[];
  actionSnapshot: { title: string; owner: string; due: string; source: string }[];
}>(archive: T, query: string) {
  const keyword = normalizeSearchText(query);
  if (!keyword) return true;
  const haystack = normalizeSearchText([
    archive.title,
    archive.projectName,
    archive.overview,
    ...archive.topics.flatMap((topic) => [topic.title, ...topic.bullets]),
    ...(archive.timelineChapters || []).flatMap((chapter) => [chapter.title, chapter.summary, chapter.startTime]),
    ...archive.decisions,
    ...archive.risks,
    ...archive.openQuestions,
    ...(archive.quoteMoments || []).flatMap((moment) => [moment.quote, moment.speaker, moment.reason]),
    ...(archive.speakerViewpoints || []).flatMap((item) => [item.speaker, ...item.viewpoints]),
    ...archive.actionSnapshot.flatMap((action) => [action.title, action.owner, action.due, action.source]),
  ].join(" "));
  return haystack.includes(keyword);
}

export function normalizeSearchText(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

export function findTranscriptTarget(lines: TranscriptLine[], target?: TranscriptPreviewState["target"]) {
  if (!target || !lines.length) return null;
  if (target.text) {
    const normalizedTarget = normalizeMatchText(target.text);
    const exact = lines.find((line) => {
      const text = normalizeMatchText(line.text);
      return text.length >= 8 && normalizedTarget.length >= 8 && (text.includes(normalizedTarget) || normalizedTarget.includes(text));
    });
    if (exact) return exact.id;
    const scored = buildTranscriptWindows(lines)
      .map((window) => ({ window, score: getTextOverlapScore(normalizeMatchText(window.text), normalizedTarget) }))
      .sort((a, b) => b.score - a.score)[0];
    if (scored?.score >= 20) return scored.window.line.id;
  }
  if (target.time) {
    const targetMinutes = parseTranscriptTimeToMinutes(target.time);
    if (targetMinutes != null) {
      const matched = [...lines]
        .map((line) => ({ line, distance: Math.abs((parseTranscriptTimeToMinutes(line.time) ?? targetMinutes + 9999) - targetMinutes) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (matched) return matched.line.id;
    }
  }
  return lines[0].id;
}

function buildTranscriptWindows(lines: TranscriptLine[]) {
  const windows: { line: TranscriptLine; text: string }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    for (let size = 1; size <= 3; size += 1) {
      const slice = lines.slice(index, index + size);
      if (slice.length !== size) continue;
      windows.push({ line: slice[0], text: slice.map((line) => line.text).join("") });
    }
  }
  return windows;
}

export function parseTranscriptTimeToMinutes(value?: string) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[:：](\d{1,2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeMatchText(value: string) {
  return String(value || "").replace(/[「」"'“”‘’\s，。！？、；：:,.!?;()（）]/g, "").trim();
}

function getTextOverlapScore(text: string, target: string) {
  if (!text || !target) return 0;
  const short = target.length <= text.length ? target : text;
  const long = target.length <= text.length ? text : target;
  let score = 0;
  for (let size = Math.min(short.length, 24); size >= 4; size -= 1) {
    for (let index = 0; index <= short.length - size; index += 1) {
      if (long.includes(short.slice(index, index + size))) score = Math.max(score, size);
    }
    if (score) return score;
  }
  return score;
}
