import React from "react";
import { Archive, Download, Headphones, Plus, Search, Edit3, Save, X, Trash2 } from "lucide-react";
import { ALL_PROJECTS } from "../../types";
import type { FinalizedMeeting, MeetingSegment, Project, TranscriptLine, TranscriptPreviewState, TranscriptSearchResult } from "../../types";
import { isOpenAction, getStatusLabel } from "../../lib/actions";
import { formatArchiveDate } from "../../lib/date";
import {
  getQuoteMoments,
  getSpeakerViewpoints,
  getTimelineChapters,
} from "../../lib/markdown";
import { doesArchiveMatchSearch, findTranscriptTarget } from "../../lib/search";
import { apiJson } from "../../lib/api";

export function HistoryMeetingsPage({
  archives,
  projects,
  selectedProject,
  selectedMeetingId,
  initialSearch = "",
  onProjectChange,
  onSelect,
  onExport,
  onExportTranscripts,
  onNewMeeting,
  onReEdit,
  onDeleteMeeting,
  onBack,
}: {
  archives: FinalizedMeeting[];
  projects: Project[];
  selectedProject: string;
  selectedMeetingId: number | null;
  initialSearch?: string;
  onProjectChange: (projectName: string) => void;
  onSelect: (meetingId: number | null) => void;
  onExport: (meeting: FinalizedMeeting) => void;
  onExportTranscripts: (meeting: FinalizedMeeting) => void;
  onNewMeeting: () => void;
  onReEdit: (meeting: FinalizedMeeting) => void;
  onDeleteMeeting?: (meetingId: number) => void;
  onBack?: () => void;
}) {
  const [detailTab, setDetailTab] = React.useState<"minutes" | "playback">("minutes");
  const [playbackTarget, setPlaybackTarget] = React.useState<TranscriptPreviewState["target"]>();
  const [archiveSearch, setArchiveSearch] = React.useState(initialSearch);

  // 当外部搜索词变化时同步
  React.useEffect(() => {
    if (initialSearch) setArchiveSearch(initialSearch);
  }, [initialSearch]);
  const [transcriptResults, setTranscriptResults] = React.useState<TranscriptSearchResult[]>([]);
  const [searchMode, setSearchMode] = React.useState<"archive" | "transcript">("archive");
  const [displayLimit, setDisplayLimit] = React.useState(20);
  const timelineListRef = React.useRef<HTMLDivElement>(null);
  const [projectFilterExpanded, setProjectFilterExpanded] = React.useState(false);
  const [transcriptSearching, setTranscriptSearching] = React.useState(false);
  const [segments, setSegments] = React.useState<MeetingSegment[]>([]);
  const sortedAllArchives = [...archives].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const projectNames = Array.from(new Set([...projects.map((project) => project.name), ...archives.map((archive) => archive.projectName)])).filter(Boolean);
  const scopedArchives = selectedProject === ALL_PROJECTS
    ? sortedAllArchives
    : sortedAllArchives.filter((archive) => archive.projectName === selectedProject);
  const visibleArchives = archiveSearch.trim()
    ? scopedArchives.filter((archive) => doesArchiveMatchSearch(archive, archiveSearch))
    : scopedArchives;
  const selectedArchive = selectedMeetingId
    ? sortedAllArchives.find((archive) => archive.meetingId === selectedMeetingId)
    : null;
  const projectLabel = selectedProject === ALL_PROJECTS ? "全部项目" : selectedProject;
  const timelineChapters = selectedArchive ? getTimelineChapters(selectedArchive) : [];
  const quoteMoments = selectedArchive ? getQuoteMoments(selectedArchive) : [];

  React.useEffect(() => {
    if (!selectedArchive) { setSegments([]); return; }
    let cancelled = false;
    void apiJson<MeetingSegment[]>(`/api/meeting-segments?meetingId=${selectedArchive.meetingId}`)
      .then((data) => { if (!cancelled) setSegments(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setSegments([]); });
    return () => { cancelled = true; };
  }, [selectedArchive?.meetingId]);
  const speakerViewpoints = selectedArchive ? getSpeakerViewpoints(selectedArchive) : [];

  function openTranscriptPreview(_archive: FinalizedMeeting, target?: TranscriptPreviewState["target"]) {
    setPlaybackTarget(target);
    setDetailTab("playback");
  }

  React.useEffect(() => {
    const query = archiveSearch.trim();
    if (!query || searchMode !== "transcript") {
      setTranscriptResults([]);
      setTranscriptSearching(false);
      return;
    }
    setTranscriptSearching(true);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const project = selectedProject === ALL_PROJECTS ? "" : selectedProject;
        const result = await apiJson<{ ok: boolean; results: TranscriptSearchResult[] }>(
          `/api/search/transcripts?q=${encodeURIComponent(query)}&project=${encodeURIComponent(project)}`,
        );
        if (!cancelled) {
          setTranscriptResults(result.ok ? result.results : []);
          setTranscriptSearching(false);
        }
      } catch {
        if (!cancelled) {
          setTranscriptResults([]);
          setTranscriptSearching(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [archiveSearch, searchMode, selectedProject]);

  function jumpToTranscriptMatch(result: TranscriptSearchResult, match: TranscriptSearchResult["matches"][number]) {
    const archive = sortedAllArchives.find((item) => item.meetingId === result.meetingId);
    if (!archive) return;
    onSelect(archive.meetingId);
    setTimeout(() => {
      openTranscriptPreview(archive, { text: match.snippet.replace(/^[.。]+|[.。]+$/g, "").trim() });
    }, 100);
  }

  function downloadAudio(meeting: FinalizedMeeting) {
    const a = document.createElement("a");
    a.href = `/api/meetings/${meeting.meetingId}/playback`;
    a.download = `${meeting.title}.wav`;
    a.click();
  }

  function highlightSnippet(snippet: string, keyword: string): React.ReactNode {
    if (!keyword) return snippet;
    const normalizedKeyword = keyword.toLowerCase().replace(/\s+/g, "");
    if (!normalizedKeyword) return snippet;
    const normalizedSnippet = snippet.toLowerCase().replace(/\s+/g, "");
    const idx = normalizedSnippet.indexOf(normalizedKeyword);
    if (idx === -1) return snippet;
    let originalIdx = -1;
    let normalizedPos = 0;
    for (let i = 0; i < snippet.length; i++) {
      if (normalizedPos === idx) { originalIdx = i; break; }
      const ch = snippet[i].toLowerCase();
      if (ch && !/\s/.test(ch)) normalizedPos++;
    }
    if (originalIdx === -1) return snippet;
    let matchEnd = originalIdx;
    let matchNormLen = 0;
    while (matchEnd < snippet.length && matchNormLen < normalizedKeyword.length) {
      const ch = snippet[matchEnd].toLowerCase();
      if (ch && !/\s/.test(ch)) matchNormLen++;
      matchEnd++;
    }
    return (
      <>
        {snippet.slice(0, originalIdx)}
        <mark className="search-highlight">{snippet.slice(originalIdx, matchEnd)}</mark>
        {snippet.slice(matchEnd)}
      </>
    );
  }

  if (!sortedAllArchives.length) {
    return (
      <section className="history-page empty">
        <div className="history-page-head">
          <div>
            <h1 className="timeline-page-title">会议</h1>
          </div>
        </div>
        <div className="empty-archive">
          <Archive size={26} />
          <h2>暂无归档会议</h2>
          <p>会议结束并确认归档后，会在这里沉淀为可回看、可导出的会议档案。</p>
          <button className="primary-button" onClick={onNewMeeting}><Plus size={15} />新建会议</button>
        </div>
      </section>
    );
  }

  if (!selectedArchive) {
    // 按周分组
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const groups: { label: string; items: typeof visibleArchives }[] = [
      { label: "本周", items: [] },
      { label: "上周", items: [] },
      { label: "更早", items: [] },
    ];
    for (const archive of visibleArchives) {
      const date = new Date(archive.createdAt);
      if (date >= startOfWeek) groups[0].items.push(archive);
      else if (date >= startOfLastWeek) groups[1].items.push(archive);
      else groups[2].items.push(archive);
    }

    return (
      <section className="history-page">
        <div className="history-page-head">
          <div>
            <h1 className="timeline-page-title">会议</h1>
            <div className="timeline-page-sub">{visibleArchives.length} 份归档 · 按时间线排列</div>
          </div>
        </div>

        {/* 项目 chip 筛选条 */}
        <div className="timeline-filter">
          <button
            className={`timeline-chip ${selectedProject === ALL_PROJECTS ? "active" : ""}`}
            onClick={() => { onProjectChange(ALL_PROJECTS); setDisplayLimit(20); }}
          >
            全部
          </button>
          {(projectFilterExpanded ? projectNames : projectNames.slice(0, 5)).map((name) => (
            <button
              key={name}
              className={`timeline-chip ${selectedProject === name ? "active" : ""}`}
              onClick={() => { onProjectChange(name); setDisplayLimit(20); }}
            >
              {name}
            </button>
          ))}
          {projectNames.length > 5 && (
            <button
              className="timeline-chip toggle"
              onClick={() => setProjectFilterExpanded(!projectFilterExpanded)}
            >
              {projectFilterExpanded ? "收起" : `+${projectNames.length - 5}`}
            </button>
          )}
        </div>

        {searchMode === "transcript" && archiveSearch.trim() ? (
          <div className="archive-list-page">
            <div className="archive-list-head">
              <strong>{transcriptSearching ? "搜索中..." : `${transcriptResults.length} 场会议匹配`}</strong>
              <span>搜索「{archiveSearch.trim()}」在转写全文中的出现</span>
            </div>
            {transcriptSearching ? (
              <div className="empty-archive compact">
                <Search size={24} />
                <h2>正在搜索转写...</h2>
              </div>
            ) : transcriptResults.length ? (
              <div className="transcript-search-results">
                {transcriptResults.map((result) => (
                  <div key={result.meetingId} className="transcript-search-card">
                    <div className="transcript-search-head">
                      <button type="button" onClick={() => onSelect(result.meetingId)}>
                        <strong>{result.title}</strong>
                      </button>
                      <span>{result.projectName} · {formatArchiveDate(result.createdAt)} · {result.matchCount} 处匹配</span>
                    </div>
                    {result.matches.map((match, matchIndex) => (
                      <button
                        key={`${result.meetingId}-${match.transcriptId}-${matchIndex}`}
                        type="button"
                        className="transcript-search-match"
                        onClick={() => jumpToTranscriptMatch(result, match)}
                      >
                        <em>{match.time}</em>
                        <span>{match.speaker}</span>
                        <p>{highlightSnippet(match.snippet, archiveSearch.trim())}</p>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-archive compact">
                <Search size={24} />
                <h2>转写中未找到匹配</h2>
              </div>
            )}
          </div>
        ) : (
        <div
          className="timeline-list"
          ref={timelineListRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
              setDisplayLimit((prev) => prev + 20);
            }
          }}
        >
          {(() => {
            let shown = 0;
            return groups.filter((g) => g.items.length > 0).map((group) => {
              const remaining = Math.max(0, displayLimit - shown);
              if (remaining <= 0) return null;
              const items = group.items.slice(0, remaining);
              shown += items.length;
              return (
            <div className="timeline-group" key={group.label}>
              <div className="timeline-group-head">{group.label}</div>
              {items.map((archive) => {
                const openCount = archive.actionSnapshot.filter((a) => isOpenAction(a)).length;
                const totalCount = archive.actionSnapshot.length;
                return (
                  <button
                    key={archive.meetingId}
                    className="timeline-meeting-card"
                    onClick={() => onSelect(archive.meetingId)}
                  >
                    <div className="timeline-meeting-icon" data-project={archive.projectName}>
                      {archive.projectName.charAt(0)}
                    </div>
                    <div className="timeline-meeting-body">
                      <div className="timeline-meeting-title">{archive.title}</div>
                      <div className="timeline-meeting-meta">
                        <span className="timeline-project-tag">{archive.projectName}</span>
                        <span>{formatArchiveDate(archive.createdAt)}</span>
                        <span>{archive.transcriptCount} 条转写</span>
                      </div>
                    </div>
                    <div className="timeline-meeting-actions">
                      {openCount > 0 ? (
                        <span className="timeline-action-count has">{openCount}/{totalCount} 待办</span>
                      ) : totalCount > 0 ? (
                        <span className="timeline-action-count none">待办已清</span>
                      ) : (
                        <span className="timeline-action-count none">无待办</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
              );
            });
          })()}
          {visibleArchives.length === 0 && (
            <div className="empty-archive compact">
              <Archive size={24} />
              <h2>{archiveSearch.trim() ? "没有匹配的会议" : "当前项目暂无归档会议"}</h2>
            </div>
          )}
        </div>
        )}
      </section>
    );
  }

  return (
    <>
    <section className="history-page">
      <div className="history-page-head">
        <div>
          <div className="breadcrumb">{selectedArchive.projectName} · {formatArchiveDate(selectedArchive.createdAt)}</div>
          <h1>{selectedArchive.title}</h1>
        </div>
        <div className="history-page-actions">
          <button className="secondary-button" onClick={() => onBack ? onBack() : onSelect(null)}>返回列表</button>
          <button className="primary-button" onClick={() => onReEdit(selectedArchive)}><Edit3 size={15} />重新编辑</button>
          {onDeleteMeeting && (
            <button className="danger-button" onClick={() => {
              if (confirm(`确定删除会议「${selectedArchive.title}」？相关转写和待办将一起移入回收站。`)) {
                onDeleteMeeting(selectedArchive.meetingId);
                onSelect(null);
              }
            }}><Trash2 size={15} />删除</button>
          )}
        </div>
      </div>

      <article className="archive-detail full">
          <div className="archive-meta">
            <span>{selectedArchive.transcriptCount} 条转写</span>
            <span>{selectedArchive.topics.length} 个总结主题</span>
            <span>{timelineChapters.length} 个时间章节</span>
            <span>{selectedArchive.decisions.length} 条决策</span>
            <span>{selectedArchive.risks.length} 个风险</span>
            <span>{selectedArchive.actionSnapshot.length} 项待办</span>
          </div>

          <div className="archive-detail-tabs" role="tablist" aria-label="历史会议内容">
            <button type="button" role="tab" aria-selected={detailTab === "minutes"} className={detailTab === "minutes" ? "active" : ""} onClick={() => setDetailTab("minutes")}>智能纪要</button>
            <button type="button" role="tab" aria-selected={detailTab === "playback"} className={detailTab === "playback" ? "active" : ""} onClick={() => setDetailTab("playback")}><Headphones size={15} />回听与转写</button>
            <div className="archive-detail-tab-actions">
              {detailTab === "minutes" ? (
                <button className="secondary-button" onClick={() => onExport(selectedArchive)}><Download size={14} />下载智能纪要</button>
              ) : (
                <>
                  <button className="secondary-button" onClick={() => onExportTranscripts(selectedArchive)}><Download size={14} />下载转写</button>
                  <button className="secondary-button" onClick={() => downloadAudio(selectedArchive)}><Download size={14} />下载录音</button>
                </>
              )}
            </div>
          </div>

          {detailTab === "playback" ? (
            <ArchivePlaybackPanel meeting={selectedArchive} target={playbackTarget} onClearTarget={() => setPlaybackTarget(undefined)} />
          ) : <>

          <ArchiveOverviewBoard meeting={selectedArchive} />

          <ArchiveActionsSection actions={selectedArchive.actionSnapshot} />

          <section>
            <h3>智能总结</h3>
            {selectedArchive.topics.length ? selectedArchive.topics.map((topic) => (
              <div className="archive-topic" key={topic.title}>
                <h4>{topic.title}</h4>
                <ul>{topic.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
              </div>
            )) : <p>暂无智能总结。</p>}
          </section>

          <ArchiveTimelineSection chapters={timelineChapters} onJump={(chapter) => openTranscriptPreview(selectedArchive, { time: chapter.startTime })} />

          {segments.length > 0 && (
            <section>
              <h3>会中议题证据</h3>
              {segments.map((seg, si) => (
                <div className="archive-segment" key={`seg-${si}`}>
                  <div className="archive-segment-head">
                    <h4>{seg.title}</h4>
                    <span className="archive-segment-meta">{seg.startTime}{seg.endTime ? ` ~ ${seg.endTime}` : ""} · {seg.status}</span>
                  </div>
                  {seg.summary && <p className="archive-segment-summary">{seg.summary}</p>}
                  {seg.evidenceQuotes.length > 0 && (
                    <div className="archive-segment-evidence">
                      <span>来源</span>
                      {seg.evidenceQuotes.map((quote, qi) => (
                        <button
                          key={`eq-${si}-${qi}`}
                          className="evidence-jump-btn"
                          onClick={() => openTranscriptPreview(selectedArchive, { text: quote })}
                          title={quote}
                        >
                          {quote.match(/\b\d{1,2}:\d{2}\b/)?.[0] || `证据${qi + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                  {seg.candidateActions.length > 0 && (
                    <div className="archive-segment-candidates">
                      <span>候选待办</span>
                      <ul>{seg.candidateActions.map((a, ai) => <li key={`a-${si}-${ai}`}>{a}</li>)}</ul>
                    </div>
                  )}
                  {seg.candidateDecisions.length > 0 && (
                    <div className="archive-segment-candidates">
                      <span>候选决策</span>
                      <ul>{seg.candidateDecisions.map((d, di) => <li key={`d-${si}-${di}`}>{d}</li>)}</ul>
                    </div>
                  )}
                  {seg.candidateRisks.length > 0 && (
                    <div className="archive-segment-candidates">
                      <span>候选风险</span>
                      <ul>{seg.candidateRisks.map((r, ri) => <li key={`r-${si}-${ri}`}>{r}</li>)}</ul>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          <ArchiveListSection title="明确决策" items={selectedArchive.decisions} emptyText="暂无明确决策。" />
          <ArchiveQuotesSection moments={quoteMoments} onJump={(moment) => openTranscriptPreview(selectedArchive, { text: moment.quote })} />
          <ArchiveSpeakerViewpointsSection viewpoints={speakerViewpoints} />
          <ArchiveListSection title="风险与依赖" items={selectedArchive.risks} emptyText="暂无风险与依赖。" />
          <ArchiveListSection title="待澄清问题" items={selectedArchive.openQuestions} emptyText="暂无待澄清问题。" />
          </>}
      </article>
    </section>
    </>
  );
}

function ArchiveOverviewBoard({ meeting }: { meeting: FinalizedMeeting }) {
  const firstTopic = meeting.topics[0];
  const keyAction = meeting.actionSnapshot.find((action) => isOpenAction(action)) || meeting.actionSnapshot[0];
  const decision = meeting.decisions[0];
  const risk = meeting.risks[0] || meeting.openQuestions[0];
  return (
    <section className="archive-overview-board">
      <div className="overview-board-main">
        <span>总结</span>
        <p>{meeting.overview || "暂无会议概览。"}</p>
      </div>
      <div className="overview-board-grid">
        <article className="tone-blue">
          <span>核心主题</span>
          <strong>{firstTopic?.title || "暂无主题"}</strong>
          <p>{firstTopic?.bullets?.[0] || "归档后会沉淀主要讨论方向。"}</p>
        </article>
        <article className="tone-green">
          <span>关键决策</span>
          <strong>{decision ? "已有决策" : "暂无明确决策"}</strong>
          <p>{decision || "本次会议未形成可归档的明确决策。"}</p>
        </article>
        <article className="tone-amber">
          <span>后续动作</span>
          <strong>{keyAction?.title || "暂无待办"}</strong>
          <p>{keyAction ? `${keyAction.owner || "待确认"} · ${keyAction.due || "待确认"} · ${getStatusLabel(keyAction.status)}` : "暂无待办快照。"}</p>
        </article>
        <article className="tone-red">
          <span>风险与问题</span>
          <strong>{risk ? "需要关注" : "暂无风险"}</strong>
          <p>{risk || "当前归档未记录风险或待澄清问题。"}</p>
        </article>
      </div>
    </section>
  );
}

function ArchiveActionsSection({ actions }: { actions: FinalizedMeeting["actionSnapshot"] }) {
  return (
    <section>
      <h3>待办</h3>
      {actions.length ? (
        <div className="archive-actions">
          {actions.map((action, index) => (
            <div key={`${action.title}-${index}`}>
              <strong>{action.title}</strong>
              <span>{action.owner || "待确认"} · {action.due || "待确认"} · {getStatusLabel(action.status)}</span>
              <p>{action.source}</p>
            </div>
          ))}
        </div>
      ) : <p>暂无待办。</p>}
    </section>
  );
}

function ArchiveTimelineSection({
  chapters,
  onJump,
}: {
  chapters: NonNullable<FinalizedMeeting["timelineChapters"]>;
  onJump?: (chapter: NonNullable<FinalizedMeeting["timelineChapters"]>[number]) => void;
}) {
  return (
    <section>
      <h3>时间轴智能章节</h3>
      {chapters.length ? (
        <div className="archive-timeline">
          {chapters.map((chapter, index) => (
            <article
              key={`${chapter.startTime}-${chapter.title}-${index}`}
              className={onJump ? "clickable" : ""}
              onClick={() => onJump?.(chapter)}
              role={onJump ? "button" : undefined}
              tabIndex={onJump ? 0 : undefined}
              onKeyDown={(event) => {
                if (onJump && (event.key === "Enter" || event.key === " ")) onJump(chapter);
              }}
            >
              <time>{chapter.startTime || "时间未知"}</time>
              <div>
                <h4>{chapter.title}</h4>
                <p>{chapter.summary || "暂无章节摘要。"}</p>
              </div>
            </article>
          ))}
        </div>
      ) : <p>暂无时间轴章节。</p>}
    </section>
  );
}

function ArchiveQuotesSection({
  moments,
  onJump,
}: {
  moments: NonNullable<FinalizedMeeting["quoteMoments"]>;
  onJump?: (moment: NonNullable<FinalizedMeeting["quoteMoments"]>[number]) => void;
}) {
  return (
    <section>
      <h3>金句时刻</h3>
      {moments.length ? (
        <div className="archive-quotes">
          {moments.map((moment, index) => (
            <blockquote
              key={`${moment.quote}-${index}`}
              className={onJump ? "clickable" : ""}
              onClick={() => onJump?.(moment)}
              role={onJump ? "button" : undefined}
              tabIndex={onJump ? 0 : undefined}
              onKeyDown={(event) => {
                if (onJump && (event.key === "Enter" || event.key === " ")) onJump(moment);
              }}
            >
              <p>「{moment.quote}」</p>
              <footer>{moment.speaker || "未知发言人"}{moment.reason ? ` · ${moment.reason}` : ""}</footer>
            </blockquote>
          ))}
        </div>
      ) : <p>暂无金句时刻。</p>}
    </section>
  );
}

function ArchivePlaybackPanel({
  meeting,
  target,
  onClearTarget,
}: {
  meeting: FinalizedMeeting;
  target?: TranscriptPreviewState["target"];
  onClearTarget: () => void;
}) {
  const [lines, setLines] = React.useState<TranscriptLine[]>([]);
  const [audioUrl, setAudioUrl] = React.useState("");
  const [cues, setCues] = React.useState<Array<{ id: number; startSeconds: number; endSeconds: number }>>([]);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editingText, setEditingText] = React.useState("");
  const [editingSpeaker, setEditingSpeaker] = React.useState("");
  const [savingId, setSavingId] = React.useState<number | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [finalizedContentStale, setFinalizedContentStale] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const lastFollowedId = React.useRef<number | undefined>(undefined);
  const targetId = React.useMemo(() => findTranscriptTarget(lines, target), [lines, target]);
  const activeId = React.useMemo(() => {
    const current = cues
      .filter((cue) => currentTime >= cue.startSeconds && currentTime <= cue.endSeconds)
      .sort((a, b) => b.startSeconds - a.startSeconds || a.endSeconds - b.endSeconds)[0];
    return current?.id || targetId;
  }, [cues, currentTime, targetId]);

  React.useEffect(() => {
    let cancelled = false;
    setLines([]); setCues([]); setAudioUrl(""); setFinalizedContentStale(false);
    void Promise.all([
      apiJson<{ ok: boolean; transcripts?: TranscriptLine[]; fullTranscript?: { finalizedContentStale?: boolean } }>(`/api/meetings/${meeting.meetingId}/transcripts`),
      apiJson<{ ok: boolean; audioUrl?: string; cues?: Array<{ id: number; startSeconds: number; endSeconds: number }> }>(`/api/meetings/${meeting.meetingId}/playback`),
    ]).then(([transcripts, playback]) => {
      if (cancelled) return;
      setLines(transcripts.transcripts || []);
      setFinalizedContentStale(Boolean(transcripts.fullTranscript?.finalizedContentStale));
      setAudioUrl(playback.audioUrl || "");
      setCues(playback.cues || []);
    }).catch(() => { if (!cancelled) setLines([]); });
    return () => { cancelled = true; };
  }, [meeting.meetingId]);

  React.useEffect(() => {
    if (!targetId || !cues.length) return;
    const cue = cues.find((item) => item.id === targetId);
    if (!cue) return;
    const audio = audioRef.current;
    if (audio) audio.currentTime = cue.startSeconds;
    document.getElementById(`playback-line-${targetId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    onClearTarget();
  }, [targetId, cues, onClearTarget]);

  React.useEffect(() => {
    if (!activeId || activeId === lastFollowedId.current) return;
    lastFollowedId.current = activeId;
    document.getElementById(`playback-line-${activeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  React.useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const follow = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      frame = window.requestAnimationFrame(follow);
    };
    frame = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying]);

  function seek(lineId: number) {
    const cue = cues.find((item) => item.id === lineId);
    if (!cue || !audioRef.current) return;
    audioRef.current.currentTime = cue.startSeconds;
    void audioRef.current.play().catch(() => {});
  }

  function beginEdit(line: TranscriptLine) {
    setEditingId(line.id);
    setEditingText(line.text);
    setEditingSpeaker(line.speaker || "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
    setEditingSpeaker("");
    setEditError(null);
  }

  async function saveEdit(line: TranscriptLine) {
    const text = editingText.trim();
    const speaker = editingSpeaker.trim();
    if (!text || !speaker) return;
    setSavingId(line.id);
    try {
      const saved = await apiJson<TranscriptLine>(`/api/transcripts/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify({ text, speaker }),
      });
      setLines((current) => current.map((item) => item.id === line.id ? saved : item));
      setFinalizedContentStale(true);
      cancelEdit();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="archive-playback" aria-label="会议回听与逐字转写">
      <div className="archive-playback-head">
        <div><h3>回听与转写</h3><p>播放进度会同步高亮转写；点击任意一句即可从对应录音位置开始回听。</p></div>
      </div>
      {finalizedContentStale && <p className="archive-playback-stale">转写已更新；当前纪要、待办和智能时间轴仍基于上一次生成版本，请重新生成纪要后使用。</p>}
      {audioUrl ? <audio ref={audioRef} className="archive-audio" controls src={audioUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} /> : <p className="muted">该历史会议未保留可回听录音。</p>}
      <div className="archive-playback-lines">
        {lines.map((line) => (
          <div key={line.id} id={`playback-line-${line.id}`} className={`archive-playback-line ${line.id === activeId ? "active" : ""}`}>
            {editingId === line.id ? (
              <div className="archive-playback-edit">
                <input aria-label="编辑说话人" value={editingSpeaker} onChange={(event) => setEditingSpeaker(event.currentTarget.value)} />
                <textarea aria-label="编辑转写文本" value={editingText} onChange={(event) => setEditingText(event.currentTarget.value)} />
                <div><button type="button" onClick={() => void saveEdit(line)} disabled={savingId === line.id}><Save size={14} />保存</button><button type="button" onClick={cancelEdit}><X size={14} />取消</button></div>
                {editError && <p className="archive-playback-edit-error" role="alert">{editError}</p>}
              </div>
            ) : (
              <button type="button" className="archive-playback-line-main" onClick={() => seek(line.id)}>
                <time>{line.time || "--:--"}</time><strong>{line.speaker || "待识别"}</strong><span>{line.text}</span>
              </button>
            )}
            {editingId !== line.id && <button type="button" className="archive-playback-edit-btn" aria-label="编辑转写" title="编辑转写和说话人" onClick={() => beginEdit(line)}><Edit3 size={14} /></button>}
          </div>
        ))}
        {!lines.length && <p className="muted">暂时无法读取转写记录。</p>}
      </div>
    </section>
  );
}

function ArchiveSpeakerViewpointsSection({ viewpoints }: { viewpoints: NonNullable<FinalizedMeeting["speakerViewpoints"]> }) {
  return (
    <section>
      <h3>发言人主要观点</h3>
      {viewpoints.length ? (
        <div className="archive-speaker-viewpoints">
          {viewpoints.map((item) => (
            <article key={item.speaker}>
              <strong>{item.speaker}</strong>
              <ul>{item.viewpoints.map((view, index) => <li key={`${item.speaker}-${index}`}>{view}</li>)}</ul>
            </article>
          ))}
        </div>
      ) : <p>暂无发言人观点。</p>}
    </section>
  );
}

function ArchiveListSection({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{emptyText}</p>}
    </section>
  );
}
