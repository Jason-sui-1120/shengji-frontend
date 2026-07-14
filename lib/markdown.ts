import type { FinalizedMeeting, FinalMinutesDraft } from "../types";
import { getExplicitSourceKind, getStatusLabel, parseStatusLabel, stripSourceLabel } from "./actions";

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function draftToDocumentHtml(draft: FinalMinutesDraft) {
  return `
    <h1>${escapeHtml(draft.title || "最终纪要")}</h1>
    <h2>总结</h2>
    <p>${escapeHtml(draft.overview || "暂无会议概览")}</p>
    <h2>智能章节</h2>
    ${draft.topics.map((topic) => `
      <h3>${escapeHtml(topic.title)}</h3>
      <ul>${topic.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
    `).join("")}
    <h2>明确决策</h2>
    <ul>${draft.decisions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无明确决策</li>"}</ul>
    <h2>风险与依赖</h2>
    <ul>${draft.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无风险与依赖</li>"}</ul>
    <h2>待澄清问题</h2>
    <ul>${draft.openQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无待澄清问题</li>"}</ul>
  `;
}

export function looksStructuredPlainText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return lines.some((line) => /^#{1,3}\s+/.test(line) || /^[-*•]\s+/.test(line) || /^\*\*.+\*\*$/.test(line) || /^(\d+)[.、]\s+/.test(line));
}

export function plainTextToDocumentHtml(text: string) {
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    html.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.、]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      continue;
    }
    const boldOnly = line.match(/^\*\*(.+)\*\*$/);
    if (boldOnly && boldOnly[1].length <= 48) {
      flushList();
      html.push(`<h3>${escapeHtml(boldOnly[1])}</h3>`);
      continue;
    }
    flushList();
    html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }
  flushList();
  return html.join("");
}

function inlineMarkdownToHtml(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function parseDraftDocument(html: string, fallback: FinalMinutesDraft): FinalMinutesDraft {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("h1")?.textContent?.trim() || fallback.title;
  const firstParagraph = doc.querySelector("h1 + p")?.textContent?.trim() || doc.querySelector("p")?.textContent?.trim() || fallback.overview;
  const sections = getDocumentSections(doc);
  const topicNodes = getSectionByAliases(sections, ["智能章节", "议题纪要", "章节纪要", "会议章节"]);
  const topics = parseTopicSections(topicNodes, fallback.topics);
  return {
    ...fallback,
    title,
    overview: firstParagraph || fallback.overview,
    topics,
    decisions: parseSectionList(getSectionByAliases(sections, ["明确决策", "决策", "会议决策"]), ["暂无明确决策"]),
    risks: parseSectionList(getSectionByAliases(sections, ["风险与依赖", "风险", "依赖", "风险提醒"]), ["暂无风险与依赖", "暂无风险", "暂无风险提醒"]),
    openQuestions: parseSectionList(getSectionByAliases(sections, ["待澄清问题", "待澄清", "问题", "遗留问题"]), ["暂无待澄清问题", "暂无待澄清"]),
    actionUpdates: fallback.actionUpdates,
  };
}

function getDocumentSections(doc: Document) {
  const sections = new Map<string, Element[]>();
  let currentTitle = "";
  for (const child of Array.from(doc.body.children)) {
    if (child.tagName === "H2") {
      currentTitle = child.textContent?.trim() || "";
      sections.set(currentTitle, []);
      continue;
    }
    if (currentTitle) sections.get(currentTitle)?.push(child);
  }
  return sections;
}

function getSectionByAliases(sections: Map<string, Element[]>, aliases: string[]) {
  for (const alias of aliases) {
    const exact = sections.get(alias);
    if (exact) return exact;
  }
  const normalizedAliases = aliases.map(normalizeSectionTitle);
  for (const [title, nodes] of sections.entries()) {
    const normalizedTitle = normalizeSectionTitle(title);
    if (normalizedAliases.some((alias) => normalizedTitle.includes(alias) || alias.includes(normalizedTitle))) {
      return nodes;
    }
  }
  return [];
}

function normalizeSectionTitle(title: string) {
  return title.replace(/\s+/g, "").replace(/[：:]/g, "").trim();
}

function parseTopicSections(nodes: Element[], fallback: FinalMinutesDraft["topics"]) {
  const topics: FinalMinutesDraft["topics"] = [];
  let current: { title: string; bullets: string[] } | null = null;
  for (const node of nodes) {
    if (node.tagName === "H3" || isStandaloneBoldTopic(node)) {
      if (current) topics.push(current);
      current = { title: node.textContent?.trim() || "会议议题", bullets: [] };
      continue;
    }
    if (node.tagName === "P") {
      const text = node.textContent?.trim();
      if (text) {
        if (!current) current = { title: "会议议题", bullets: [] };
        current.bullets.push(text);
      }
      continue;
    }
    if (node.tagName === "UL" || node.tagName === "OL") {
      const bullets = Array.from(node.querySelectorAll("li")).map((item) => item.textContent?.trim() || "").filter(Boolean);
      if (!current) current = { title: "会议议题", bullets: [] };
      current.bullets.push(...bullets);
    }
  }
  if (current) topics.push(current);
  return topics.length ? topics.slice(0, 8) : fallback;
}

function isStandaloneBoldTopic(node: Element) {
  if (node.tagName !== "P") return false;
  const text = node.textContent?.trim() || "";
  if (!text || text.length > 48) return false;
  const strongText = Array.from(node.querySelectorAll("strong, b")).map((item) => item.textContent?.trim() || "").join("").trim();
  if (!strongText) return false;
  return strongText === text || text.startsWith(strongText);
}

function parseSectionList(nodes: Element[] = [], emptyLabels: string[] = []) {
  const items = nodes.flatMap((node) => {
    if (node.tagName === "UL" || node.tagName === "OL") {
      return Array.from(node.querySelectorAll("li")).map((item) => item.textContent?.trim() || "");
    }
    return [node.textContent?.trim() || ""];
  }).map((item) => item.trim()).filter(Boolean);
  return items.filter((item) => !emptyLabels.includes(item));
}

export function parseActionLines(lines: string[], fallback: FinalMinutesDraft["actionUpdates"]) {
  const actions = lines
    .filter((line) => line !== "暂无待办")
    .map((line) => {
      const [title = "待办事项", owner = "待确认", due = "待确认", statusLabel = "待澄清", ...sourceParts] = line.split(/\s+[|｜]\s+/);
      return {
        title: title.trim() || "待办事项",
        owner: owner.trim() || "待确认",
        due: due.trim() || "待确认",
        status: parseStatusLabel(statusLabel),
        source: sourceParts.join(" | ").trim() || "本次新增：文档编辑",
      };
    });
  return actions.length ? actions.slice(0, 16) : fallback;
}

export function formatActionLine(action: FinalMinutesDraft["actionUpdates"][number]) {
  return `${action.title} | ${action.owner || "待确认"} | ${action.due || "待确认"} | ${getStatusLabel(action.status)} | ${action.source || "本次新增：会后归档"}`;
}

export function getDraftSourceCounts(draft: FinalMinutesDraft) {
  const allText = [
    draft.overview,
    ...draft.topics.flatMap((topic) => topic.bullets),
    ...draft.decisions,
    ...draft.risks,
    ...draft.openQuestions,
  ];
  return allText.reduce((counts, text) => {
    const kind = getExplicitSourceKind(String(text || ""));
    if (kind) counts[kind] += 1;
    return counts;
  }, { new: 0, continued: 0, updated: 0, closed: 0 });
}

export function getTimelineChapters(meeting: FinalizedMeeting) {
  if (meeting.timelineChapters?.length) return meeting.timelineChapters;
  return meeting.topics.slice(0, 8).map((topic, index) => ({
    startTime: index === 0 ? "开始" : `阶段 ${index + 1}`,
    title: topic.title,
    summary: topic.bullets.slice(0, 2).join("；") || "暂无章节摘要。",
  }));
}

export function getQuoteMoments(meeting: FinalizedMeeting) {
  return meeting.quoteMoments?.filter((moment) => moment.quote?.trim()) ?? [];
}

export function getSpeakerViewpoints(meeting: FinalizedMeeting) {
  if (meeting.speakerViewpoints?.length) return meeting.speakerViewpoints;
  const grouped = new Map<string, string[]>();
  for (const action of meeting.actionSnapshot) {
    const speaker = action.owner && action.owner !== "待确认" ? action.owner : "待确认负责人";
    grouped.set(speaker, [...(grouped.get(speaker) || []), `${action.title}：${stripSourceLabel(action.source || getStatusLabel(action.status))}`]);
  }
  if (!grouped.size && meeting.topics.length) {
    grouped.set("会议主要观点", meeting.topics.slice(0, 3).map((topic) => `${topic.title}：${topic.bullets[0] || "暂无观点"}`));
  }
  return Array.from(grouped.entries()).slice(0, 6).map(([speaker, viewpoints]) => ({
    speaker,
    viewpoints: viewpoints.slice(0, 3),
  }));
}
