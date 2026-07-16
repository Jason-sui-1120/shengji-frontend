import React from "react";
import {
  Clock3,
  History,
  Home,
  ListChecks,
  Mic,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Moon,
  Search,
  Square,
  Sun,
  Tags,
  Trash2,
  FolderKanban,
} from "lucide-react";
import type {
  ActionBacklogItem,
  ActionItem,
  AiRun,
  ApiState,
  AppView,
  AsrDisconnectInfo,
  AsrModel,
  FinalizedMeeting,
  FinalMinutesDraft,
  FlowStep,
  FinishCheck,
  GlossaryEntry,
  HistoryBlockData,
  HistoryContextSummary,
  LiveAsrStatus,
  Meeting,
  MeetingSegment,
  PersistedProjectMemory,
  Project,
  ProjectChatResponse,
  ProjectChatMessage,
  ProjectMemory,
  TaskEvent,
  TranscriptLine,
} from "./types";
import { initialActions, historySeed, projectSeed, summarySeed, transcriptSeed } from "./seeds";
import { apiJson } from "./shared/lib/api";
import {
  getLiveAsrStatusLabel,
  getLiveAsrStatusTone,
  isOpenAction,
  getTaskEventDetail,
  getTaskEventLabel,
  stripSourceLabel,
  toCurrentBacklogAction,
  buildProjectMemory,
  isLiveAsrSessionActive,
  getWebSocketCloseReason,
  isPermissionError,
  getDisplayDraft,
  getSpeakerStats,
  getSpeakerOptions,
  getSpeakerColor,
  getSpeakerNumber,
  createFloat32Resampler,
  float32ToPcm16,
  getRms,
  parseDownloadFileName,
} from "./shared/lib";
import {
  NavItem,
} from "./shared/components/shared/Common";
import { ToastProvider, useToast } from "./shared/components/shared/Toast";
import { MeetingFlowBar } from "./shared/components/shared/MeetingFlowBar";
import { TranscriptPanel } from "./shared/components/meeting/TranscriptPanel";
import { LiveSummaryCanvas } from "./shared/components/meeting/LiveSummaryCanvas";
import { LiveDiscussionPanel } from "./shared/components/meeting/LiveDiscussionPanel";
import { ActionItemsTab } from "./shared/components/meeting/ActionItemsTab";
import { HistoryContextTab } from "./shared/components/meeting/HistoryContextTab";
import { HomePage } from "./shared/components/home/HomePage";
import { ActionsPage } from "./shared/components/actions/ActionsPage";
import { HistoryMeetingsPage } from "./shared/components/history/HistoryMeetingsPage";
import { GlossaryPage } from "./shared/components/glossary/GlossaryPage";
import { ProjectWorkspacePage } from "./shared/components/project/ProjectWorkspacePage";
import { ProjectListPage } from "./shared/components/project/ProjectListPage";
import { FinishChecklist } from "./shared/components/finalize/FinishChecklist";
import { FinalizedComplete } from "./shared/components/finalize/FinalizedComplete";
import { FinalDraftEditor } from "./shared/components/finalize/FinalDraftEditor";
import { TodoDrawer } from "./shared/components/shared/TodoDrawer";

type PresentationTranscriptLine = TranscriptLine & {
  presentationKey?: string;
  recentlyCalibrated?: boolean;
  isRealtimePreview?: boolean;
};

function hasTimelineOverlap(left: Pick<TranscriptLine, "audioStartMs" | "audioEndMs">, right: Pick<TranscriptLine, "audioStartMs" | "audioEndMs">) {
  const leftStart = Number(left.audioStartMs || 0);
  const leftEnd = Math.max(leftStart + 1, Number(left.audioEndMs || leftStart + 1));
  const rightStart = Number(right.audioStartMs || 0);
  const rightEnd = Math.max(rightStart + 1, Number(right.audioEndMs || rightStart + 1));
  return leftEnd > rightStart && leftStart < rightEnd;
}

// 文件 ASR 校准会以新的数据库行替换实时草稿。保留同一时间片的展示 key，
// 让 React 在原位置更新文字，而不是先卸载草稿、再插入稳定稿，避免用户
// 误以为刚才的实时内容被吞掉。
function reconcileTranscriptPresentation(
  current: PresentationTranscriptLine[],
  incoming: TranscriptLine[],
): PresentationTranscriptLine[] {
  const available = [...current];
  return incoming.map((next) => {
    const start = Number(next.audioStartMs || 0);
    const end = Math.max(start + 1, Number(next.audioEndMs || start + 1));
    let bestIndex = -1;
    let bestOverlap = 0;
    for (let index = 0; index < available.length; index += 1) {
      const previous = available[index];
      const previousStart = Number(previous.audioStartMs || 0);
      const previousEnd = Math.max(previousStart + 1, Number(previous.audioEndMs || previousStart + 1));
      const overlap = Math.max(0, Math.min(end, previousEnd) - Math.max(start, previousStart));
      if (overlap > bestOverlap) {
        bestIndex = index;
        bestOverlap = overlap;
      }
    }
    const previous = bestIndex >= 0 ? available.splice(bestIndex, 1)[0] : undefined;
    const becameStable = previous?.stabilityStatus === "draft" && next.stabilityStatus === "stable";
    return {
      ...next,
      presentationKey: previous?.presentationKey || `transcript-${next.id}`,
      recentlyCalibrated: becameStable,
    };
  });
}

function AppInner() {
  const { push: pushToast } = useToast();
  const [theme, setTheme] = React.useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light",
  );
  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("shengji-theme", next);
      } catch {
        /* localStorage 不可用时忽略，仅本次会话生效 */
      }
      return next;
    });
  }, []);

  // ⌘K 聚焦搜索框
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [transcripts, setTranscripts] = React.useState<PresentationTranscriptLine[]>(() => (
    transcriptSeed.map((line) => ({ ...line, presentationKey: `transcript-${line.id}` }))
  ));
  const [summaryBlocks, setSummaryBlocks] = React.useState(summarySeed);
  const [, setSegments] = React.useState<MeetingSegment[]>([]);
  const [actions, setActions] = React.useState(initialActions);
  const [actionBacklog, setActionBacklog] = React.useState<ActionBacklogItem[]>([]);
  const [projects, setProjects] = React.useState<Project[]>(projectSeed);
  const [meeting, setMeeting] = React.useState<Meeting>({ id: 1, title: "机器人首版实施方案评审", status: "idle", elapsedSeconds: 0, projectName: "机器人实施项目" });
  const [historyBlocks, setHistoryBlocks] = React.useState<HistoryBlockData[]>(historySeed);
  const [historyContext, setHistoryContext] = React.useState<HistoryContextSummary | null>(null);
  const [asrModels, setAsrModels] = React.useState<AsrModel[]>([]);
  const [selectedAsrModel, setSelectedAsrModel] = React.useState("ke-stream-asr");
  const [aiModel, setAiModel] = React.useState("Qwen3.5-Flash");
  const [finalModel, setFinalModel] = React.useState("Qwen3.7-Max");
  const [finalFastModel, setFinalFastModel] = React.useState("Qwen3.5-Flash");
  const [finalizeMode, setFinalizeMode] = React.useState<"fast" | "deep">("fast");
  const [aiStatus, setAiStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [finalizeStatus, setFinalizeStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [finalizeStage, setFinalizeStage] = React.useState<"checklist" | "editor" | "done">("checklist");
  const [finalizeProjectId, setFinalizeProjectId] = React.useState<number | null>(null);
  const [moveActionsWithMeeting, setMoveActionsWithMeeting] = React.useState(true);
  const [aiRuns, setAiRuns] = React.useState<AiRun[]>([]);
  const [finalizedMeetings, setFinalizedMeetings] = React.useState<FinalizedMeeting[]>([]);
  const [projectMemories, setProjectMemories] = React.useState<PersistedProjectMemory[]>([]);
  const [projectChats, setProjectChats] = React.useState<Record<number, ProjectChatMessage[]>>({});
  const [glossaryEntries, setGlossaryEntries] = React.useState<GlossaryEntry[]>([]);
  const [finalizedMeeting, setFinalizedMeeting] = React.useState<FinalizedMeeting | null>(null);
  const [finalDraft, setFinalDraft] = React.useState<FinalMinutesDraft | null>(null);
  const [finalDraftMeetingId, setFinalDraftMeetingId] = React.useState<number | null>(null);
  const [trashData, setTrashData] = React.useState<{ projects: any[]; meetings: any[]; actions: any[] }>({ projects: [], meetings: [], actions: [] });
  const [liveAsrStatus, setLiveAsrStatus] = React.useState<LiveAsrStatus>("idle");
  const [liveAsrText, setLiveAsrText] = React.useState("");
  const [calibrationStatus, setCalibrationStatus] = React.useState("");
  const [realtimeTimelineSegments, setRealtimeTimelineSegments] = React.useState<PresentationTranscriptLine[]>([]);
  const [asrDisconnectInfo, setAsrDisconnectInfo] = React.useState<AsrDisconnectInfo | null>(null);
  const liveAsrDraftRef = React.useRef({ buffered: "", partial: "" });
  const [dbStatus, setDbStatus] = React.useState<"loading" | "ready" | "offline">("loading");
  const [meetingTab, setMeetingTab] = React.useState<"live" | "actions" | "history">("live");
  const [selectedProject, setSelectedProject] = React.useState(projectSeed[0].name);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [speakerEditingId, setSpeakerEditingId] = React.useState<number | null>(null);
  const [speakerDraft, setSpeakerDraft] = React.useState("");
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [newMeetingOpen, setNewMeetingOpen] = React.useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = React.useState("");
  const [newMeetingProject, setNewMeetingProject] = React.useState(projectSeed[0].name);
  const [newMeetingStatus, setNewMeetingStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [newProjectStatus, setNewProjectStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [newProjectError, setNewProjectError] = React.useState("");
  const [activeView, setActiveView] = React.useState<AppView>("home");
  const [selectedArchiveId, setSelectedArchiveId] = React.useState<number | null>(null);
  const [historyProject, setHistoryProject] = React.useState<string>(projectSeed[0].name);
  const [historyFromProject, setHistoryFromProject] = React.useState(false);
  const [actionProjectFilter, setActionProjectFilter] = React.useState<string>("all");
  const [projectInitialTab, setProjectInitialTab] = React.useState<"meetings" | "todos" | "memory" | "chat">("meetings");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [todoDrawerOpen, setTodoDrawerOpen] = React.useState(false);
  const [taskEvents, setTaskEvents] = React.useState<TaskEvent[]>([]);
  const wsRef = React.useRef<WebSocket | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const sourceNextSampleRef = React.useRef<number | null>(null);
  const audioChunkSequenceRef = React.useRef(0);
  const pendingPcmRef = React.useRef<{ chunks: Int16Array[]; samples: number }>({ chunks: [], samples: 0 });
  const vadStateRef = React.useRef({ speaking: false, speechStartedAt: 0, lastVoiceAt: 0, lastEndpointAt: 0 });
  const latestTranscriptIdRef = React.useRef(0);
  const lastAnalyzedTranscriptIdRef = React.useRef(0);
  const asrSessionActiveRef = React.useRef(false);
  const asrMeetingIdRef = React.useRef<number | null>(null);
  const reconnectTimerRef = React.useRef<number | null>(null);
  const sealTimeoutRef = React.useRef<number | null>(null);
  const reconnectAttemptRef = React.useRef(0);
  const intentionalStopRef = React.useRef(false);
  const outlineBodyRef = React.useRef<HTMLDivElement | null>(null);
  const liveBodyRef = React.useRef<HTMLDivElement | null>(null);

  function applyApiState(state: ApiState) {
    setProjects(state.projects);
    setMeeting(state.meeting);
    setElapsed(state.meeting.elapsedSeconds);
    setSelectedProject(state.meeting.projectName);
    setNewMeetingProject(state.meeting.projectName);
    setTranscripts((current) => reconcileTranscriptPresentation(current, state.transcripts));
    setRealtimeTimelineSegments((current) => current.filter((preview) => !state.transcripts.some((line) => (
      line.stabilityStatus === "stable" && hasTimelineOverlap(preview, line)
    ))));
    setSummaryBlocks(state.summaryBlocks);
    setSegments(state.segments ?? []);
    setActions(state.actions);
    setActionBacklog(state.actionBacklog ?? state.actions.map((action) => ({
      ...action,
      sourceType: "current",
      meetingId: state.meeting.id,
      meetingTitle: state.meeting.title,
      projectName: state.meeting.projectName,
      createdAt: "",
    })));
    setTaskEvents(state.taskEvents ?? []);
    setHistoryBlocks(state.historyBlocks);
    setHistoryContext(state.historyContext ?? null);
    setAsrModels(state.asr.models);
    setSelectedAsrModel(state.asr.selected || state.asr.models[0]?.id || "ke-stream-asr");
    setAiModel(state.ai?.selected ?? "Deepseek-V4-Flash");
    setFinalModel(state.ai?.finalModel ?? "Qwen3.7-Max");
    setFinalFastModel(state.ai?.finalFastModel ?? "Qwen3.5-Flash");
    setAiRuns(state.ai?.runs ?? []);
    setFinalizedMeetings(state.finalized ?? []);
    setProjectMemories(state.projectMemories ?? []);
    setProjectChats(state.projectChats ?? {});
    setGlossaryEntries(state.glossaryEntries ?? []);
    setFinalizedMeeting(state.finalized?.find((item) => item.meetingId === state.meeting.id) ?? null);
    latestTranscriptIdRef.current = state.transcripts.at(-1)?.id ?? 0;
    lastAnalyzedTranscriptIdRef.current = state.transcripts.at(-1)?.id ?? 0;
    setEditingId(null);
    setSpeakerEditingId(null);
  }

  React.useEffect(() => {
    apiJson<ApiState>("/api/state")
      .then((state) => {
        applyApiState(state);
        setDbStatus("ready");
      })
      .catch(() => setDbStatus("offline"));
  }, []);

  React.useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  React.useEffect(() => {
    const shouldSync = recording || liveAsrStatus === "recording" || liveAsrStatus === "reconnecting";
    if (!shouldSync) return;

    const sync = () => {
      void syncLiveDerivedState();
    };
    const timer = window.setInterval(sync, 8_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [recording, liveAsrStatus, editingId]);

  React.useEffect(() => {
    return () => stopRealAsr();
  }, []);

  React.useEffect(() => {
    const resumeAudio = () => {
      if (!isLiveAsrSessionActive(liveAsrStatus)) return;
      const audioContext = audioContextRef.current;
      if (audioContext?.state === "suspended") {
        void audioContext.resume().catch(() => undefined);
      }
    };
    window.addEventListener("focus", resumeAudio);
    document.addEventListener("visibilitychange", resumeAudio);
    return () => {
      window.removeEventListener("focus", resumeAudio);
      document.removeEventListener("visibilitychange", resumeAudio);
    };
  }, [liveAsrStatus]);

  React.useEffect(() => {
    if (!finishOpen && !newMeetingOpen && !newProjectOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [finishOpen, newMeetingOpen, newProjectOpen]);

  React.useEffect(() => {
    latestTranscriptIdRef.current = transcripts.at(-1)?.id ?? 0;
  }, [transcripts]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const outlineBody = outlineBodyRef.current;
      // 只在用户已滚动到底部附近时才自动滚到底部，避免打断用户浏览
      if (outlineBody) {
        const nearBottom = outlineBody.scrollHeight - outlineBody.scrollTop - outlineBody.clientHeight < 80;
        if (nearBottom) outlineBody.scrollTop = outlineBody.scrollHeight;
      }
      const liveBody = liveBodyRef.current;
      if (liveBody) {
        const nearBottomLive = liveBody.scrollHeight - liveBody.scrollTop - liveBody.clientHeight < 80;
        if (nearBottomLive) liveBody.scrollTop = liveBody.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [summaryBlocks]);

  const elapsedText = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const confirmedCount = actions.filter((action) => action.status === "confirmed").length;
  const candidateCount = actions.filter((action) => action.status === "candidate").length;
  const clarifyCount = actions.filter((action) => action.status === "clarify").length;
  const pendingActionCount = actions.filter(isOpenAction).length;
  const backlogPendingCount = actionBacklog.filter(isOpenAction).length;

  /** 顶部统一搜索：暂未启用，等所有页面改造完后统一实现 */
  function handleSearch() {
    // TODO: 统一搜索（项目/会议/待办/转写全文）将在信息架构改造完成后实现
  }
  const isRealAsrActive = isLiveAsrSessionActive(liveAsrStatus);
  const isFinalSealPending = liveAsrStatus === "stopping";
  const asrStatusLabel = getLiveAsrStatusLabel(liveAsrStatus);
  const asrStatusTone = getLiveAsrStatusTone(liveAsrStatus);
  const asrStatusDetail = asrDisconnectInfo
    ? `最近断开：code ${asrDisconnectInfo.code}，${asrDisconnectInfo.reason || "无原因"}，第 ${asrDisconnectInfo.attempt} 次恢复`
    : liveAsrText;
  const latestAiRun = aiRuns[0];
  const latestAiLabel = latestAiRun
    ? latestAiRun.status === "success"
      ? `${latestAiRun.summaryCount}块 / ${latestAiRun.actionCount}待办`
      : "分析失败"
    : "待分析";
  const historyLabel = historyContext ? `已载入 ${historyContext.dateLabel}` : "无同项目历史";
  const speakerStats = getSpeakerStats(transcripts);
  const displayTranscripts = React.useMemo(() => [...transcripts, ...realtimeTimelineSegments]
    // 已持久化的实时行或稳定行一到，就接管相同时间区间的临时预览。
    .filter((line) => line.isRealtimePreview || !realtimeTimelineSegments.some((preview) => hasTimelineOverlap(preview, line)))
    .sort((left, right) => Number(left.audioStartMs || 0) - Number(right.audioStartMs || 0) || left.id - right.id), [transcripts, realtimeTimelineSegments]);
  const selectedProjectData = projects.find((project) => project.name === selectedProject) ?? projects[0];
  const selectedProjectArchives = finalizedMeetings.filter((archive) => archive.projectName === selectedProject);
  const selectedProjectActions = actionBacklog.filter((action) => action.projectName === selectedProject);
  const selectedProjectStoredMemory = projectMemories.find((memory) => memory.projectName === selectedProject);
  const selectedProjectMemory = buildProjectMemory(selectedProject, selectedProjectArchives, selectedProjectActions, selectedProjectStoredMemory);
  const flowSteps: FlowStep[] = [
    {
      label: "记录",
      value: isRealAsrActive ? "记录中" : transcripts.length ? "已暂停" : "未开始",
      state: isRealAsrActive ? "active" : transcripts.length ? "done" : "idle",
    },
    {
      label: "转写",
      value: liveAsrText ? "实时生成中" : transcripts.length ? `${transcripts.length} 条` : "等待语音",
      state: liveAsrText ? "active" : transcripts.length ? "done" : "idle",
    },
    {
      label: "说话人",
      value: speakerStats.length ? `${speakerStats.length} 人` : "待识别",
      state: speakerStats.length ? "done" : "idle",
    },
    {
      label: "AI 分析",
      value: aiStatus === "running" ? "分析中" : latestAiRun ? latestAiLabel : "待触发",
      state: aiStatus === "running" ? "active" : latestAiRun?.status === "failed" ? "warning" : latestAiRun ? "done" : "idle",
    },
    {
      label: "待办",
      value: `${pendingActionCount} 待处理`,
      state: pendingActionCount ? "warning" : actions.length ? "done" : "idle",
    },
    {
      label: "归档",
      value: finalizedMeeting ? "已归档" : finalDraft ? "草稿待确认" : "可检查",
      state: finalizedMeeting ? "done" : finalDraft ? "active" : "idle",
    },
  ];
  const finishChecks: FinishCheck[] = [
    {
      label: "录音状态",
      value: isRealAsrActive ? "仍在记录" : isFinalSealPending ? "尾段校准中" : "已停止",
      detail: isRealAsrActive
        ? "请先停止录音；系统会保存完整录音并校准尾段。"
        : isFinalSealPending
          ? "正在用完整录音完成最后一段稳定转写，完成后才能生成最终纪要。"
          : "完整录音与稳定转写均已就绪，可以进入会后整理。",
      tone: isRealAsrActive || isFinalSealPending ? "amber" : "green",
      actionLabel: isRealAsrActive ? "停止录音" : undefined,
      action: isRealAsrActive ? stopRealAsr : undefined,
    },
    {
      label: "实时转写",
      value: `${transcripts.length} 条`,
      detail: transcripts.length ? "最终纪要会基于本场转写生成。" : "暂无转写内容，建议先完成录音。",
      tone: transcripts.length ? "blue" : "amber",
    },
    {
      label: "说话人",
      value: speakerStats.length ? `${speakerStats.length} 人` : "待识别",
      detail: speakerStats.length ? "已识别的说话人会进入 AI 分析上下文。" : "未形成说话人标签，纪要会按原始转写处理。",
      tone: speakerStats.length ? "green" : "neutral",
    },
    {
      label: "AI 分析",
      value: latestAiRun ? latestAiLabel : "未分析",
      detail: latestAiRun ? "滚动纪要和待办候选已可作为草稿参考。" : "建议先点一次 AI 分析再结束会议。",
      tone: latestAiRun ? (latestAiRun.status === "success" ? "green" : "amber") : "amber",
      actionLabel: latestAiRun ? undefined : "先做 AI 分析",
      action: latestAiRun ? undefined : () => void runAiAnalyze("manual"),
      actionDisabled: aiStatus === "running" || transcripts.length === 0,
    },
    {
      label: "待办池",
      value: `${confirmedCount} 已确认 / ${clarifyCount} 待澄清`,
      detail: pendingActionCount ? "未关闭待办会随本次归档形成快照，并进入后续会议上下文。" : "当前没有未处理待办。",
      tone: clarifyCount ? "amber" : "green",
      actionLabel: clarifyCount ? "回到待办确认" : undefined,
      action: clarifyCount ? () => setFinishOpen(false) : undefined,
    },
    {
      label: "历史上下文",
      value: historyLabel,
      detail: historyContext ? `已载入「${historyContext.title}」作为本次参考。` : "当前项目还没有历史归档可参考。",
      tone: historyContext ? "green" : "neutral",
    },
  ];

  function recordTaskEvent(actionId: number | string, label: string, detail: string) {
    setTaskEvents((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        actionId: String(actionId),
        label,
        detail,
        at: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 80));
  }

  function updateAction(id: number, patch: Partial<ActionItem>) {
    const currentAction = actions.find((action) => action.id === id);
    if (currentAction) recordTaskEvent(id, getTaskEventLabel(patch), getTaskEventDetail(currentAction, patch));
    const previousActions = actions;
    const previousBacklog = actionBacklog;
    setActions((current) => current.map((action) => (action.id === id ? { ...action, ...patch } : action)));
    setActionBacklog((current) => current.map((action) => (
      action.id === id ? { ...action, ...patch } : action
    )));
    void apiJson<ActionItem>(`/api/actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((saved) => {
      setActions((current) => current.map((action) => (action.id === id ? saved : action)));
      setActionBacklog((current) => current.map((action) => (
        action.sourceType === "current" && action.id === id ? { ...action, ...saved } : action
      )));
    }).catch((error) => {
      setActions(previousActions);
      setActionBacklog(previousBacklog);
      pushToast("error", `待办保存失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    });
  }

  function addAction(projectName?: string, meetingId?: number) {
    const targetProject = projectName && projectName !== "all"
      ? projects.find((p) => p.name === projectName)
      : null;
    const targetMeetingId = meetingId
      ?? (targetProject
        ? (finalizedMeetings.find((f) => f.projectName === targetProject.name)?.meetingId ?? meeting.id)
        : meeting.id);
    const targetMeetingInfo = targetProject
      ? { id: targetMeetingId, projectName: targetProject.name, title: finalizedMeetings.find((f) => f.meetingId === targetMeetingId)?.title ?? `${targetProject.name}手动待办`, status: "idle" as const, elapsedSeconds: 0 }
      : meeting;
    const draft = {
        title: "跟进新识别的会议事项",
        owner: "待确认",
        due: "待定",
        status: "candidate" as const,
        confidence: 72,
        source: "手动新增",
        meetingId: targetMeetingId,
    };
    void apiJson<ActionItem>("/api/actions", {
      method: "POST",
      body: JSON.stringify(draft),
    }).then((saved) => {
      setActions((current) => [saved, ...current]);
      setActionBacklog((current) => [toCurrentBacklogAction(saved, targetMeetingInfo as Meeting), ...current]);
      recordTaskEvent(saved.id, "创建待办", `${saved.title} 已进入待办池`);
      setEditingId(saved.id);
    }).catch(() => {
      const id = Math.max(0, ...actions.map((action) => action.id)) + 1;
      setActions((current) => [{ ...draft, id }, ...current]);
      setActionBacklog((current) => [toCurrentBacklogAction({ ...draft, id }, targetMeetingInfo as Meeting), ...current]);
      recordTaskEvent(id, "创建待办", `${draft.title} 已进入待办池`);
      setEditingId(id);
      pushToast("error", "待办创建未保存到服务器，刷新页面后会丢失。");
    });
  }

  function updateBacklogAction(action: ActionBacklogItem, patch: Partial<ActionItem> & { meetingId?: number; meetingTitle?: string; projectName?: string }) {
    const backlogPatch: Partial<ActionBacklogItem> = {};
    if (patch.meetingId !== undefined) backlogPatch.meetingId = patch.meetingId;
    if (patch.meetingTitle !== undefined) backlogPatch.meetingTitle = patch.meetingTitle;
    if (patch.projectName !== undefined) backlogPatch.projectName = patch.projectName;

    const isReassignOnly = patch.meetingId !== undefined || patch.projectName !== undefined;
    const hasContentChange = patch.title !== undefined || patch.owner !== undefined || patch.due !== undefined || patch.status !== undefined || patch.source !== undefined;

    if (action.sourceType === "current") {
      const actionId = Number(action.id);
      const apiPatch: Record<string, unknown> = { ...patch };
      if (patch.meetingId !== undefined) apiPatch.meetingId = patch.meetingId;
      if (actionId > 0) {
        updateAction(actionId, apiPatch as Partial<ActionItem>);
      } else {
        recordTaskEvent(action.id, getTaskEventLabel(patch), getTaskEventDetail(action, patch));
        setActionBacklog((current) => current.map((item) => (
          item.id === action.id ? { ...item, ...patch, ...backlogPatch } : item
        )));
      }
      return;
    }

    if (isReassignOnly && !hasContentChange) {
      const targetMeetingId = patch.meetingId ?? action.meetingId;
      const targetMeetingTitle = patch.meetingTitle ?? action.meetingTitle;
      const targetProjectName = patch.projectName ?? action.projectName;
      if (typeof action.id === "number" && action.id > 0) {
        void apiJson<ActionItem>(`/api/actions/${action.id}`, {
          method: "PATCH",
          body: JSON.stringify({ meetingId: targetMeetingId }),
        }).then(() => {
          setActionBacklog((current) => current.map((item) => (
            item.id === action.id ? { ...item, meetingId: targetMeetingId, meetingTitle: targetMeetingTitle, projectName: targetProjectName } : item
          )));
        }).catch(() => {
          pushToast("error", "待办归属切换失败，请稍后重试");
        });
      } else {
        // 归档待办切换归属：自动接管为当前待办
        const tempId = -Date.now();
        const draft = {
          title: action.title,
          owner: action.owner,
          due: action.due,
          status: action.status,
          confidence: action.confidence,
          source: `历史会议：${action.meetingTitle}；${stripSourceLabel(action.source)}`,
          meetingId: targetMeetingId,
          projectName: targetProjectName,
          event: {
            label: "接管历史待办",
            detail: `从「${action.meetingTitle}」接管到当前待办池`,
          },
        };
        recordTaskEvent(action.id, "接管历史待办", `从「${action.meetingTitle}」接管到当前待办池`);
        setActionBacklog((current) => current.map((item) => (
          item.id === action.id ? { ...action, ...draft, sourceType: "current", id: tempId, meetingTitle: targetMeetingTitle } : item
        )));
        void apiJson<ActionItem>("/api/actions", {
          method: "POST",
          body: JSON.stringify(draft),
        }).then((saved) => {
          setActionBacklog((current) => current.map((item) => (
            item.id === tempId ? {
              ...item, ...saved,
              sourceType: "current" as const,
              id: saved.id,
              projectName: targetProjectName,
              meetingTitle: targetMeetingTitle,
              meetingId: targetMeetingId,
            } : item
          )));
          setTaskEvents((events) => events.map((event) => (
            event.actionId === String(action.id) || event.actionId === String(tempId)
              ? { ...event, actionId: String(saved.id) }
              : event
          )));
          recordTaskEvent(saved.id, "已保存", "历史待办已进入当前待办池");
          setActions((items) => [saved, ...items]);
        }).catch(() => {
          pushToast("error", "接管失败，请稍后重试");
        });
      }
      return;
    }

    const tempId = -Date.now();
    const draft = {
      title: action.title,
      owner: action.owner,
      due: action.due,
      status: action.status,
      confidence: action.confidence,
      source: `历史会议：${action.meetingTitle}；${stripSourceLabel(action.source)}`,
      meetingId: patch.meetingId ?? action.meetingId,
      event: {
        label: "接管历史待办",
        detail: `从「${action.meetingTitle}」接管到当前待办池`,
      },
      ...patch,
    };
    recordTaskEvent(action.id, "接管历史待办", `从「${action.meetingTitle}」接管到当前待办池`);
    setActionBacklog((current) => current.map((item) => (
      item.id === action.id ? { ...action, ...draft, sourceType: "current", id: tempId } : item
    )));
    void apiJson<ActionItem>("/api/actions", {
      method: "POST",
      body: JSON.stringify(draft),
    }).then((saved) => {
      setActionBacklog((current) => {
        const latest = current.find((item) => item.id === tempId);
        const merged = {
          ...saved,
          title: latest?.title ?? saved.title,
          owner: latest?.owner ?? saved.owner,
          due: latest?.due ?? saved.due,
          status: latest?.status ?? saved.status,
          source: latest?.source ?? saved.source,
        };
        setTaskEvents((events) => events.map((event) => (
          event.actionId === String(action.id) || event.actionId === String(tempId)
            ? { ...event, actionId: String(saved.id) }
            : event
        )));
        recordTaskEvent(saved.id, "已保存", "历史待办已进入当前待办池");
        setActions((items) => [merged, ...items]);
        if (
          merged.title !== saved.title ||
          merged.owner !== saved.owner ||
          merged.due !== saved.due ||
          merged.status !== saved.status ||
          merged.source !== saved.source
        ) {
          void apiJson<ActionItem>(`/api/actions/${saved.id}`, {
            method: "PATCH",
            body: JSON.stringify(merged),
          }).catch(() => {
            pushToast("error", "接管待办的二次同步失败，请检查待办池。");
          });
        }
        // 保留原归档待办的 meetingId/meetingTitle/projectName，不用当前 meeting
        return [
          { ...merged, sourceType: "current" as const, meetingId: action.meetingId, meetingTitle: action.meetingTitle, projectName: action.projectName, createdAt: "" },
          ...current.filter((item) => item.id !== action.id && item.id !== tempId),
        ];
      });
    }).catch(() => {
      setActionBacklog((current) => current.filter((item) => item.id !== tempId));
      pushToast("error", `接管历史待办失败，请稍后重试`);
    });
  }

  function finishSpeakerCorrection(line: TranscriptLine) {
    const nextSpeaker = speakerDraft.trim();
    setSpeakerEditingId(null);
    if (!nextSpeaker || nextSpeaker === line.speaker) return;
    renameSpeakerEverywhere(line.speaker, nextSpeaker);
  }

  function renameSpeakerEverywhere(from: string, to: string) {
    const previousTranscripts = transcripts;
    setTranscripts((current) => current.map((line) => (
      line.speaker === from
        ? { ...line, speaker: to, speakerSource: "manual" as const, speakerConfidence: 100 }
        : line
    )));
    void apiJson<{ ok: boolean; transcripts: TranscriptLine[] }>("/api/speakers/rename", {
      method: "PATCH",
      body: JSON.stringify({ meetingId: meeting.id, from, to }),
    }).then((result) => {
      setTranscripts(result.transcripts);
    }).catch((error) => {
      setTranscripts(previousTranscripts);
      pushToast("error", `发言人改名失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    });
  }

  function mergeSpeakerEverywhere(source: string, target: string) {
    const previousTranscripts = transcripts;
    setTranscripts((current) => current.map((line) => (
      line.speaker === source
        ? { ...line, speaker: target, speakerSource: "manual" as const, speakerConfidence: 100 }
        : line
    )));
    void apiJson<{ ok: boolean; transcripts: TranscriptLine[] }>("/api/speakers/rename", {
      method: "PATCH",
      body: JSON.stringify({ meetingId: meeting.id, from: source, to: target }),
    }).then((result) => {
      setTranscripts(result.transcripts);
      pushToast("info", `已将「${source}」合并到「${target}」`);
    }).catch((error) => {
      setTranscripts(previousTranscripts);
      pushToast("error", `合并说话人失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    });
  }

  function deleteSpeakerEverywhere(speakerName: string) {
    const previousTranscripts = transcripts;
    const remaining = transcripts.filter((line) => line.speaker !== speakerName);
    if (remaining.length === transcripts.length) {
      pushToast("info", `「${speakerName}」没有转写记录`);
      return;
    }
    setTranscripts(remaining);
    void apiJson<{ ok: boolean; transcripts: TranscriptLine[] }>("/api/speakers/delete", {
      method: "PATCH",
      body: JSON.stringify({ meetingId: meeting.id, speaker: speakerName }),
    }).then((result) => {
      setTranscripts(result.transcripts);
      pushToast("info", `已删除「${speakerName}」的所有转写记录`);
    }).catch((error) => {
      setTranscripts(previousTranscripts);
      pushToast("error", `删除说话人失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    });
  }

  async function runAiAnalyze(trigger: "manual" | "auto" = "manual") {
    setAiStatus("running");
    try {
      await apiJson("/api/ai/analyze", {
        method: "POST",
        body: JSON.stringify({ meetingId: meeting.id, trigger, lockedActionIds: editingId ? [editingId] : [] }),
      });
      const state = await apiJson<ApiState>("/api/state");
      setSummaryBlocks(state.summaryBlocks);
      setSegments(state.segments ?? []);
      setActions(state.actions);
      setActionBacklog(state.actionBacklog ?? []);
      setTaskEvents(state.taskEvents ?? []);
      setAiModel(state.ai?.selected ?? aiModel);
      setAiRuns(state.ai?.runs ?? []);
      lastAnalyzedTranscriptIdRef.current = state.transcripts.at(-1)?.id ?? lastAnalyzedTranscriptIdRef.current;
      setAiStatus("done");
    } catch {
      setAiStatus("error");
    }
  }

  async function syncLiveDerivedState() {
    try {
      const state = await apiJson<ApiState>("/api/state");
      setSummaryBlocks(state.summaryBlocks);
      setSegments(state.segments ?? []);
      setTaskEvents(state.taskEvents ?? []);
      setAiModel(state.ai?.selected ?? aiModel);
      setAiRuns(state.ai?.runs ?? []);
      setHistoryContext(state.historyContext ?? null);
      if (!editingId) {
        setActions(state.actions);
        setActionBacklog(state.actionBacklog ?? []);
      }
      latestTranscriptIdRef.current = Math.max(
        latestTranscriptIdRef.current,
        state.transcripts.at(-1)?.id ?? 0,
      );
    } catch {
      /* 录音中同步失败不打断主链路，下一轮继续刷新。 */
    }
  }

  async function generateFinalDraft() {
    if (isRealAsrActive) {
      stopRealAsr();
      pushToast("info", "录音已停止，正在完成尾段校准；完成后即可生成最终纪要。");
      return;
    }
    if (isFinalSealPending) {
      pushToast("info", "尾段稳定转写仍在生成，请完成后再生成最终纪要。");
      return;
    }
    setFinalizeStatus("running");
    try {
      const selectedModel = finalizeMode === "fast" ? finalFastModel : finalModel;
      const targetMeetingId = finalDraftMeetingId ?? meeting.id;
      const result = await apiJson<{ ok: boolean; draft?: FinalMinutesDraft; message?: string }>("/api/meetings/finalize-draft", {
        method: "POST",
        body: JSON.stringify({ meetingId: targetMeetingId, model: selectedModel }),
      });
      if (!result.ok || !result.draft) throw new Error(result.message || "draft failed");
      setFinalDraft(result.draft);
      setFinalDraftMeetingId(targetMeetingId);
      setFinalizeStatus("done");
      setFinalizeStage("editor");
      setFinalizeProjectId(projects.find((p) => p.name === result.draft?.projectName)?.id ?? null);
    } catch {
      setFinalizeStatus("error");
    }
  }

  async function saveFinalDraft() {
    if (!finalDraft) return;
    setFinalizeStatus("running");
    try {
      const targetMeetingId = finalDraftMeetingId ?? meeting.id;
      const result = await apiJson<{ ok: boolean; finalMinutes?: FinalizedMeeting; message?: string }>("/api/meetings/finalize", {
        method: "POST",
        body: JSON.stringify({ meetingId: targetMeetingId, finalMinutes: finalDraft, projectId: finalizeProjectId ?? undefined, moveActions: moveActionsWithMeeting }),
      });
      if (!result.ok || !result.finalMinutes) throw new Error(result.message || "finalize failed");
      const isCurrentMeeting = targetMeetingId === meeting.id;
      if (isCurrentMeeting) {
        const state = await apiJson<ApiState>("/api/state");
        setMeeting(state.meeting);
        setElapsed(state.meeting.elapsedSeconds);
        setTranscripts(state.transcripts);
        setSummaryBlocks(state.summaryBlocks);
        setSegments(state.segments ?? []);
        setActions(state.actions);
        setActionBacklog(state.actionBacklog ?? []);
        setTaskEvents(state.taskEvents ?? []);
        setHistoryBlocks(state.historyBlocks);
        setHistoryContext(state.historyContext ?? null);
        setAiRuns(state.ai?.runs ?? []);
        setProjectChats(state.projectChats ?? {});
        setProjectMemories(state.projectMemories ?? []);
        // 归档后跳转到对应项目页
        const archivedProjectName = result.finalMinutes!.projectName;
        if (archivedProjectName) {
          const proj = projects.find((p) => p.name === archivedProjectName);
          if (proj) {
            setSelectedProject(archivedProjectName);
            setProjectInitialTab("memory");
          }
        }
        setFinishOpen(false);
        setActiveView("projects");
      } else {
        const state = await apiJson<ApiState>("/api/state");
        setProjectMemories(state.projectMemories ?? []);
        setActionBacklog(state.actionBacklog ?? []);
      }
      setFinalizedMeetings((current) => {
        const updated = current.filter((item) => item.meetingId !== result.finalMinutes!.meetingId);
        return [result.finalMinutes!, ...updated];
      });
      setFinalizedMeeting(result.finalMinutes);
      setSelectedArchiveId(result.finalMinutes.meetingId);
      setFinalDraft(null);
      setFinalDraftMeetingId(null);
      setFinalizeStatus("done");
      setFinalizeStage("done");
    } catch {
      setFinalizeStatus("error");
    }
  }

  function updateFinalDraft(patch: Partial<FinalMinutesDraft>) {
    setFinalDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function loadTrash() {
    try {
      const data = await apiJson<{ projects: any[]; meetings: any[]; actions: any[] }>("/api/trash");
      setTrashData(data);
    } catch { /* ignore */ }
  }

  async function deleteProject(projectId: number) {
    const result = await apiJson<{ ok: boolean; message?: string }>(`/api/projects/${projectId}`, { method: "DELETE" });
    if (!result.ok) { pushToast("error", result.message || "删除失败"); return; }
    const state = await apiJson<ApiState>("/api/state");
    applyApiState(state);
    await loadTrash();
    pushToast("info", "项目已移入回收站，30天后自动清理。");
  }

  async function deleteMeeting(meetingId: number) {
    const result = await apiJson<{ ok: boolean; message?: string }>(`/api/meetings/${meetingId}`, { method: "DELETE" });
    if (!result.ok) { pushToast("error", result.message || "删除失败"); return; }
    const state = await apiJson<ApiState>("/api/state");
    applyApiState(state);
    await loadTrash();
    pushToast("info", "会议已移入回收站。");
  }

  async function deleteAction(actionId: number | string) {
    const numId = Number(actionId);
    if (!numId || numId <= 0) { pushToast("error", "归档待办无法直接删除，请先接管。"); return; }
    const result = await apiJson<{ ok: boolean; message?: string }>(`/api/actions/${numId}`, { method: "DELETE" });
    if (!result.ok) { pushToast("error", result.message || "删除失败"); return; }
    const state = await apiJson<ApiState>("/api/state");
    applyApiState(state);
    await loadTrash();
    pushToast("info", "待办已移入回收站。");
  }

  async function restoreItem(type: "project" | "meeting" | "action", id: number) {
    if (type === "project") await apiJson(`/api/projects/${id}?action=restore`, { method: "POST" });
    else if (type === "meeting") await apiJson(`/api/meetings/${id}?action=restore`, { method: "POST" });
    else await apiJson(`/api/actions/${id}/restore`, { method: "POST" });
    const state = await apiJson<ApiState>("/api/state");
    applyApiState(state);
    await loadTrash();
    pushToast("info", "已恢复。");
  }

  async function purgeItem(type: "project" | "meeting" | "action", id: number) {
    if (type === "project") await apiJson(`/api/projects/${id}?action=purge`, { method: "DELETE" });
    else if (type === "meeting") await apiJson(`/api/meetings/${id}?action=purge`, { method: "DELETE" });
    else await apiJson(`/api/actions/${id}/purge`, { method: "DELETE" });
    await loadTrash();
    pushToast("info", "已彻底删除。");
  }

  React.useEffect(() => {
    if (activeView === "trash") void loadTrash();
  }, [activeView]);

  async function saveProjectMemory(projectId: number, draft: ProjectMemory) {
    const result = await apiJson<{ ok: boolean; memory?: PersistedProjectMemory; message?: string }>(`/api/projects/${projectId}/memory`, {
      method: "PATCH",
      body: JSON.stringify({
        overview: draft.overview,
        facts: draft.facts,
        goals: draft.goals,
        currentTopics: draft.currentTopics,
        decisions: draft.decisions,
        risks: draft.risks,
        openQuestions: draft.openQuestions,
        changes: draft.changes,
        stage: draft.stage || "",
      }),
    });
    if (!result.ok || !result.memory) throw new Error(result.message || "memory save failed");
    setProjectMemories((items) => {
      const others = items.filter((item) => item.projectId !== result.memory!.projectId);
      return [result.memory!, ...others];
    });
  }

  async function saveGlossaryEntry(draft: Partial<GlossaryEntry>) {
    const result = await apiJson<ApiState>(draft.id ? `/api/glossary/${draft.id}` : "/api/glossary", {
      method: draft.id ? "PATCH" : "POST",
      body: JSON.stringify(draft),
    });
    setGlossaryEntries(result.glossaryEntries ?? []);
    pushToast("success", draft.id ? "热词已更新。" : "热词已新增。");
  }

  async function deleteGlossaryEntry(id: number) {
    const result = await apiJson<ApiState>(`/api/glossary/${id}`, { method: "DELETE" });
    setGlossaryEntries(result.glossaryEntries ?? []);
    pushToast("info", "热词已删除。");
  }

  async function correctGlossaryFromTranscript(line: TranscriptLine, newText: string) {
    const trimmed = newText.trim();
    if (!trimmed || trimmed === line.text) return;
    const result = await apiJson<{ ok: boolean; pairs?: Array<{ alias: string; term: string }>; message?: string }>("/api/glossary/correct-batch", {
      method: "POST",
      body: JSON.stringify({
        meetingId: meeting.id,
        transcriptId: line.id,
        originalText: line.text,
        correctedText: trimmed,
        scope: "project",
      }),
    });
    if (!result.ok) {
      pushToast("error", result.message || "校正失败");
      return;
    }
    const pairs = result.pairs || [];
    if (pairs.length > 0) {
      const summary = pairs.map((p) => `${p.alias}→${p.term}`).join("，");
      pushToast("success", `已加入 ${pairs.length} 条热词并回刷：${summary}`);
    } else {
      pushToast("success", "转写已更新");
    }
    const state = await apiJson<ApiState>("/api/state");
    applyApiState(state);
  }

  async function askProjectAi(projectId: number, question: string) {
    const result = await apiJson<ProjectChatResponse>(`/api/projects/${projectId}/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    if (!result.ok || !result.answer) throw new Error(result.message || "project chat failed");
    void loadProjectChatHistory(projectId);
    return result;
  }

  async function loadProjectChatHistory(projectId: number) {
    try {
      const result = await apiJson<{ ok: boolean; messages: ProjectChatMessage[] }>(`/api/projects/${projectId}/chat/history`);
      if (!result.ok) return;
      setProjectChats((current) => ({ ...current, [projectId]: result.messages }));
    } catch {
      /* non-critical: chat history will be empty, user can still ask new questions */
    }
  }

  async function createActionFromChat(projectId: number, draft: { title: string; owner: string; due: string; source: string }) {
    try {
      const saved = await apiJson<ActionBacklogItem>(`/api/projects/${projectId}/chat/action`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setActionBacklog((current) => [saved, ...current]);
      setActions((current) => [{ ...saved, id: Number(saved.id) } as ActionItem, ...current]);
      recordTaskEvent(saved.id, "创建待办", `从项目对话生成：${saved.title}`);
      pushToast("success", `已从对话生成待办：${saved.title}`);
      return saved;
    } catch (error) {
      pushToast("error", `待办创建失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      throw error;
    }
  }

  async function markProjectChatMemorySaved(projectId: number, messageId: number) {
    const result = await apiJson<{ ok: boolean; message?: string }>(`/api/projects/${projectId}/chat/messages/${messageId}/memory-saved`, {
      method: "PATCH",
    });
    if (!result.ok) throw new Error(result.message || "mark chat memory saved failed");
    setProjectChats((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).map((message) => (
        message.id === messageId ? { ...message, savedToMemory: true } : message
      )),
    }));
  }

  async function exportFinalizedMarkdown(targetMeeting?: FinalizedMeeting) {
    const archive = targetMeeting || finalizedMeeting;
    if (!archive) return;
    const response = await fetch(`/api/meetings/${archive.meetingId}/export.md`);
    if (!response.ok) {
      setFinalizeStatus("error");
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const fileName = parseDownloadFileName(disposition) || `${archive.title || "会议纪要"}.md`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportTranscriptMarkdown(targetMeeting: FinalizedMeeting) {
    const response = await fetch(`/api/meetings/${targetMeeting.meetingId}/transcripts.md`);
    if (!response.ok) {
      setFinalizeStatus("error");
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const fileName = parseDownloadFileName(disposition) || `${targetMeeting.title || "会议"}-转写记录.md`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function createNewMeeting() {
    if (isRealAsrActive) stopRealAsr();
    setNewMeetingStatus("saving");
    try {
      const state = await apiJson<ApiState>("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          projectName: newMeetingProject,
          title: newMeetingTitle.trim() || `${newMeetingProject}会议`,
        }),
      });
      applyApiState(state);
      setNewMeetingTitle("");
      setNewMeetingOpen(false);
      setFinishOpen(false);
      setFinalizeStatus("idle");
      setFinalizeStage("checklist");
      setFinalDraft(null);
      setFinalizedMeeting(null);
      setFinalizeProjectId(null);
      setMoveActionsWithMeeting(true);
      setAiStatus("idle");
      setNewMeetingStatus("idle");
      setActiveView("meeting");
      await startRealAsr(state.meeting.id);
    } catch {
      setNewMeetingStatus("error");
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) {
      setNewProjectError("项目名称不能为空。");
      setNewProjectStatus("error");
      return;
    }
    setNewProjectStatus("saving");
    try {
      const result = await apiJson<{ ok: boolean; project: Project; projects: Project[] }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setProjects(result.projects);
      setSelectedProject(result.project.name);
      setNewMeetingProject(result.project.name);
      setHistoryProject(result.project.name);
      setActiveView("projects");
      setNewProjectName("");
      setNewProjectError("");
      setNewProjectOpen(false);
      setNewProjectStatus("idle");
    } catch (error) {
      setNewProjectError(error instanceof Error ? error.message : "项目创建失败。");
      setNewProjectStatus("error");
    }
  }

  async function startRealAsr(meetingIdOverride?: number, options: { reconnect?: boolean } = {}) {
    if (!options.reconnect && isLiveAsrSessionActive(liveAsrStatus)) return;
    const targetMeetingId = meetingIdOverride ?? asrMeetingIdRef.current ?? meeting.id;
    asrSessionActiveRef.current = true;
    asrMeetingIdRef.current = targetMeetingId;
    intentionalStopRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sealTimeoutRef.current) {
      window.clearTimeout(sealTimeoutRef.current);
      sealTimeoutRef.current = null;
    }
    setLiveAsrStatus(options.reconnect ? "reconnecting" : "connecting");
    setLiveAsrText(options.reconnect ? "录音连接恢复中..." : "正在请求麦克风权限...");
    setRecording(true);

    try {
      const stream = streamRef.current && streamRef.current.getAudioTracks().some((track) => track.readyState === "live")
        ? streamRef.current
        : await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      streamRef.current = stream;

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const model = selectedAsrModel || asrModels[0]?.id || "ke-stream-asr";
      const socket = new WebSocket(`${protocol}://${window.location.host}/api/asr/live?meetingId=${targetMeetingId}&model=${encodeURIComponent(model)}`);
      socket.binaryType = "arraybuffer";
      wsRef.current = socket;
      let audioPipelineStarted = false;

      const sendPcm = (pcm: Int16Array) => {
        if (!pcm.length) return;
        const activeSocket = wsRef.current;
        const sourceNextSample = sourceNextSampleRef.current;
        if (sourceNextSample === null || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
          // 上游 ASR 尚未准备好时仍先采集；WebSocket 建立后通常只会积累
          // 数百毫秒。上限五分钟，避免异常页面无限占用内存。
          if (pendingPcmRef.current.samples < 16000 * 60 * 5) {
            pendingPcmRef.current.chunks.push(pcm);
            pendingPcmRef.current.samples += pcm.length;
          }
          return;
        }
        const sequence = audioChunkSequenceRef.current;
        activeSocket.send(JSON.stringify({
          type: "audio.chunk",
          sequence,
          startSample: sourceNextSample,
          sampleCount: pcm.length,
          sampleRate: 16000,
        }));
        activeSocket.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
        sourceNextSampleRef.current = sourceNextSample + pcm.length;
        audioChunkSequenceRef.current = sequence + 1;
      };

      const flushPendingPcm = () => {
        while (pendingPcmRef.current.chunks.length && sourceNextSampleRef.current !== null && socket.readyState === WebSocket.OPEN) {
          const pcm = pendingPcmRef.current.chunks.shift();
          if (pcm) sendPcm(pcm);
        }
        pendingPcmRef.current.samples = 0;
      };

      const startAudioPipeline = async () => {
        if (audioPipelineStarted || processorRef.current || socket.readyState !== WebSocket.OPEN) return;
        audioPipelineStarted = true;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextCtor({ sampleRate: 16000 });
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const resample = createFloat32Resampler(audioContext.sampleRate, 16000);
        const mute = audioContext.createGain();
        mute.gain.value = 0;
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const input = event.inputBuffer.getChannelData(0);
          updateEndpointing(ws, input);
          sendPcm(float32ToPcm16(resample(input)));
        };

        source.connect(processor);
        processor.connect(mute);
        mute.connect(audioContext.destination);
        if (audioContext.state === "suspended") await audioContext.resume();
      };

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setAsrDisconnectInfo(null);
        setLiveAsrStatus("connecting");
        setLiveAsrText("录音已开始，ASR 服务连接中...");
        void startAudioPipeline().catch((error) => {
          setLiveAsrText(error instanceof Error ? `录音启动失败：${error.message}` : "录音启动失败");
          socket.close(1011, "audio pipeline error");
        });
      };

      socket.onmessage = async (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const type = message.type as string;
        if (type === "status" && message.status === "source_audio_ready") {
          sourceNextSampleRef.current = Number(message.nextSample || 0);
          flushPendingPcm();
          return;
        }
        if (type === "status" && message.status === "source_audio_chunk_rejected") {
          setLiveAsrText("录音块校验失败，正在安全重连...");
          socket.close(1011, "source audio chunk rejected");
          return;
        }
        if (type === "status" && message.status === "connected") {
          setLiveAsrStatus("connecting");
          setLiveAsrText("ASR 服务准备中...");
        }
        if (type === "status" && message.status === "upstream_reconnecting") {
          setLiveAsrStatus("reconnecting");
          setLiveAsrText("ASR 服务短暂中断，正在后台恢复...");
          return;
        }
        if (type === "status" && message.status === "realtime_asr_audio_gap") {
          setLiveAsrText((message.message as string) || "实时识别暂时中断，完整录音仍在保存...");
          pushToast("info", "实时识别出现缺口，文件 ASR 将根据完整录音补齐");
          return;
        }
        if (type === "status" && message.status === "reconnected") {
          setLiveAsrStatus("connecting");
          setLiveAsrText("ASR 服务已恢复，正在继续识别...");
          return;
        }
        if (type === "status" && message.status === "started") {
          await startAudioPipeline();
          reconnectAttemptRef.current = 0;
          setAsrDisconnectInfo(null);
          setLiveAsrStatus("recording");
          setLiveAsrText("真实麦克风识别中...");
          return;
        }
        if (type === "transcript.partial") {
          liveAsrDraftRef.current.partial = message.text as string;
          setLiveAsrText(getDisplayDraft(liveAsrDraftRef.current.buffered, liveAsrDraftRef.current.partial));
        }
        if (type === "transcript.buffered") {
          liveAsrDraftRef.current.buffered = message.text as string;
          setLiveAsrText(getDisplayDraft(liveAsrDraftRef.current.buffered, liveAsrDraftRef.current.partial));
        }
        if (type === "transcript.final") {
          liveAsrDraftRef.current = { buffered: "", partial: "" };
          setLiveAsrText("");
          setTranscripts((current) => [
            ...current.map((line) => ({ ...line, focus: false })),
            {
              ...(message.line as TranscriptLine),
              focus: true,
              presentationKey: `transcript-${(message.line as TranscriptLine).id}`,
              recentlyCalibrated: false,
            },
          ]);
          const finalizedLine = message.line as TranscriptLine;
          setRealtimeTimelineSegments((current) => current.filter((preview) => !hasTimelineOverlap(preview, finalizedLine)));
        }
        if (type === "transcript.realtime_segment" && message.segment) {
          const segment = message.segment as TranscriptLine;
          setRealtimeTimelineSegments((current) => {
            if (current.some((line) => line.id === segment.id)) return current;
            return [...current, {
              ...segment,
              isRealtimePreview: true,
              presentationKey: `preview-${segment.id}`,
            }];
          });
        }
        if (type === "status" && message.status === "correcting") {
          setCalibrationStatus("正在后台校正刚才的实时转写，原文会保留在原位置更新。");
        }
        if (type === "status" && message.status === "rolling_correction") {
          setCalibrationStatus("正在后台优化已显示的实时转写，不会中断后续识别。");
        }
        if (type === "status" && message.status === "rolling_correction_complete") {
          const state = await apiJson<ApiState>("/api/state");
          applyApiState(state);
          const updatedCount = Number(message.updatedCount || 0);
          setCalibrationStatus(updatedCount > 0 ? `已在原位置优化 ${updatedCount} 条转写。` : "实时转写已完成稳定校准。");
          if (updatedCount > 0) pushToast("success", `已校准 ${updatedCount} 条转写`);
        }
        if (type === "status" && message.status === "stable_speaker_enrichment_complete") {
          if (Number(message.updatedCount || 0) > 0) {
            const state = await apiJson<ApiState>("/api/state");
            applyApiState(state);
          }
        }
        if (type === "status" && message.status === "rolling_correction_failed") {
          setCalibrationStatus("本轮后台优化未完成，实时转写已保留，稍后会自动补齐。");
          pushToast("info", "高质量校准暂未完成，已保留实时草稿");
        }
        if (type === "status" && message.status === "sealed_pending_correction") {
          setLiveAsrStatus("stopping");
          setLiveAsrText((message.message as string) || "录音已保存，正在完成尾段校准...");
          return;
        }
        if (type === "status" && message.status === "sealed") {
          if (sealTimeoutRef.current) {
            window.clearTimeout(sealTimeoutRef.current);
            sealTimeoutRef.current = null;
          }
          // 最终文件 ASR 可能在最后一条实时稿之后才完成；结束录音时强制
          // 拉一次最新状态，确保页面立即显示已经替换好的稳定稿。
          try {
            const state = await apiJson<ApiState>("/api/state");
            applyApiState(state);
          } catch {
            // 网络短暂波动不应阻塞会话关闭；下次进入会议仍会从服务端加载。
          }
          setLiveAsrStatus("idle");
          setLiveAsrText("");
          if (socket.readyState === WebSocket.OPEN) socket.close(1000, "meeting sealed");
          return;
        }
        if (type === "error") {
          const msg = (message.message as string) || "";
          setLiveAsrText(msg ? `ASR 连接异常：${msg}` : "ASR 连接异常，正在尝试恢复...");
          socket.close(1011, "asr error");
        }
        if (type === "transcript.error") {
          const reason = (message.reason as string) || "";
          pushToast("error", reason ? `转写保存失败：${reason}` : "转写保存失败，请稍后重试");
        }
      };

      socket.onerror = () => {
        setLiveAsrText("录音连接异常，正在尝试恢复...");
      };

      socket.onclose = (event) => {
        if (sealTimeoutRef.current) {
          window.clearTimeout(sealTimeoutRef.current);
          sealTimeoutRef.current = null;
        }
        if (asrSessionActiveRef.current && !intentionalStopRef.current) {
          if (wsRef.current === socket) wsRef.current = null;
          sourceNextSampleRef.current = null;
          scheduleAsrReconnect(targetMeetingId, {
            code: event.code,
            reason: event.reason || getWebSocketCloseReason(event.code),
          });
          return;
        }
        cleanupAudio();
        setRecording(false);
        setLiveAsrStatus("idle");
      };
    } catch (error) {
      cleanupAudio();
      if (asrSessionActiveRef.current && !isPermissionError(error)) {
        setLiveAsrText(error instanceof Error ? `录音恢复失败：${error.message}` : "录音恢复失败");
        scheduleAsrReconnect(targetMeetingId, {
          code: 0,
          reason: error instanceof Error ? error.message : "启动失败",
        });
        return;
      }
      asrSessionActiveRef.current = false;
      setRecording(false);
      setLiveAsrStatus("error");
      setLiveAsrText(error instanceof Error ? error.message : "无法启动麦克风");
    }
  }

  function scheduleAsrReconnect(meetingId: number, closeInfo?: { code: number; reason: string }) {
    if (!asrSessionActiveRef.current) return;
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    reconnectAttemptRef.current += 1;
    const delay = Math.min(1000 * 2 ** Math.min(reconnectAttemptRef.current - 1, 4), 10_000);
    const nextInfo = closeInfo ? {
      code: closeInfo.code,
      reason: closeInfo.reason,
      at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      attempt: reconnectAttemptRef.current,
    } : null;
    if (nextInfo) setAsrDisconnectInfo(nextInfo);
    setRecording(true);
    setLiveAsrStatus("reconnecting");
    setLiveAsrText(`录音连接已断开，${Math.round(delay / 1000)} 秒后自动恢复...`);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!asrSessionActiveRef.current) return;
      void startRealAsr(meetingId, { reconnect: true });
    }, delay);
  }

  function updateEndpointing(socket: WebSocket, input: Float32Array) {
    const state = vadStateRef.current;
    const now = performance.now();
    const rms = getRms(input);
    const voiceThreshold = 0.012;
    const silenceThreshold = 0.008;
    const minSpeechMs = 900;
    const endSilenceMs = 1900;
    const maxSegmentMs = 25_000;
    const minEndpointGapMs = 2200;

    if (rms >= voiceThreshold) {
      if (!state.speaking) {
        state.speaking = true;
        state.speechStartedAt = now;
        socket.send(JSON.stringify({ type: "vad.speech_start" }));
      }
      state.lastVoiceAt = now;
    }

    if (!state.speaking) return;

    const speechDuration = now - state.speechStartedAt;
    const silenceDuration = now - state.lastVoiceAt;
    const endpointGap = now - state.lastEndpointAt;

    if (speechDuration >= maxSegmentMs && endpointGap >= minEndpointGapMs) {
      state.speechStartedAt = now;
      state.lastEndpointAt = now;
      socket.send(JSON.stringify({ type: "vad.endpoint", reason: "max_duration" }));
      return;
    }

    if (rms <= silenceThreshold && speechDuration >= minSpeechMs && silenceDuration >= endSilenceMs && endpointGap >= minEndpointGapMs) {
      state.speaking = false;
      state.lastEndpointAt = now;
      socket.send(JSON.stringify({ type: "vad.endpoint", reason: "silence" }));
    }
  }

  function stopRealAsr() {
    intentionalStopRef.current = true;
    asrSessionActiveRef.current = false;
    asrMeetingIdRef.current = null;
    reconnectAttemptRef.current = 0;
    setAsrDisconnectInfo(null);
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setLiveAsrStatus((current) => current === "idle" ? "idle" : "stopping");
    setRecording(false);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "vad.endpoint", reason: "stop" }));
      ws.send("stop");
      cleanupAudio({ preserveSocket: true });
      setLiveAsrText("录音已停止，正在保存并校准尾段...");
      sealTimeoutRef.current = window.setTimeout(() => {
        sealTimeoutRef.current = null;
        if (ws.readyState === WebSocket.OPEN) ws.close(1000, "seal timeout");
        setLiveAsrStatus("idle");
        setLiveAsrText("");
      }, 150_000);
      return;
    }
    cleanupAudio();
    setLiveAsrStatus("idle");
    setLiveAsrText("");
  }

  function cleanupAudio(options: { preserveSocket?: boolean } = {}) {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (!options.preserveSocket) {
      wsRef.current = null;
      sourceNextSampleRef.current = null;
      audioChunkSequenceRef.current = 0;
      pendingPcmRef.current = { chunks: [], samples: 0 };
    }
    vadStateRef.current = { speaking: false, speechStartedAt: 0, lastVoiceAt: 0, lastEndpointAt: 0 };
    liveAsrDraftRef.current = { buffered: "", partial: "" };
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Mic size={18} /></div>
          <div>
            <strong>声纪</strong>
            <span>会议行动闭环</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          <NavItem
            icon={<Home size={18} />}
            label="首页"
            active={activeView === "home"}
            onClick={() => setActiveView("home")}
          />
          <NavItem icon={<History size={18} />} label="会议" active={activeView === "history"} onClick={() => { setHistoryProject(selectedProject); setHistoryFromProject(false); setActiveView("history"); setSelectedArchiveId(null); }} />
          <NavItem icon={<FolderKanban size={18} />} label="项目" active={activeView === "projectList" || activeView === "projects"} onClick={() => setActiveView("projectList")} actionIcon={<Plus size={14} />} onAction={() => setNewProjectOpen(true)} />
          <NavItem icon={<ListChecks size={18} />} label="待办" badge={String(backlogPendingCount)} active={activeView === "actions"} onClick={() => { setActionProjectFilter("all"); setActiveView("actions"); }} />
          <NavItem icon={<Tags size={18} />} label="热词库" badge={String(glossaryEntries.length)} active={activeView === "glossary"} onClick={() => setActiveView("glossary")} />
          <NavItem icon={<Trash2 size={18} />} label="回收站" active={activeView === "trash"} onClick={() => setActiveView("trash")} />
        </nav>

        <section className="sidebar-section">
          <div className="section-title">
            <span>项目</span>
          </div>
          <div className="project-list">
            {projects.map((project) => (
              <div
                key={project.name}
                className={`project-row ${selectedProject === project.name && activeView === "projects" ? "active" : ""}`}
                onClick={() => {
                  setSelectedProject(project.name);
                  setProjectInitialTab("meetings");
                  setActiveView("projects");
                }}
              >
                <span className="project-row-name">{project.name}</span>
                <em>{project.count}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="sidebar-note">
          <span>今日会议</span>
          <strong>{actions.length} 项</strong>
          <small>本地库：{dbStatus === "ready" ? "已连接" : dbStatus === "loading" ? "连接中" : "离线兜底"}</small>
        </section>

        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "切换到浅色背景" : "切换到深色背景"}
          title={theme === "dark" ? "切换到浅色背景" : "切换到深色背景"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === "dark" ? "浅色" : "深色"}</span>
        </button>
      </aside>

      <div className="app-main">
        <div className="app-topbar">
          <div className="app-topbar-search">
            <Search className="app-topbar-search-icon" size={15} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索项目、会议、纪要、待办..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && searchQuery.trim()) handleSearch(); }}
            />
            <span className="app-topbar-kbd">⌘K</span>
          </div>
          <div className="app-topbar-actions">
            <button
              className="app-topbar-btn"
              onClick={() => setTodoDrawerOpen(true)}
              title="全局待办"
            >
              <ListChecks size={15} />
              待办
              {backlogPendingCount > 0 && <span className="app-topbar-btn-badge">{backlogPendingCount}</span>}
            </button>
            <button
              className="app-topbar-btn"
              onClick={() => setNewMeetingOpen(true)}
              title="新建会议"
            >
              <Plus size={15} />
              新建会议
            </button>
          </div>
        </div>

      <main className="meeting-room">
        {activeView === "home" ? (
          <HomePage
            meeting={meeting}
            finalizedMeetings={finalizedMeetings}
            actionBacklog={actionBacklog}
            transcripts={transcripts}
            speakerStats={speakerStats}
            summaryBlocks={summaryBlocks}
            elapsed={elapsed}
            isRealAsrActive={isRealAsrActive}
            finalizedMeeting={finalizedMeeting}
            onNewMeeting={() => setNewMeetingOpen(true)}
            onEnterMeeting={() => setActiveView("meeting")}
            onPauseRecording={() => { if (isRealAsrActive) stopRealAsr(); }}
            onEndMeeting={() => {
              setFinalizeStage("checklist");
              setFinalizeProjectId(projects.find((p) => p.name === meeting.projectName)?.id ?? null);
              setFinishOpen(true);
            }}
            onOpenActions={() => setTodoDrawerOpen(true)}
            onOpenHistory={() => { setHistoryProject(selectedProject); setActiveView("history"); setSelectedArchiveId(null); }}
            onUpdateAction={(action, patch) => updateBacklogAction(action, patch as Partial<ActionItem>)}
          />
        ) : activeView === "history" ? (
          <HistoryMeetingsPage
            archives={finalizedMeetings}
            projects={projects}
            selectedProject={historyProject}
            selectedMeetingId={selectedArchiveId}
            onProjectChange={(projectName) => {
              setHistoryProject(projectName);
              setSelectedArchiveId(null);
            }}
            onSelect={(meetingId) => {
              const archive = finalizedMeetings.find((item) => item.meetingId === meetingId);
              if (archive) setHistoryProject(archive.projectName);
              setSelectedArchiveId(meetingId);
            }}
            onExport={exportFinalizedMarkdown}
            onExportTranscripts={exportTranscriptMarkdown}
            onReEdit={(archive) => {
              setFinalDraft({
                title: archive.title,
                projectName: archive.projectName,
                model: archive.model,
                overview: archive.overview,
                topics: archive.topics,
                timelineChapters: archive.timelineChapters,
                decisions: archive.decisions,
                risks: archive.risks,
                openQuestions: archive.openQuestions,
                quoteMoments: archive.quoteMoments,
                speakerViewpoints: archive.speakerViewpoints,
                projectMemory: archive.memoryUpdates,
                actionUpdates: archive.actionSnapshot,
                transcriptCount: archive.transcriptCount,
              });
              setFinalDraftMeetingId(archive.meetingId);
              setFinalizedMeeting(null);
              setFinalizeStage("editor");
              setFinalizeProjectId(projects.find((p) => p.name === archive.projectName)?.id ?? null);
              setFinishOpen(true);
              pushToast("info", "已从归档恢复草稿，编辑后重新归档生效。");
            }}
            onNewMeeting={() => {
              setNewMeetingOpen(true);
            }}
            onDeleteMeeting={(meetingId) => { void deleteMeeting(meetingId); }}
            onBack={historyFromProject ? () => {
              setSelectedArchiveId(null);
              setHistoryFromProject(false);
              setActiveView("projects");
            } : undefined}
          />
        ) : activeView === "projectList" ? (
          <ProjectListPage
            projects={projects}
            archives={finalizedMeetings}
            actions={actionBacklog}
            onNewProject={() => setNewProjectOpen(true)}
            onOpenProject={(projectName) => {
              setSelectedProject(projectName);
              setProjectInitialTab("meetings");
              setActiveView("projects");
            }}
            onDeleteProject={(projectId) => { void deleteProject(projectId); }}
          />
        ) : activeView === "projects" ? (
          <ProjectWorkspacePage
            project={selectedProjectData}
            memory={selectedProjectMemory}
            archives={selectedProjectArchives}
            actions={selectedProjectActions}
            chatHistory={selectedProjectData?.id ? projectChats[selectedProjectData.id] ?? [] : []}
            initialTab={projectInitialTab}
            onNewProject={() => setNewProjectOpen(true)}
            onSaveMemory={saveProjectMemory}
            onAskProject={askProjectAi}
            onLoadChatHistory={loadProjectChatHistory}
            onCreateActionFromChat={createActionFromChat}
            onMarkChatMemorySaved={markProjectChatMemorySaved}
            onNewMeeting={() => {
              setNewMeetingProject(selectedProject);
              setNewMeetingOpen(true);
            }}
            onOpenActions={() => {
              setActionProjectFilter(selectedProject);
              setActiveView("actions");
            }}
            onOpenHistory={() => {
              setHistoryProject(selectedProject);
              setSelectedArchiveId(null);
              setHistoryFromProject(true);
              setActiveView("history");
            }}
            onOpenArchive={(meetingId) => {
              setHistoryProject(selectedProject);
              setSelectedArchiveId(meetingId);
              setHistoryFromProject(true);
              setActiveView("history");
            }}
            onUpdateAction={(action, patch) => updateBacklogAction(action, patch as Partial<ActionItem>)}
            onAddAction={(projectName) => addAction(projectName)}
            taskEvents={taskEvents}
            allProjects={projects}
            finalizedMeetings={finalizedMeetings.map((m) => ({ meetingId: m.meetingId, title: m.title, projectName: m.projectName }))}
            onDeleteAction={(actionId) => { void deleteAction(actionId); }}
          />
        ) : activeView === "glossary" ? (
          <GlossaryPage
            entries={glossaryEntries}
            projects={projects}
            onSave={saveGlossaryEntry}
            onDelete={deleteGlossaryEntry}
          />
        ) : activeView === "actions" ? (
          <ActionsPage
            actions={actionBacklog}
            taskEvents={taskEvents}
            projectFilter={actionProjectFilter}
            onProjectFilterChange={setActionProjectFilter}
            onAdd={(projectName, meetingId) => addAction(projectName, meetingId)}
            onUpdate={updateBacklogAction as (action: ActionBacklogItem, patch: Partial<ActionItem> & { meetingId?: number; meetingTitle?: string; projectName?: string }) => void}
            onOpenMeeting={() => setActiveView("meeting")}
            projects={projects}
            finalizedMeetings={finalizedMeetings}
            onDeleteAction={(id) => { void deleteAction(id); }}
          />
        ) : activeView === "trash" ? (
          <TrashPage
            onRestore={(type, id) => { void restoreItem(type, id); }}
            onPurge={(type, id) => { void purgeItem(type, id); }}
            onRefresh={() => { void loadTrash(); }}
            trash={trashData}
          />
        ) : (
          <>
        <header className="meeting-header">
          <div>
            <div className="breadcrumb">实时会议 / {meeting.projectName}</div>
            <h1>{meeting.title}</h1>
          </div>
          <div className="header-actions">
            <div className={`recording-pill ${isRealAsrActive ? `is-${asrStatusTone}` : ""}`} title={asrStatusDetail || undefined}>
              <span />
              {isRealAsrActive ? asrStatusLabel : "未录音"}
            </div>
            {isRealAsrActive && (
              <div className="live-wave" aria-hidden="true">
                <i /><i /><i /><i /><i /><i />
              </div>
            )}
            <div className="timer"><Clock3 size={16} />{elapsedText}</div>
            <button
              className="icon-button"
              onClick={isRealAsrActive ? stopRealAsr : () => startRealAsr()}
              aria-label={isRealAsrActive ? "停止真实录音" : "开始真实录音"}
              title={isRealAsrActive ? "停止真实录音" : "开始真实录音"}
            >
              {isRealAsrActive ? <Square size={17} /> : <Mic size={17} />}
            </button>
            <button className="primary-button" onClick={() => { setFinalizeStage("checklist"); setFinalizeProjectId(projects.find((p) => p.name === meeting.projectName)?.id ?? null); setFinishOpen(true); }}>结束会议</button>
          </div>
        </header>

        <MeetingFlowBar steps={flowSteps} />

        <section className="meeting-workspace">
        <section className="meeting-tabs-container">
          <div className="meeting-tabs">
            <button className={`meeting-tab ${meetingTab === "live" ? "active" : ""}`} onClick={() => setMeetingTab("live")}>
              实时会议
              {isRealAsrActive && <span className="meeting-tab-badge live">进行中</span>}
            </button>
            <button className={`meeting-tab ${meetingTab === "actions" ? "active" : ""}`} onClick={() => setMeetingTab("actions")}>
              候选行动项
              {candidateCount + clarifyCount > 0 && <span className="meeting-tab-badge">{candidateCount + clarifyCount}</span>}
            </button>
            <button className={`meeting-tab ${meetingTab === "history" ? "active" : ""}`} onClick={() => setMeetingTab("history")}>
              历史上下文
            </button>
          </div>
        </section>

        <section className="meeting-tab-content">
          {meetingTab === "live" && (
            <div className="meeting-live-layout">
              <TranscriptPanel
                transcripts={displayTranscripts}
                liveAsrText={liveAsrText}
                calibrationStatus={calibrationStatus}
                isRealAsrActive={isRealAsrActive}
                asrStatusLabel={asrStatusLabel}
                speakerStats={speakerStats}
                speakerEditingId={speakerEditingId}
                speakerDraft={speakerDraft}
                getSpeakerOptions={getSpeakerOptions}
                onClose={undefined}
                onSpeakerCorrectionStart={(line) => { setSpeakerEditingId(line.id); setSpeakerDraft(line.speaker); }}
                onSpeakerCorrectionFinish={(line) => finishSpeakerCorrection(line)}
                onSpeakerCorrectionCancel={() => { setSpeakerEditingId(null); setSpeakerDraft(""); }}
                onSpeakerDraftChange={(value) => setSpeakerDraft(value)}
                onSpeakerRename={(oldName, newName) => { renameSpeakerEverywhere(oldName, newName); }}
                onSpeakerMerge={(source, target) => { mergeSpeakerEverywhere(source, target); }}
                onSpeakerDelete={(speakerName) => { deleteSpeakerEverywhere(speakerName); }}
                onGlossaryCorrection={(line, newText) => { void correctGlossaryFromTranscript(line, newText); }}
              />
              <section className="right-panel">
                <div className="outline-section">
                  <div className="outline-section-header">
                    <div>
                      <div className="outline-section-title">实时总结</div>
                      <div className="outline-section-sub">
                        {aiStatus === "running" ? "AI 正在分析" : aiStatus === "done" ? "AI 已刷新" : "稳定转写更新后自动分析"}
                      </div>
                    </div>
                    <div className="outline-section-actions">
                      <button className="ghost-button" onClick={() => void runAiAnalyze("manual")} disabled={aiStatus === "running"} title="手动刷新">
                        <RefreshCw size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="outline-body" ref={outlineBodyRef}>
                    <LiveSummaryCanvas
                      blocks={summaryBlocks}
                      transcripts={transcripts}
                    />
                  </div>
                </div>
                <div className="live-section">
                  <div className="live-section-header">
                    <div>
                      <div className="outline-section-title">正在讨论</div>
                      <div className="outline-section-sub">当前议题 · 按说话人摘要</div>
                    </div>
                  </div>
                  <div className="live-body" ref={liveBodyRef}>
                    <LiveDiscussionPanel
                      blocks={summaryBlocks}
                      transcripts={transcripts}
                      liveAsrText={liveAsrText}
                      getSpeakerColor={getSpeakerColor}
                      getSpeakerNumber={getSpeakerNumber}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {meetingTab === "actions" && (
            <ActionItemsTab
              actions={actions}
              editingId={editingId}
              onEdit={(id) => setEditingId(id)}
              onCloseEdit={() => setEditingId(null)}
              onUpdate={(id, patch) => updateAction(id, patch)}
              onDelete={(id) => { void deleteAction(id); }}
              onAdd={() => addAction()}
            />
          )}

          {meetingTab === "history" && (
            <HistoryContextTab
              context={historyContext}
              blocks={historyBlocks}
              onOpenProjectMemory={(projectName) => {
                const project = projects.find((p) => p.name === projectName);
                if (project) {
                  setSelectedProject(projectName);
                  setProjectInitialTab("memory");
                  setActiveView("projects");
                }
              }}
              onOpenActions={(projectName) => {
                setActionProjectFilter(projectName);
                setActiveView("actions");
              }}
            />
          )}
        </section>
        </section>
          </>
        )}
      </main>

        <TodoDrawer
          open={todoDrawerOpen}
          onClose={() => setTodoDrawerOpen(false)}
          actionBacklog={actionBacklog}
          onUpdateAction={(action, patch) => updateBacklogAction(action, patch as Partial<ActionItem>)}
          onJumpToSource={(action) => {
            setTodoDrawerOpen(false);
            setSelectedProject(action.projectName);
            setActionProjectFilter(action.projectName);
            setActiveView("actions");
          }}
        />
      </div>

      {finishOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="会后整理"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <div className="finish-modal">
            <div className="modal-head">
              <div>
                <span>会后整理 · {finalizeMode === "fast" ? finalFastModel : finalModel}</span>
                <h2>{finalizeStage === "done" ? "本次会议已归档" : finalizeStage === "editor" ? "编辑最终纪要草稿" : "归档前检查"}</h2>
              </div>
              <button className="icon-button" onClick={() => setFinishOpen(false)}><MoreHorizontal size={18} /></button>
            </div>
            <div className="finalize-steps" aria-hidden="true">
              {([
                ["checklist", "归档前检查"],
                ["editor", "生成纪要"],
                ["done", "完成"],
              ] as const).map(([stage, label], index) => {
                const current = { checklist: 0, editor: 1, done: 2 }[finalizeStage];
                const state = index < current ? "done" : index === current ? "active" : "";
                return (
                  <div className={`finalize-step ${state}`} key={stage}>
                    <em>{index + 1}</em>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
            {finalizeStage === "done" && finalizedMeeting ? (
              <FinalizedComplete
                meeting={finalizedMeeting}
                onOpenHistory={() => {
                  setSelectedArchiveId(finalizedMeeting.meetingId);
                  setHistoryProject(finalizedMeeting.projectName);
                  setActiveView("history");
                  setFinishOpen(false);
                }}
                onOpenActions={() => {
                  setActionProjectFilter(finalizedMeeting.projectName);
                  setActiveView("actions");
                  setFinishOpen(false);
                }}
                onOpenProject={() => {
                  setSelectedProject(finalizedMeeting.projectName);
                  setProjectInitialTab("memory");
                  setActiveView("projects");
                  setFinishOpen(false);
                }}
                onNewMeeting={() => {
                  setFinishOpen(false);
                  setNewMeetingOpen(true);
                }}
              />
            ) : finalizeStage === "editor" && finalDraft ? (
              <div className="finalize-editor-wrapper">
                <div className="finalize-project-bar">
                  <label>
                    <span>所属项目</span>
                    <select
                      value={finalizeProjectId ?? projects.find((p) => p.name === finalDraft.projectName)?.id ?? ""}
                      onChange={(event) => {
                        const pid = event.currentTarget.value ? Number(event.currentTarget.value) : null;
                        setFinalizeProjectId(pid);
                        const proj = projects.find((p) => p.id === pid);
                        if (proj) setFinalDraft((current) => current ? { ...current, projectName: proj.name } : current);
                      }}
                    >
                      {projects.map((p) => <option value={p.id ?? ""} key={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <span className="finalize-project-hint">切换后点击"确认归档"该会议会归属新的项目，并更新新旧项目的记忆。</span>
                  <label className="finalize-move-actions">
                    <input
                      type="checkbox"
                      checked={moveActionsWithMeeting}
                      onChange={(event) => setMoveActionsWithMeeting(event.currentTarget.checked)}
                    />
                    <span>待办随会议移走</span>
                  </label>
                </div>
                <FinalDraftEditor draft={finalDraft} onChange={updateFinalDraft} />
              </div>
            ) : (
              <FinishChecklist checks={finishChecks} />
            )}
            {finalizeStatus === "error" && <p className="modal-error">归档失败，请稍后重试或检查模型接口。</p>}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setFinishOpen(false)}>{finalizeStage === "done" ? "关闭" : "继续编辑"}</button>
              {finalizeStage === "done" && finalizedMeeting && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (!finalizedMeeting) return;
                    setFinalDraft({
                      title: finalizedMeeting.title,
                      projectName: finalizedMeeting.projectName,
                      model: finalizedMeeting.model,
                      overview: finalizedMeeting.overview,
                      topics: finalizedMeeting.topics,
                      timelineChapters: finalizedMeeting.timelineChapters,
                      decisions: finalizedMeeting.decisions,
                      risks: finalizedMeeting.risks,
                      openQuestions: finalizedMeeting.openQuestions,
                      quoteMoments: finalizedMeeting.quoteMoments,
                      speakerViewpoints: finalizedMeeting.speakerViewpoints,
                      projectMemory: finalizedMeeting.memoryUpdates,
                      actionUpdates: finalizedMeeting.actionSnapshot,
                      transcriptCount: finalizedMeeting.transcriptCount,
                    });
                    setFinalDraftMeetingId(finalizedMeeting.meetingId);
                    setFinalizedMeeting(null);
                    setFinalizeStage("editor");
                    pushToast("info", "已从归档恢复草稿，编辑后重新归档生效。");
                  }}
                >
                  重新编辑
                </button>
              )}
              {finalizeStage === "done" && finalizedMeeting && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSelectedArchiveId(finalizedMeeting.meetingId);
                    setActiveView("history");
                    setFinishOpen(false);
                  }}
                >
                  <History size={15} />查看历史会议
                </button>
              )}
              {finalizeStage !== "done" && (
                <div className="finalize-mode-toggle">
                  <button
                    type="button"
                    className={finalizeMode === "fast" ? "active" : ""}
                    onClick={() => setFinalizeMode("fast")}
                    disabled={finalizeStatus === "running"}
                  >
                    快速 · {finalFastModel}
                  </button>
                  <button
                    type="button"
                    className={finalizeMode === "deep" ? "active" : ""}
                    onClick={() => setFinalizeMode("deep")}
                    disabled={finalizeStatus === "running"}
                  >
                    深度 · {finalModel}
                  </button>
                </div>
              )}
              {finalizeStage === "editor" && (
                <button className="secondary-button" onClick={generateFinalDraft} disabled={finalizeStatus === "running"}>
                  重新生成
                </button>
              )}
              <button
                className="primary-button"
                onClick={finalizeStage === "done" ? () => setFinishOpen(false) : finalizeStage === "editor" ? saveFinalDraft : generateFinalDraft}
                disabled={finalizeStatus === "running" || (finalizeStage === "checklist" && (isRealAsrActive || isFinalSealPending))}
              >
                {finalizeStatus === "running"
                  ? "处理中"
                  : finalizeStage === "done"
                    ? "完成"
                    : finalizeStage === "editor"
                      ? "确认归档"
                      : isRealAsrActive
                        ? "请先停止录音"
                        : isFinalSealPending
                          ? "正在完成尾段校准"
                          : "生成草稿"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newProjectOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="新项目">
          <div className="finish-modal new-meeting-modal">
            <div className="modal-head">
              <div>
                <span>新项目</span>
                <h2>创建项目工作区</h2>
              </div>
              <button className="icon-button" onClick={() => { setNewProjectOpen(false); setNewProjectError(""); setNewProjectStatus("idle"); }}><MoreHorizontal size={18} /></button>
            </div>
            <div className="new-meeting-form">
              <label>
                项目名称
                <input
                  value={newProjectName}
                  onChange={(event) => {
                    setNewProjectName(event.target.value);
                    if (newProjectStatus === "error") {
                      setNewProjectStatus("idle");
                      setNewProjectError("");
                    }
                  }}
                  placeholder="例如：客服质检二期"
                  autoFocus
                />
              </label>
              <p>创建后会进入项目工作区。这个项目后续的会议、历史档案、待办和项目记忆会按项目聚合。</p>
            </div>
            {newProjectStatus === "error" && <p className="modal-error">{newProjectError || "项目创建失败，请稍后重试。"}</p>}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setNewProjectOpen(false); setNewProjectError(""); setNewProjectStatus("idle"); }}>取消</button>
              <button className="primary-button" onClick={createProject} disabled={newProjectStatus === "saving"}>
                {newProjectStatus === "saving" ? "创建中" : "创建项目"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newMeetingOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="新会议">
          <div className="finish-modal new-meeting-modal">
            <div className="modal-head">
              <div>
                <span>新会议</span>
                <h2>开启一场干净的实时会议</h2>
              </div>
              <button className="icon-button" onClick={() => setNewMeetingOpen(false)}><MoreHorizontal size={18} /></button>
            </div>
            <div className="new-meeting-form">
              <label>
                项目
                <select value={newMeetingProject} onChange={(event) => setNewMeetingProject(event.target.value)}>
                  {projects.map((project) => <option key={project.name}>{project.name}</option>)}
                </select>
              </label>
              <label>
                会议标题
                <input
                  value={newMeetingTitle}
                  onChange={(event) => setNewMeetingTitle(event.target.value)}
                  placeholder={`${newMeetingProject}会议`}
                />
              </label>
              <p>创建后会自动请求麦克风并开始真实记录，同时载入该项目最近一次归档作为历史上下文。</p>
            </div>
            {newMeetingStatus === "error" && <p className="modal-error">新会议创建失败，请稍后重试。</p>}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setNewMeetingOpen(false)}>取消</button>
              <button className="primary-button" onClick={createNewMeeting} disabled={newMeetingStatus === "saving"}>
                {newMeetingStatus === "saving" ? "创建中" : "创建会议"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function TrashPage({
  trash,
  onRestore,
  onPurge,
}: {
  trash: { projects: any[]; meetings: any[]; actions: any[] };
  onRestore: (type: "project" | "meeting" | "action", id: number) => void;
  onPurge: (type: "project" | "meeting" | "action", id: number) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = React.useState<"projects" | "meetings" | "actions">("projects");
  const items = trash[tab] || [];

  const tabConfig = [
    { key: "projects" as const, label: "项目", count: trash.projects.length, icon: <FolderKanban size={16} /> },
    { key: "meetings" as const, label: "会议", count: trash.meetings.length, icon: <History size={16} /> },
    { key: "actions" as const, label: "待办", count: trash.actions.length, icon: <ListChecks size={16} /> },
  ];

  return (
    <section className="trash-page history-page">
      <div className="history-page-head">
        <div>
          <div className="breadcrumb">回收站</div>
          <h1>回收站</h1>
        </div>
      </div>

      <div className="trash-tabs-bar">
        {tabConfig.map(({ key, label, count, icon }) => (
          <button
            key={key}
            className={`trash-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {icon}
            <span>{label}</span>
            {count > 0 && <em className="trash-tab-badge">{count}</em>}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="trash-empty">
          <div className="trash-empty-icon">
            <Trash2 size={32} />
          </div>
          <h2>这里很干净</h2>
          <p>删除的{tabConfig.find((t) => t.key === tab)?.label}会出现在这里。</p>
        </div>
      ) : (
        <div className="trash-scroll-area">
          <div className="trash-list">
          {items.map((item) => {
            const deletedDate = new Date(item.deleted_at);
            const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - deletedDate.getTime()) / (24 * 60 * 60 * 1000)));
            const subtitle = item.projectName || item.meetingTitle || "";
            return (
              <div className="trash-card" key={item.id}>
                <div className="trash-card-main">
                  <div className="trash-card-icon">
                    {tab === "projects" ? <FolderKanban size={18} /> : tab === "meetings" ? <History size={18} /> : <ListChecks size={18} />}
                  </div>
                  <div className="trash-card-text">
                    <strong className="trash-card-title">{item.name || item.title}</strong>
                    <div className="trash-card-meta">
                      {subtitle && <span className="trash-card-subtitle">{subtitle}</span>}
                      <span className={`trash-card-days ${daysLeft <= 7 ? "urgent" : ""}`}>
                        {daysLeft <= 7 ? `${daysLeft} 天后清理` : `${deletedDate.toLocaleDateString("zh-CN")} 删除`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="trash-card-actions">
                  <button className="trash-restore-btn" onClick={() => onRestore(tab === "projects" ? "project" : tab === "meetings" ? "meeting" : "action", item.id)}>
                    恢复
                  </button>
                  <button className="trash-purge-btn" onClick={() => {
                    if (confirm("彻底删除后不可恢复，确定吗？")) onPurge(tab === "projects" ? "project" : tab === "meetings" ? "meeting" : "action", item.id);
                  }}>
                    彻底删除
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </section>
  );
}

export default App;
