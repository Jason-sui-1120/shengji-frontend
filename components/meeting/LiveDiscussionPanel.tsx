import type { SummaryBlock, TranscriptLine } from "../../types";

export function LiveDiscussionPanel({
  blocks,
  transcripts,
  liveAsrText,
  getSpeakerColor,
  getSpeakerNumber,
}: {
  blocks: SummaryBlock[];
  transcripts: TranscriptLine[];
  liveAsrText: string;
  getSpeakerColor: (transcripts: TranscriptLine[], speakerName: string) => { bg: string; bgLight: string };
  getSpeakerNumber: (transcripts: TranscriptLine[], speakerName: string) => number;
}) {
  // 正在讨论的主题：最后一个区块（无论 state），或最后一个 live 区块
  const liveBlocks = blocks.filter((b) => b.state === "live");
  const currentLiveBlock = liveBlocks[liveBlocks.length - 1] ?? blocks[blocks.length - 1];

  // 如果有 live block 用它，否则用最近转写兜底
  const speakerSummaries = buildSpeakerSummaries(transcripts);

  return (
    <div className="live-discussion-panel">
      {liveAsrText && (
        <div className="live-discussion-active">
          <div className="live-active-dot" />
          <span className="live-active-text">实时识别中：{liveAsrText}</span>
        </div>
      )}

      {transcripts.length === 0 && !liveAsrText && (
        <div className="live-empty">
          尚未开始录音，开始后 AI 会识别当前讨论主题，并按说话人总结发言要点。
        </div>
      )}

      {currentLiveBlock && (
        <div className="live-topic-header">
          <div className="live-topic-title">{currentLiveBlock.title}</div>
        </div>
      )}

      {!currentLiveBlock && speakerSummaries.length > 0 && (
        <div className="live-topic-header">
          <div className="live-topic-title">最近讨论</div>
        </div>
      )}

      {speakerSummaries.map((item, index) => {
        const color = getSpeakerColor(transcripts, item.speaker);
        const num = getSpeakerNumber(transcripts, item.speaker);
        return (
          <div className="live-item" key={`${item.speaker}-${index}`}>
            <div className="sp-avatar-sm" style={{ background: color.bg }}>{num}</div>
            <div className="live-item-content">
              <div className="live-item-header">
                <span className="live-item-name" style={{ color: color.bg }}>{item.speaker}</span>
              </div>
              <div className="live-item-text">{item.summary}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface SpeakerSummary {
  speaker: string;
  summary: string;
}

// 按说话人提取最近的发言生成摘要
function buildSpeakerSummaries(transcripts: TranscriptLine[]): SpeakerSummary[] {
  if (transcripts.length === 0) return [];
  // 取最近的转写，按说话人合并
  const recent = [...transcripts].reverse().slice(0, 12);
  const bySpeaker = new Map<string, string[]>();
  for (const line of recent) {
    const list = bySpeaker.get(line.speaker) ?? [];
    list.push(line.text);
    bySpeaker.set(line.speaker, list);
  }
  const summaries: SpeakerSummary[] = [];
  for (const [speaker, texts] of bySpeaker) {
    const summary = texts.slice(0, 3).join("；");
    summaries.push({ speaker, summary });
  }
  return summaries;
}
