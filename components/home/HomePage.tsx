import { Plus, ArrowRight, Pause, Square, ChevronRight, Check, Calendar, ExternalLink } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { FinalizedMeeting, ActionBacklogItem, Meeting, TranscriptLine, SpeakerStat, ActionStatus } from "../../types";
import { isOpenAction, getUrgencyLevel, type UrgencyLevel } from "../../lib/actions";
import { formatArchiveDate } from "../../lib/date";

/** 按截止日期倒序排列（近的在前，无日期的排最后） */
function sortByDueDesc(a: { due: string }, b: { due: string }): number {
  const parseDate = (due: string) => {
    const d = new Date(due);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };
  return parseDate(b.due || "") - parseDate(a.due || "");
}

export function HomePage({
  meeting,
  finalizedMeetings,
  actionBacklog,
  transcripts,
  speakerStats,
  summaryBlocks,
  elapsed,
  isRealAsrActive,
  finalizedMeeting,
  onNewMeeting,
  onEnterMeeting,
  onPauseRecording,
  onEndMeeting,
  onOpenActions,
  onOpenHistory,
  onUpdateAction,
}: {
  meeting: Meeting | null;
  finalizedMeetings: FinalizedMeeting[];
  actionBacklog: ActionBacklogItem[];
  transcripts: TranscriptLine[];
  speakerStats: SpeakerStat[];
  summaryBlocks: { title: string; items: string[]; state: string }[];
  elapsed: number;
  isRealAsrActive: boolean;
  finalizedMeeting: FinalizedMeeting | null;
  onNewMeeting: () => void;
  onEnterMeeting: () => void;
  onPauseRecording: () => void;
  onEndMeeting: () => void;
  onOpenActions: () => void;
  onOpenHistory: () => void;
  onUpdateAction?: (action: ActionBacklogItem, patch: { status?: ActionStatus; due?: string }) => void;
}) {
  const rightColRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);

  const isFinalized = finalizedMeeting?.meetingId === meeting?.id;
  const hasActiveMeeting = !isFinalized && (isRealAsrActive || (meeting && elapsed > 0) || (transcripts.length > 0));
  const recentMeetings = finalizedMeetings.slice(0, 3);
  const openActions = actionBacklog.filter(isOpenAction);

  // 按紧急度分类
  const urgentActions = openActions.filter((a) => {
    const level = getUrgencyLevel(a);
    return level === "overdue" || level === "urgent";
  });
  const normalActions = openActions.filter((a) => getUrgencyLevel(a) === "normal");
  const doneCount = actionBacklog.filter((a) => a.status === "done" || a.status === "cancelled").length;

  // 首页展示最多12条：紧急优先，然后普通，然后已完成，按时间倒序
  const doneActions = actionBacklog.filter((a) => a.status === "done" || a.status === "cancelled");
  const sortedUrgent = urgentActions.sort((a, b) => sortByDueDesc(a, b));
  const sortedNormal = normalActions.sort((a, b) => sortByDueDesc(a, b));
  const sortedDone = doneActions.sort((a, b) => sortByDueDesc(a, b));
  const displayActions = [...sortedUrgent, ...sortedNormal, ...sortedDone].slice(0, 12);

  // 左栏高度跟随右栏
  useEffect(() => {
    function syncHeight() {
      if (rightColRef.current && leftColRef.current) {
        const rightHeight = rightColRef.current.offsetHeight;
        leftColRef.current.style.maxHeight = `${rightHeight}px`;
      }
    }
    syncHeight();
    window.addEventListener("resize", syncHeight);
    const timer = setTimeout(syncHeight, 100);
    return () => { window.removeEventListener("resize", syncHeight); clearTimeout(timer); };
  }, [hasActiveMeeting, recentMeetings.length, displayActions.length]);

  const elapsedText = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const speakerCount = speakerStats.length;
  const transcriptCount = transcripts.length;
  const summaryCount = summaryBlocks.length;
  const actionCount = openActions.length;
  const lastBlock = summaryBlocks[summaryBlocks.length - 1];
  const liveSummaryText = lastBlock ? lastBlock.items.join("；") : "";

  return (
    <div className="home-page">
      <div className="home-dashboard">
        <div className="home-dash-two-col">
          {/* 左栏：今日待办 */}
          <div className="dash-section dash-todo-section" ref={leftColRef}>
            <div className="dash-section-head">
              <div className="dash-section-title">今日待办</div>
              <button className="dash-section-more" onClick={onOpenActions}>查看全部 →</button>
            </div>
            <div className="dash-stat-row">
              <div className="dash-stat dash-stat-urgent" title="已逾期 + 今明两天到期">
                <div className="dash-stat-num">{urgentActions.length}</div>
                <div className="dash-stat-label">紧急</div>
              </div>
              <div className="dash-stat dash-stat-normal">
                <div className="dash-stat-num">{normalActions.length}</div>
                <div className="dash-stat-label">普通</div>
              </div>
              <div className="dash-stat dash-stat-done">
                <div className="dash-stat-num">{doneCount}</div>
                <div className="dash-stat-label">已完成</div>
              </div>
            </div>
            <div className="dash-urgency-legend">
              <span><i className="dash-urgency-dot urgent" /> 紧急</span>
              <span><i className="dash-urgency-dot normal" /> 普通</span>
              <span><i className="dash-urgency-dot done" /> 已完成</span>
            </div>
            <div className="dash-todo-list">
              {displayActions.length > 0 ? (
                displayActions.map((action) => (
                  <TodoItem key={action.id} action={action} onUpdate={onUpdateAction} onJumpToSource={onOpenActions} />
                ))
              ) : (
                <div className="dash-empty-todo">暂无待办</div>
              )}
            </div>
          </div>

          {/* 右栏：进行中会议 + 近期会议 */}
          <div className="home-dash-right" ref={rightColRef}>
            {hasActiveMeeting ? (
              <div className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-section-title">进行中会议</div>
                </div>
                <ActiveMeetingCard
                  meeting={meeting}
                  elapsedText={elapsedText}
                  isRealAsrActive={isRealAsrActive}
                  speakerCount={speakerCount}
                  transcriptCount={transcriptCount}
                  summaryCount={summaryCount}
                  actionCount={actionCount}
                  liveSummaryText={liveSummaryText}
                  onEnter={onEnterMeeting}
                  onPause={onPauseRecording}
                  onEnd={onEndMeeting}
                />
              </div>
            ) : (
              <div className="dash-section">
                <div className="dash-section-head">
                  <div className="dash-section-title">开始新会议</div>
                </div>
                <EmptyHero onNewMeeting={onNewMeeting} />
              </div>
            )}

            <div className="dash-section">
              <div className="dash-section-head">
                <div className="dash-section-title">近期会议</div>
                <button className="dash-section-more" onClick={onOpenHistory}>查看全部 →</button>
              </div>
              {recentMeetings.length > 0 ? (
                recentMeetings.map((m) => (
                  <button className="dash-recent-item" key={m.meetingId} onClick={onOpenHistory}>
                    <i className={`dash-recent-dot ${m.risks.length > 0 ? "risk" : "done"}`} />
                    <div className="dash-recent-main">
                      <div className="dash-recent-title">{m.title}</div>
                      <div className="dash-recent-sub">{m.projectName}</div>
                    </div>
                    <div className="dash-recent-meta">{formatArchiveDate(m.createdAt)}</div>
                  </button>
                ))
              ) : (
                <div className="dash-empty-todo">暂无历史会议</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 可展开的待办项，带行内快捷操作 */
function TodoItem({
  action,
  onUpdate,
  onJumpToSource,
}: {
  action: ActionBacklogItem;
  onUpdate?: (action: ActionBacklogItem, patch: { status?: ActionStatus; due?: string }) => void;
  onJumpToSource: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const level = getUrgencyLevel(action);
  const statusLabel = getStatusShortLabel(action.status);

  return (
    <div className={`dash-todo-item ${expanded ? "expanded" : ""}`}>
      <button className="dash-todo-row" onClick={() => setExpanded(!expanded)}>
        <i className={`dash-todo-dot ${level}`} />
        <div className="dash-todo-text">{action.title}</div>
        <div className="dash-todo-meta">{statusLabel}</div>
        <ChevronRight size={14} className="dash-todo-chevron" />
      </button>
      {expanded && (
        <div className="dash-todo-quick">
          {onUpdate && (
            <>
              <button
                className="dash-quick-btn primary"
                onClick={() => onUpdate(action, { status: "done" })}
              >
                <Check size={13} /> 标记完成
              </button>
              <div className="dash-quick-status">
                {(["clarify", "confirmed", "in_progress"] as ActionStatus[]).map((s) => (
                  <button
                    key={s}
                    className={`dash-quick-chip ${action.status === s ? "active" : ""}`}
                    onClick={() => onUpdate(action, { status: s })}
                  >
                    {getStatusShortLabel(s)}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="dash-todo-source">
            <span>{action.meetingTitle}</span>
            <button className="dash-quick-link" onClick={onJumpToSource}>
              <ExternalLink size={11} /> 跳转
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusShortLabel(status: ActionStatus): string {
  switch (status) {
    case "candidate": return "候选";
    case "clarify": return "待澄清";
    case "confirmed": return "已确认";
    case "in_progress": return "进行中";
    case "done": return "已完成";
    case "cancelled": return "已取消";
  }
}

function EmptyHero({ onNewMeeting }: { onNewMeeting: () => void }) {
  return (
    <div className="home-empty-hero">
      <div className="home-empty-visual">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="14" y="6" width="12" height="18" rx="6" fill="var(--blue)" opacity="0.9"/>
          <path d="M10 20a10 10 0 0020 0" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
          <line x1="20" y1="30" x2="20" y2="36" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
          <line x1="15" y1="36" x2="25" y2="36" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
        </svg>
      </div>
      <div className="home-empty-text">
        <h2>还没有进行中的会议</h2>
        <p>开始录音后，声纪会自动完成转写、总结和待办提取</p>
      </div>
      <div className="home-empty-action">
        <button className="home-btn home-btn-primary home-btn-lg" onClick={onNewMeeting}>
          <Plus size={16} /> 新建会议
        </button>
      </div>
    </div>
  );
}

function ActiveMeetingCard({
  meeting,
  elapsedText,
  isRealAsrActive,
  speakerCount,
  transcriptCount,
  summaryCount,
  actionCount,
  liveSummaryText,
  onEnter,
  onPause,
  onEnd,
}: {
  meeting: Meeting | null;
  elapsedText: string;
  isRealAsrActive: boolean;
  speakerCount: number;
  transcriptCount: number;
  summaryCount: number;
  actionCount: number;
  liveSummaryText: string;
  onEnter: () => void;
  onPause: () => void;
  onEnd: () => void;
}) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  return (
    <div className="home-active-card">
      <div className="home-active-card-header">
        <div>
          <div className="home-active-title">{meeting?.title || "当前会议"}</div>
          <div className="home-active-project">{meeting?.projectName || "未指定项目"}</div>
        </div>
        <div className="home-active-right">
          {isRealAsrActive && (
            <div className="home-active-status">
              <span className="home-active-dot" /> 录音中
            </div>
          )}
          <div className="home-active-duration">{elapsedText}</div>
        </div>
      </div>

      <div className="home-live-strip">
        <div className="home-strip-item">
          <div className="home-strip-label">说话人</div>
          <div className="home-strip-value">{speakerCount} 人</div>
        </div>
        <div className="home-strip-item">
          <div className="home-strip-label">转写</div>
          <div className="home-strip-value">{transcriptCount} 条</div>
        </div>
        <div className="home-strip-item">
          <div className="home-strip-label">总结</div>
          <div className="home-strip-value">{summaryCount} 块</div>
        </div>
        <div className="home-strip-item">
          <div className="home-strip-label">待办</div>
          <div className="home-strip-value">{actionCount} 项</div>
        </div>
      </div>

      {liveSummaryText && (
        <div className="home-live-summary">
          <div className="home-live-summary-title">AI 实时摘要</div>
          <div className="home-live-summary-text">{liveSummaryText}</div>
        </div>
      )}

      <div className="home-active-actions">
        <button className="home-btn home-btn-primary home-btn-lg" onClick={onEnter}>
          进入会议 <ArrowRight size={16} />
        </button>
        {isRealAsrActive && (
          <button className="home-btn home-btn-lg" onClick={onPause}>
            <Pause size={16} /> 暂停录音
          </button>
        )}
        <button className="home-btn home-btn-lg home-btn-danger" onClick={() => setShowEndConfirm(true)}>
          <Square size={16} /> 结束归档
        </button>
      </div>
      {showEndConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="确认结束归档" onClick={() => setShowEndConfirm(false)}>
          <div className="home-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>确认结束归档？</h3>
            <p>结束后将停止录音并开始生成会议纪要，此操作不可撤销。</p>
            <div className="home-confirm-actions">
              <button className="home-btn" onClick={() => setShowEndConfirm(false)}>取消</button>
              <button className="home-btn home-btn-danger" onClick={() => { setShowEndConfirm(false); onEnd(); }}>
                <Square size={14} /> 确认结束
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
