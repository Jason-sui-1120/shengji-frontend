import React from "react";
import { createPortal } from "react-dom";
import type { SummaryBlock, TranscriptLine } from "../../types";

const CARD_COLORS = ["cc1", "cc2", "cc3", "cc1", "cc2", "cc3"];

type SummaryTopic = {
  title: string;
  blocks: SummaryBlock[];
};

export function LiveSummaryCanvas({
  blocks,
  transcripts = [],
}: {
  blocks: SummaryBlock[];
  transcripts?: TranscriptLine[];
}) {
  // 模型流式输出或旧数据偶尔会留下空壳 block。它们既没有标题也没有要点，
  // 不应渲染成一张大白卡片，更不能占据话题时间轴。
  const topics = React.useMemo(() => groupSummaryTopics(blocks.filter(hasSummaryContent)), [blocks]);
  const [topicMenuOpen, setTopicMenuOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  function toggleMenu() {
    if (topicMenuOpen) {
      setTopicMenuOpen(false);
      return;
    }
    const el = triggerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    }
    setTopicMenuOpen(true);
  }

  React.useEffect(() => {
    if (!topicMenuOpen) return;
    function handleDown(e: MouseEvent) {
      const target = e.target as Node;
      const popover = document.querySelector(".summary-topic-popover");
      if (popover && popover.contains(target)) return;
      const trigger = triggerRef.current;
      if (trigger && trigger.contains(target)) return;
      setTopicMenuOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [topicMenuOpen]);

  function scrollToBlock(block: SummaryBlock) {
    const id = getBlockDomId(block);
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    setTopicMenuOpen(false);
  }

  function scrollToTranscript(evidence: string) {
    const target = findTranscriptFromEvidence(evidence, transcripts);
    if (!target) return;
    const element = document.getElementById(`transcript-line-${target.id}`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.classList.add("transcript-line-jump");
    window.setTimeout(() => element?.classList.remove("transcript-line-jump"), 1600);
  }

  return (
    <div className="live-summary-canvas">
      {topics.length === 0 && (
        <div className="canvas-empty">
          <div className="canvas-empty-status"><i />正在建立本场会议脉络</div>
          <p>首条稳定转写到达后，会自动归纳讨论主题、结论与待办候选。</p>
          <div className="canvas-empty-lines" aria-hidden="true"><span /><span /><span /></div>
        </div>
      )}

      {topics.length > 0 && (
        <div className="summary-board">
          <div className="summary-topic-menu">
            <button
              ref={triggerRef}
              className="summary-topic-trigger"
              type="button"
              aria-expanded={topicMenuOpen}
              aria-label="展开话题列表"
              onClick={toggleMenu}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          {topicMenuOpen && menuPos && createPortal(
            <div className="summary-topic-popover" role="menu" aria-label="实时总结话题" style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}>
              {topics.map((topic) => (
                <div className="summary-topic-group-nav" key={topic.title}>
                  <button
                    type="button"
                    role="menuitem"
                    className="summary-topic-nav-title"
                    onClick={() => scrollToBlock(topic.blocks[0])}
                  >
                    <span>{topic.title}</span>
                  </button>
                  <div className="summary-topic-nav-modules">
                    {topic.blocks.map((block, bi) => (
                      <button
                        key={`${block.title}-${bi}`}
                        type="button"
                        className="summary-topic-nav-module"
                        onClick={() => scrollToBlock(block)}
                      >
                        {block.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>,
            document.body
          )}

          <div className="summary-topic-content">
            {topics.map((topic, topicIndex) => (
              <section className="summary-topic-group" key={topic.title}>
                <div className="summary-topic-label">{topic.title}</div>
                <div className="summary-topic-modules">
                  {topic.blocks.map((block, blockIndex) => (
                    <article
                      className={`summary-module ${CARD_COLORS[(topicIndex + blockIndex) % CARD_COLORS.length]}`}
                      id={getBlockDomId(block)}
                      key={`${block.id || block.title}-${blockIndex}`}
                    >
                      <div className="summary-module-head">
                        <div>
                          <strong>{block.title}</strong>
                          <span>{getStateLabel(block.state)}</span>
                        </div>
                        {block.cardType && block.cardType !== "text" && (
                          <em>{getCardTypeLabel(block.cardType)}</em>
                        )}
                      </div>
                      <ul>
                        {block.items.map((item, itemIndex) => (
                          <li key={`${block.title}-${itemIndex}`}>{item}</li>
                        ))}
                      </ul>
                      {block.evidence?.length ? (
                        <div className="summary-evidence-row">
                          <span>来源</span>
                          {block.evidence.slice(0, 3).map((item, evidenceIndex) => (
                            <button
                              key={`${block.title}-evidence-${evidenceIndex}`}
                              type="button"
                              onClick={() => scrollToTranscript(item)}
                              title={item}
                            >
                              {formatEvidenceLabel(item)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function hasSummaryContent(block: SummaryBlock) {
  if (isLegacyPlaceholder(block)) return false;
  const title = block.title?.trim() || "";
  const items = (block.items || []).some((item) => item?.trim());
  return Boolean(title || items);
}

// 兼容已落库的早期占位数据。它们不是模型输出，不应作为会议主题展示。
function isLegacyPlaceholder(block: SummaryBlock) {
  const title = block.title?.trim();
  const items = (block.items || []).filter((item) => item?.trim());
  return (
    (title === "等待分析" && items.length === 1 && items[0] === "点击右上角麦克风开始真实记录") ||
    (title === "会议重点" && items.length === 1 && items[0] === "AI 分析后会按现场语音动态分类")
  );
}

function groupSummaryTopics(blocks: SummaryBlock[]): SummaryTopic[] {
  const map = new Map<string, SummaryBlock[]>();
  for (const block of blocks) {
    const topic = block.parentTitle?.trim() || block.title;
    if (!map.has(topic)) map.set(topic, []);
    map.get(topic)?.push(block);
  }
  return [...map.entries()].map(([title, topicBlocks]) => ({ title, blocks: topicBlocks }));
}

function getBlockDomId(block: SummaryBlock) {
  return `summary-block-${block.id || encodeURIComponent(block.title)}`;
}

function getStateLabel(state: SummaryBlock["state"]) {
  return {
    done: "已归纳",
    live: "正在聊",
    next: "待延展",
  }[state];
}

function getCardTypeLabel(type: SummaryBlock["cardType"]) {
  return {
    metric: "指标",
    timeline: "阶段",
    capability: "能力",
    risk: "风险",
    decision: "决策",
    text: "",
  }[type || "text"];
}

function formatEvidenceLabel(evidence: string) {
  const time = evidence.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
  const speaker = evidence.match(/(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?([^：:]{2,12})[：:]/)?.[1]?.trim();
  if (time && speaker) return `${time} ${speaker}`;
  return time || "原文";
}

function findTranscriptFromEvidence(evidence: string, transcripts: TranscriptLine[]) {
  if (!transcripts.length) return null;
  const time = evidence.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
  const normalizedTime = time?.slice(0, 5);
  const textAfterColon = evidence.split(/[:：]/).slice(1).join("：").trim();
  const keywords = extractKeywords(textAfterColon || evidence);
  const candidates = normalizedTime
    ? transcripts.filter((line) => line.time?.slice(0, 5) === normalizedTime)
    : transcripts;
  const scored = candidates
    .map((line) => ({
      line,
      score: keywords.reduce((sum, keyword) => sum + (line.text.includes(keyword) ? keyword.length : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) return scored[0].line;
  if (normalizedTime) return candidates[0] || null;
  return null;
}

function extractKeywords(text: string) {
  return text
    .replace(/[，。、“”‘’；;,.!?！？\s]/g, " ")
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 8);
}
