import React from "react";
import { createPortal } from "react-dom";
import { Search, X, Edit3, GitMerge, Trash2, Tags } from "lucide-react";
import type { TranscriptLine, SpeakerStat } from "../../types";
import { getSpeakerOptions as getSpeakerOptionsFn, getSpeakerColor as getSpeakerColorFn, getSpeakerNumber as getSpeakerNumberFn } from "../../lib/speakers";

export function TranscriptPanel({
  transcripts,
  liveAsrText,
  calibrationStatus,
  isRealAsrActive,
  asrStatusLabel,
  speakerStats,
  speakerEditingId,
  speakerDraft,
  getSpeakerOptions = getSpeakerOptionsFn,
  onClose,
  onSpeakerCorrectionStart,
  onSpeakerCorrectionFinish,
  onSpeakerCorrectionCancel,
  onSpeakerDraftChange,
  onSpeakerRename,
  onSpeakerMerge,
  onSpeakerDelete,
  onGlossaryCorrection,
}: {
  transcripts: TranscriptLine[];
  liveAsrText: string;
  calibrationStatus?: string;
  isRealAsrActive: boolean;
  asrStatusLabel: string;
  speakerStats: SpeakerStat[];
  speakerEditingId: number | null;
  speakerDraft: string;
  getSpeakerOptions?: (transcripts: TranscriptLine[]) => string[];
  onClose?: () => void;
  onSpeakerCorrectionStart: (line: TranscriptLine) => void;
  onSpeakerCorrectionFinish: (line: TranscriptLine) => void;
  onSpeakerCorrectionCancel: () => void;
  onSpeakerDraftChange: (value: string) => void;
  onSpeakerRename: (oldName: string, newName: string) => void;
  onSpeakerMerge: (sourceName: string, targetName: string) => void;
  onSpeakerDelete: (speakerName: string) => void;
  onGlossaryCorrection?: (line: TranscriptLine, newText: string) => void;
}) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [mergeSource, setMergeSource] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [glossaryEditId, setGlossaryEditId] = React.useState<number | null>(null);
  const [glossaryDraft, setGlossaryDraft] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null);
  const chipRefMap = React.useRef<Record<string, HTMLDivElement | null>>({});

  const otherSpeakers = (name: string) => speakerStats.filter((s) => s.name !== name).map((s) => s.name);

  // Click-away: close menu when clicking outside
  React.useEffect(() => {
    if (!openMenu) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      // Don't close if clicking inside the dropdown menu
      const dropdown = document.querySelector(".speaker-dropdown");
      if (dropdown && dropdown.contains(target)) return;
      // Don't close if clicking on a chip (let chip handler toggle)
      if ((target as HTMLElement).closest(".speaker-chip")) return;
      setOpenMenu(null);
      setMenuPos(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openMenu]);

  function openSpeakerMenu(name: string) {
    const el = chipRefMap.current[name];
    if (el) {
      const rect = el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpenMenu(openMenu === name ? null : name);
  }

  const filteredTranscripts = searchQuery.trim()
    ? transcripts.filter((line) =>
        line.text.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        line.speaker.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : transcripts;

  function handleRenameConfirm(oldName: string) {
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== oldName) {
      onSpeakerRename(oldName, trimmed);
    }
    setRenameTarget(null);
    setRenameDraft("");
  }

  function handleMergeSelect(source: string, target: string) {
    onSpeakerMerge(source, target);
    setMergeSource(null);
    setOpenMenu(null);
  }

  return (
    <section className="panel transcript-panel">
      <div className="panel-header">
        <div>
          <h2>实时转写</h2>
          <span>{isRealAsrActive ? asrStatusLabel : `${transcripts.length} 条记录`}</span>
        </div>
        <div className="panel-actions">
          <button className="ghost-button" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}><Search size={15} />{searchOpen ? "关闭搜索" : "搜索"}</button>
          {onClose && (
            <button className="icon-button" onClick={onClose} aria-label="收起" title="收起"><X size={16} /></button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="transcript-search-bar">
          <Search size={14} />
          <input
            type="text"
            placeholder="搜索转写内容或说话人..."
            value={searchQuery}
            autoFocus
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
          />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}><X size={14} /></button>}
        </div>
      )}

      {speakerStats.length > 0 && (
        <div className="speaker-bar" aria-label="本场发言人">
          <span className="speaker-bar-label">说话人</span>
          {speakerStats.map((speaker) => {
            const color = getSpeakerColorFn(transcripts, speaker.name);
            const num = getSpeakerNumberFn(transcripts, speaker.name);
            return (
              <div className="speaker-chip" key={speaker.name} ref={(el) => { chipRefMap.current[speaker.name] = el; }}>
                {renameTarget === speaker.name ? (
                  <input
                    className="speaker-rename-input"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.currentTarget.value)}
                    onBlur={() => handleRenameConfirm(speaker.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") { setRenameTarget(null); setRenameDraft(""); }
                    }}
                  />
                ) : mergeSource === speaker.name ? (
                  <div className="speaker-merge-panel">
                    <span className="merge-hint">合并到 →</span>
                    {otherSpeakers(speaker.name).map((target) => (
                      <button key={target} className="merge-target-btn" onClick={() => handleMergeSelect(speaker.name, target)}>
                        {target}
                      </button>
                    ))}
                    <button className="merge-cancel" onClick={() => setMergeSource(null)}>取消</button>
                  </div>
                ) : (
                  <>
                    <div className="sp-avatar" style={{ background: color.bg }} onClick={() => openSpeakerMenu(speaker.name)}>{num}</div>
                    <span onClick={() => openSpeakerMenu(speaker.name)}>{speaker.name}</span>
                    <span className="sp-edit" onClick={(e) => { e.stopPropagation(); setRenameTarget(speaker.name); setRenameDraft(speaker.name); }}><Edit3 size={11} /></span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {openMenu && menuPos && createPortal(
        <div className="speaker-dropdown" style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}>
          <div className="speaker-dropdown-item" onClick={() => { setRenameTarget(openMenu); setRenameDraft(openMenu); setOpenMenu(null); setMenuPos(null); }}>
            <Edit3 size={13} />编辑名称
          </div>
          {otherSpeakers(openMenu).length > 0 && (
            <div className="speaker-dropdown-item" onClick={() => { setMergeSource(openMenu); setOpenMenu(null); setMenuPos(null); }}>
              <GitMerge size={13} />合并说话人
            </div>
          )}
          <div className="speaker-dropdown-divider" />
          <div className="speaker-dropdown-item danger" onClick={() => { onSpeakerDelete(openMenu); setOpenMenu(null); setMenuPos(null); }}>
            <Trash2 size={13} />删除
          </div>
        </div>,
        document.body
      )}

      <div className="transcript-list">
        <datalist id="speaker-options">
          {getSpeakerOptions(transcripts).map((speaker) => <option key={speaker} value={speaker} />)}
        </datalist>
        {liveAsrText && (
          <article className="transcript-line live-partial">
            <div className="transcript-meta">
              <div className="sp-avatar-sm" style={{ background: "var(--muted)" }}>·</div>
              <span className="speaker-tag">实时</span>
              <span className="transcript-time">自动识别中</span>
            </div>
            <div className="transcript-text">{liveAsrText}</div>
          </article>
        )}
        {calibrationStatus && (
          <div className="transcript-calibration-status" role="status">
            <span className="transcript-calibration-pulse" />
            {calibrationStatus}
          </div>
        )}
        {[...filteredTranscripts].reverse().map((line, index) => {
          const isRealtimePreview = Boolean(line.isRealtimePreview);
          const color = getSpeakerColorFn(transcripts, line.speaker);
          const num = getSpeakerNumberFn(transcripts, line.speaker);
          return (
            <article
              key={(line as TranscriptLine & { presentationKey?: string }).presentationKey || `${line.id}-${index}`}
              id={`transcript-line-${line.id}`}
              data-transcript-time={line.time}
              className={`transcript-line ${line.focus ? "active" : ""} ${(line as TranscriptLine & { recentlyCalibrated?: boolean }).recentlyCalibrated ? "was-calibrated" : ""}`}
            >
              <div className="transcript-meta">
                <div className="sp-avatar-sm" style={{ background: color.bg }}>{num}</div>
                {speakerEditingId === line.id && !isRealtimePreview ? (
                  <input
                    aria-label="纠正发言人"
                    className="speaker-input"
                    value={speakerDraft}
                    list="speaker-options"
                    autoFocus
                    onChange={(event) => onSpeakerDraftChange(event.currentTarget.value)}
                    onBlur={() => onSpeakerCorrectionFinish(line)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") onSpeakerCorrectionCancel();
                    }}
                  />
                ) : (
                  <span
                    className="speaker-tag"
                    style={{ color: color.bg, cursor: isRealtimePreview ? "default" : "pointer" }}
                    onClick={isRealtimePreview ? undefined : () => onSpeakerCorrectionStart(line)}
                  >
                    {line.speaker}
                  </span>
                )}
                <span className="transcript-time">{line.time}</span>
              </div>
              <div className="transcript-text">
                {glossaryEditId === line.id ? (
                  <div className="transcript-glossary-edit">
                    <input
                      className="glossary-edit-input"
                      value={glossaryDraft}
                      autoFocus
                      onChange={(e) => setGlossaryDraft(e.currentTarget.value)}
                      onBlur={() => {
                        if (glossaryDraft.trim() && glossaryDraft.trim() !== line.text && onGlossaryCorrection) {
                          onGlossaryCorrection(line, glossaryDraft.trim());
                        }
                        setGlossaryEditId(null);
                        setGlossaryDraft("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          setGlossaryEditId(null);
                          setGlossaryDraft("");
                        }
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <span>{line.text}</span>
                    {onGlossaryCorrection && !isRealtimePreview && (
                      <button
                        className="transcript-inline-action"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setGlossaryEditId(line.id);
                          setGlossaryDraft(line.text);
                        }}
                        title="编辑转写文本，自动提取热词并回刷"
                      >
                        <Tags size={12} />
                        修词
                      </button>
                    )}
                  </>
                )}
              </div>
              <TranscriptQualityBadges line={line} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TranscriptQualityBadges({ line }: { line: TranscriptLine }) {
  const badges: string[] = [];
  if (line.isRealtimePreview) badges.push("实时草稿");
  else if (line.stabilityStatus === "draft") badges.push("待稳定校准");
  if (line.correctionApplied) badges.push("已校正");
  if (line.userEdited) badges.push("人工已编辑");
  else if (line.correctionSource === "huoshan-asr") badges.push("高质量校准");
  if (line.asrQuality?.rms && line.asrQuality.rms < 0.015) badges.push("音量偏低");
  if (line.asrQuality?.silenceRatio !== undefined && line.asrQuality.silenceRatio >= 0.65) badges.push("静音偏高");
  if (line.flushReason && !["endpoint", "max_text"].includes(line.flushReason)) badges.push(`因${formatFlushReason(line.flushReason)}落稿`);
  if (!badges.length) return null;
  return (
    <div className="transcript-quality-badges">
      {badges.map((badge) => <span key={badge}>{badge}</span>)}
    </div>
  );
}

function formatFlushReason(reason: string) {
  const map: Record<string, string> = {
    stop: "停止录音",
    client_close: "页面断开",
    upstream_close: "连接恢复",
    speech_restart: "新发言",
  };
  return map[reason] || reason;
}
