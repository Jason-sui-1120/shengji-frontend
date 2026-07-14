import React from "react";
import { Check, ListChecks, MessageCircle, Plus, SendHorizontal, Trash2 } from "lucide-react";
import type {
  ActionBacklogItem,
  ActionItem,
  ActionStatus,
  FinalizedMeeting,
  Project,
  ProjectChatMessage,
  ProjectChatResponse,
  ProjectMemory,
  ProjectMemoryDraft,
  TaskEvent,
} from "../../types";
import { isOpenAction, getStatusLabel, stripSourceLabel, getUrgencyLevel, getDateInputValue, getDueFromDateInput, getDueHint } from "../../lib/actions";
import { formatArchiveDate } from "../../lib/date";
import { hasMemoryDraftContent, mergeMemoryWithDraft, splitMemoryLines } from "../../lib/memory";
import { StatusChip } from "../shared/Common";

export function ProjectWorkspacePage({
  project,
  memory,
  archives,
  actions,
  chatHistory,
  onNewProject,
  onSaveMemory,
  onAskProject,
  onLoadChatHistory,
  onCreateActionFromChat,
  onMarkChatMemorySaved,
  onNewMeeting,
  onOpenActions,
  onOpenHistory,
  onOpenArchive,
  onUpdateAction,
  onAddAction,
  taskEvents,
  allProjects,
  finalizedMeetings,
  onDeleteAction,
  initialTab,
}: {
  project?: Project;
  memory: ProjectMemory;
  archives: FinalizedMeeting[];
  actions: ActionBacklogItem[];
  chatHistory: ProjectChatMessage[];
  onNewProject: () => void;
  onSaveMemory: (projectId: number, draft: ProjectMemory) => Promise<void>;
  onAskProject: (projectId: number, question: string) => Promise<ProjectChatResponse>;
  onLoadChatHistory: (projectId: number) => Promise<void>;
  onCreateActionFromChat: (projectId: number, draft: { title: string; owner: string; due: string; source: string }) => Promise<ActionBacklogItem>;
  onMarkChatMemorySaved: (projectId: number, messageId: number) => Promise<void>;
  onNewMeeting: () => void;
  onOpenActions: () => void;
  onOpenHistory: () => void;
  onOpenArchive: (meetingId: number) => void;
  onUpdateAction?: (action: ActionBacklogItem, patch: Partial<ActionItem> & { meetingId?: number; meetingTitle?: string; projectName?: string }) => void;
  onAddAction?: (projectName: string) => void;
  taskEvents: TaskEvent[];
  allProjects: { id?: number; name: string }[];
  finalizedMeetings: { meetingId: number; title: string; projectName: string }[];
  onDeleteAction?: (actionId: number | string) => void;
  initialTab?: "meetings" | "todos" | "memory" | "chat";
}) {
  const [activeTab, setActiveTab] = React.useState<"meetings" | "todos" | "memory" | "chat">(initialTab ?? "meetings");

  React.useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const openActions = actions.filter(isOpenAction);
  const closedActions = actions.filter((action) => !isOpenAction(action));
  const [selectedActionId, setSelectedActionId] = React.useState<string | number | null>(null);
  const [todoFilter, setTodoFilter] = React.useState<"open" | "candidate" | "clarify" | "confirmed" | "in_progress" | "done" | "cancelled" | "all">("open");
  const [isNewTodo, setIsNewTodo] = React.useState(false);
  const [newTodoDraft, setNewTodoDraft] = React.useState({ title: "", owner: "", due: "" });

  // 状态变更后列表刷新：清除不存在的选中
  React.useEffect(() => {
    if (selectedActionId && !actions.some((a) => a.id === selectedActionId)) {
      setSelectedActionId(null);
    }
  }, [actions, selectedActionId]);
  const [editingMemory, setEditingMemory] = React.useState(false);
  const [memoryDraft, setMemoryDraft] = React.useState<ProjectMemory>(memory);
  const [memorySaveStatus, setMemorySaveStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [chatQuestion, setChatQuestion] = React.useState("");
  const [chatMessages, setChatMessages] = React.useState<ProjectChatMessage[]>([]);
  const [chatStatus, setChatStatus] = React.useState<"idle" | "asking" | "error">("idle");
  const [actionDraft, setActionDraft] = React.useState<{ messageIndex: number; title: string; owner: string; due: string; source: string } | null>(null);

  const loadedProjectIdRef = React.useRef<number | null>(null);
  const lastSyncedChatRef = React.useRef<ProjectChatMessage[] | null>(null);

  React.useEffect(() => {
    if (!editingMemory) setMemoryDraft(memory);
  }, [memory, editingMemory]);

  React.useEffect(() => {
    if (!project?.id) return;
    const isFirstLoad = project.id !== loadedProjectIdRef.current;
    const isHistoryUpdated = chatHistory !== lastSyncedChatRef.current;

    if (isFirstLoad) {
      loadedProjectIdRef.current = project.id;
      lastSyncedChatRef.current = chatHistory;
      setChatQuestion("");
      setChatStatus("idle");
      setActionDraft(null);
      setChatMessages(chatHistory);
      if (!chatHistory.length) void onLoadChatHistory(project.id);
    } else if (isHistoryUpdated && chatStatus !== "asking") {
      lastSyncedChatRef.current = chatHistory;
      setChatMessages(chatHistory);
    }
  }, [project?.id, chatHistory, onLoadChatHistory, chatStatus]);

  function updateMemoryDraft(patch: Partial<ProjectMemory>) {
    setMemoryDraft((current) => ({ ...current, ...patch }));
  }

  async function saveMemoryEdits() {
    if (!project?.id) return;
    setMemorySaveStatus("saving");
    try {
      await onSaveMemory(project.id, memoryDraft);
      setEditingMemory(false);
      setMemorySaveStatus("idle");
    } catch {
      setMemorySaveStatus("error");
    }
  }

  async function askProject(questionInput = chatQuestion) {
    const question = questionInput.trim();
    if (!project?.id || !question || chatStatus === "asking") return;
    setChatStatus("asking");
    setChatQuestion("");
    setChatMessages((items) => [...items, { role: "user", content: question }]);
    try {
      const result = await onAskProject(project.id, question);
      setChatMessages((items) => [
        ...items,
        {
          role: "assistant",
          content: result.answer || "暂无回答。",
          sources: result.sources || [],
          followUps: result.followUps || [],
          memoryUpdates: result.memoryUpdates,
          actionSuggestion: result.actionSuggestion ?? null,
        },
      ]);
      setChatStatus("idle");
    } catch {
      setChatMessages((items) => [...items, { role: "assistant", content: "项目 AI 暂时无法回答，请稍后重试。" }]);
      setChatStatus("error");
    }
  }

  async function saveChatMemoryCandidate(messageIndex: number, updates?: ProjectMemoryDraft) {
    if (!project?.id || !updates || memorySaveStatus === "saving") return;
    const merged = mergeMemoryWithDraft(memory, updates);
    setMemorySaveStatus("saving");
    try {
      await onSaveMemory(project.id, merged);
      const messageId = chatMessages[messageIndex]?.id;
      if (messageId) await onMarkChatMemorySaved(project.id, messageId);
      setChatMessages((items) => items.map((message, index) => (
        index === messageIndex ? { ...message, savedToMemory: true } : message
      )));
      setMemorySaveStatus("idle");
    } catch {
      setMemorySaveStatus("error");
    }
  }

  const suggestedQuestions = [
    "这个项目当前最大的风险是什么？",
    "下一次会议应该重点确认什么？",
    "有哪些历史结论发生过变化？",
  ];

  return (
    <section className="project-page tabbed">
      <div className="project-page-head">
        <div>
          <div className="breadcrumb">{project?.name ?? "未选择项目"}</div>
          <h1>{project?.name ?? "未选择项目"}</h1>
          <div className="timeline-page-sub">{archives.length} 场会议 · {openActions.length} 条未关闭待办</div>
        </div>
        <div className="project-page-actions">
          <button className="primary-button" onClick={onNewMeeting}><Plus size={15} />新会议</button>
        </div>
      </div>

      <div className="project-tabs">
        <button type="button" className={`ptab ${activeTab === "meetings" ? "active" : ""}`} onClick={() => setActiveTab("meetings")}>会议 {archives.length > 0 && <em className="ptab-count">{archives.length}</em>}</button>
        <button type="button" className={`ptab ${activeTab === "todos" ? "active" : ""}`} onClick={() => setActiveTab("todos")}>待办 {openActions.length > 0 && <em className="ptab-count urgent">{openActions.length}</em>}</button>
        <button type="button" className={`ptab ${activeTab === "memory" ? "active" : ""}`} onClick={() => setActiveTab("memory")}>记忆</button>
        <button type="button" className={`ptab ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>对话</button>
      </div>

      {activeTab === "meetings" && (
        <div className="project-tab-content">
          <div className="project-tab-head">
            <div className="timeline-page-sub">{archives.length} 场会议 · 按时间倒序</div>
          </div>
          <div className="project-meeting-rows" style={{ maxHeight: "none" }}>
            {archives.length ? archives.map((archive) => {
              const openCount = archive.actionSnapshot.filter((a) => isOpenAction(a)).length;
              const totalCount = archive.actionSnapshot.length;
              return (
                <button
                  key={archive.meetingId}
                  className="timeline-meeting-card compact"
                  onClick={() => onOpenArchive(archive.meetingId)}
                >
                  <div className="timeline-meeting-body">
                    <div className="timeline-meeting-title">{archive.title}</div>
                    <div className="timeline-meeting-meta">
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
            }) : <p className="project-empty">暂无归档会议。下一场会议归档后会在这里形成项目记忆。</p>}
          </div>
        </div>
      )}

      {activeTab === "todos" && (
        <div className="project-todo-layout">
          <div className="project-todo-list-panel">
            <div className="project-todo-filter">
              {([
                { key: "open", label: "待处理", count: actions.filter((a) => isOpenAction(a)).length },
                { key: "candidate", label: "候选", count: actions.filter((a) => a.status === "candidate").length },
                { key: "clarify", label: "待澄清", count: actions.filter((a) => a.status === "clarify").length },
                { key: "confirmed", label: "已确认", count: actions.filter((a) => a.status === "confirmed").length },
                { key: "in_progress", label: "进行中", count: actions.filter((a) => a.status === "in_progress").length },
                { key: "done", label: "已完成", count: actions.filter((a) => a.status === "done").length },
                { key: "cancelled", label: "已取消", count: actions.filter((a) => a.status === "cancelled").length },
                { key: "all", label: "全部", count: actions.length },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  className={`timeline-chip ${todoFilter === key ? "active" : ""}`}
                  onClick={() => setTodoFilter(key)}
                >
                  {label} {count}
                </button>
              ))}
              {onAddAction && (
                <button className="timeline-chip add-chip" onClick={() => { setIsNewTodo(true); setSelectedActionId(null); }}>
                  <Plus size={13} />新增
                </button>
              )}
            </div>
            <div className="project-todo-rows">
              {(() => {
                let list = actions;
                if (todoFilter === "open") list = list.filter(isOpenAction);
                else if (todoFilter !== "all") list = list.filter((a) => a.status === todoFilter);
                // 同步默认选中第一条
                const effectiveSelectedId = isNewTodo ? null
                  : (selectedActionId && actions.some((a) => a.id === selectedActionId)
                    ? selectedActionId
                    : list[0]?.id ?? null);
                return list.length ? list.map((action) => {
                  const level = getUrgencyLevel(action);
                  const statusLabel = getStatusLabel(action.status);
                  return (
                    <button
                      key={String(action.id)}
                      className={`project-todo-row ${effectiveSelectedId === action.id ? "selected" : ""}`}
                      onClick={() => { setSelectedActionId(action.id); setIsNewTodo(false); }}
                    >
                      <i className={`dash-todo-dot ${level}`} />
                      <div className="project-todo-text">{action.title}</div>
                      <span className="project-action-sub">{statusLabel}</span>
                    </button>
                  );
                }) : <p className="project-empty">暂无待办</p>;
              })()}
            </div>
          </div>
          <div className="project-todo-detail">
            {isNewTodo ? (
              <NewTodoPanel
                draft={newTodoDraft}
                onDraftChange={setNewTodoDraft}
                onCreate={() => {
                  if (newTodoDraft.title.trim() && onAddAction && project?.name) {
                    onAddAction(project.name);
                  }
                  setIsNewTodo(false);
                  setNewTodoDraft({ title: "", owner: "", due: "" });
                }}
                onCancel={() => {
                  setIsNewTodo(false);
                  setNewTodoDraft({ title: "", owner: "", due: "" });
                }}
              />
            ) : (() => {
              const list = todoFilter === "open" ? actions.filter(isOpenAction)
                : todoFilter === "all" ? actions
                : actions.filter((a) => a.status === todoFilter);
              const selected = actions.find((a) => a.id === selectedActionId) || list[0];
              if (!selected) return <div className="project-todo-detail-empty">暂无待办</div>;
              const events = taskEvents.filter((e) => e.actionId === String(selected.id));
              const evidenceText = stripSourceLabel(selected.source) || "暂无依据文本。";
              const sourceLabel = selected.sourceType === "current" ? "当前会议" : "历史会议";
              return (
                <ProjectTodoDetail
                  action={selected}
                  events={events}
                  onUpdate={(patch) => onUpdateAction?.(selected, patch)}
                  onStatusChange={(status) => onUpdateAction?.(selected, { status })}
                  projects={allProjects}
                  finalizedMeetings={finalizedMeetings}
                  onDelete={onDeleteAction ? () => onDeleteAction(selected.id) : undefined}
                  sourceLabel={sourceLabel}
                  evidenceText={evidenceText}
                />
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === "chat" && (
      <section className="project-chat-panel">
        <div className="project-section-head">
          <div>
            <span>项目对话</span>
            <h2>基于项目记忆、历史会议和待办提问</h2>
          </div>
          <MessageCircle size={18} />
        </div>
        <div className="project-chat-suggestions">
          {suggestedQuestions.map((question) => (
            <button key={question} onClick={() => askProject(question)} disabled={!project?.id || chatStatus === "asking"}>
              {question}
            </button>
          ))}
        </div>
        <div className="project-chat-list">
          {chatMessages.filter((m) => m.role !== "action_suggestion").length ? chatMessages.map((message, index) => {
            if (message.role === "action_suggestion") return null;
            const actionSuggestion = message.actionSuggestion
              ?? (index + 1 < chatMessages.length && chatMessages[index + 1].role === "action_suggestion"
                ? chatMessages[index + 1].actionSuggestion
                : null);
            return (
            <article className={`project-chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <strong>{message.role === "user" ? "我" : "项目 AI"}</strong>
              <p>{message.content}</p>
              {!!message.sources?.length && (
                <div className="project-chat-sources">
                  {message.sources.map((source) => <span key={source}>{source}</span>)}
                </div>
              )}
              {!!message.followUps?.length && (
                <ul className="project-chat-followups">
                  {message.followUps.map((item) => (
                    <li key={item}>
                      <button type="button" onClick={() => askProject(item)} disabled={chatStatus === "asking"}>{item}</button>
                    </li>
                  ))}
                </ul>
              )}
              {message.role === "assistant" && hasMemoryDraftContent(message.memoryUpdates) && (
                <div className="project-chat-actions">
                  <button
                    type="button"
                    onClick={() => saveChatMemoryCandidate(index, message.memoryUpdates)}
                    disabled={message.savedToMemory || memorySaveStatus === "saving"}
                  >
                    {message.savedToMemory ? "已写入项目记忆" : "写入项目记忆"}
                  </button>
                </div>
              )}
              {message.role === "assistant" && actionSuggestion && (
                <div className="project-chat-actions">
                  <button
                    type="button"
                    onClick={() => setActionDraft({
                      messageIndex: index,
                      title: actionSuggestion.title,
                      owner: actionSuggestion.owner,
                      due: actionSuggestion.due,
                      source: actionSuggestion.reason || message.content.slice(0, 120),
                    })}
                  >
                    生成待办
                  </button>
                </div>
              )}
            </article>
            );
          }) : <p className="project-empty">可以询问项目现状、风险、下次会议重点或历史结论变化。</p>}
        </div>
        {actionDraft && (
          <div className="project-chat-action-draft">
            <strong>从对话生成待办</strong>
            <label>
              标题
              <input value={actionDraft.title} onChange={(event) => setActionDraft((current) => current ? { ...current, title: event.currentTarget.value } : current)} />
            </label>
            <div className="detail-field-grid">
              <label>
                负责人
                <input value={actionDraft.owner} onChange={(event) => setActionDraft((current) => current ? { ...current, owner: event.currentTarget.value } : current)} />
              </label>
              <label>
                截止
                <input type="date" value={actionDraft.due === "待确认" ? "" : actionDraft.due} onChange={(event) => setActionDraft((current) => current ? { ...current, due: event.currentTarget.value || "待确认" } : current)} />
              </label>
            </div>
            <label>
              来源（对话摘要）
              <textarea value={actionDraft.source} rows={2} onChange={(event) => setActionDraft((current) => current ? { ...current, source: event.currentTarget.value } : current)} />
            </label>
            <div className="action-detail-actions">
              <button className="secondary-button" onClick={() => setActionDraft(null)}>取消</button>
              <button
                className="primary-button"
                disabled={!project?.id}
                onClick={async () => {
                  if (!project?.id || !actionDraft) return;
                  try {
                    await onCreateActionFromChat(project.id, actionDraft);
                    setActionDraft(null);
                  } catch {
                    /* error toast handled by onCreateActionFromChat caller */
                  }
                }}
              >
                创建待办
              </button>
            </div>
          </div>
        )}
        <form className="project-chat-form" onSubmit={(event) => { event.preventDefault(); void askProject(); }}>
          <input
            value={chatQuestion}
            onChange={(event) => setChatQuestion(event.currentTarget.value)}
            placeholder={project?.id ? "输入项目问题" : "请先选择项目"}
            disabled={!project?.id || chatStatus === "asking"}
          />
          <button className="primary-button" type="submit" disabled={!project?.id || !chatQuestion.trim() || chatStatus === "asking"}>
            <SendHorizontal size={15} />{chatStatus === "asking" ? "分析中" : "提问"}
          </button>
        </form>
      </section>
      )}

      {activeTab === "memory" && (
      <section className="project-memory-card">
        <div className="project-section-head">
          <div>
            <span>项目记忆</span>
            <h2>AI 后续会议会优先参考这些稳定上下文</h2>
          </div>
          <div className="project-memory-actions">
            <em>{memory.updatedAt ? `记忆更新于 ${formatArchiveDate(memory.updatedAt)}` : memory.latestArchive ? `临时来自 ${formatArchiveDate(memory.latestArchive.createdAt)}` : "暂无归档来源"}</em>
            {editingMemory ? (
              <>
                <button className="secondary-button" onClick={() => { setMemoryDraft(memory); setEditingMemory(false); setMemorySaveStatus("idle"); }}>取消</button>
                <button className="primary-button" onClick={saveMemoryEdits} disabled={memorySaveStatus === "saving"}>{memorySaveStatus === "saving" ? "保存中" : "保存记忆"}</button>
              </>
            ) : (
              <button className="secondary-button" onClick={() => setEditingMemory(true)}>编辑记忆</button>
            )}
          </div>
        </div>
        {editingMemory ? (
          <ProjectMemoryEditor memory={memoryDraft} onChange={updateMemoryDraft} />
        ) : (
          <>
            <div className="project-memory-summary">
              {memory.stage && <span>阶段：{memory.stage}</span>}
              <p>{memory.overview}</p>
            </div>
            <div className="project-memory-grid expanded">
              <ProjectMemoryList title="项目事实" items={memory.facts} emptyText="暂无稳定事实" />
              <ProjectMemoryList title="当前目标" items={memory.goals} emptyText="暂无当前目标" />
              <ProjectMemoryList title="当前议题" items={memory.currentTopics} emptyText="暂无沉淀议题" />
              <ProjectMemoryList title="关键决策" items={memory.decisions} emptyText="暂无明确决策" />
              <ProjectMemoryList title="开放风险" items={memory.risks} emptyText="暂无开放风险" />
              <ProjectMemoryList title="待澄清问题" items={memory.openQuestions} emptyText="暂无待澄清问题" />
              <ProjectMemoryList title="结论变更" items={memory.changes} emptyText="暂无结论变更" />
              <ProjectMemoryList title="待办状态" items={openActions.slice(0, 5).map((action) => `${action.title} / ${action.owner || "待确认"} / ${action.due || "待确认"} / ${getStatusLabel(action.status)}`)} emptyText="暂无未关闭待办" />
            </div>
          </>
        )}
        {memorySaveStatus === "error" && <p className="modal-error">项目记忆保存失败，请稍后重试。</p>}
      </section>
      )}
    </section>
  );
}

function ProjectMemoryList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? <ul>{items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : <p>{emptyText}</p>}
    </section>
  );
}

function ProjectMemoryEditor({ memory, onChange }: { memory: ProjectMemory; onChange: (patch: Partial<ProjectMemory>) => void }) {
  return (
    <div className="project-memory-editor">
      <label>
        项目阶段
        <input value={memory.stage || ""} onChange={(event) => onChange({ stage: event.currentTarget.value })} placeholder="例如：试点准备" />
      </label>
      <label className="wide">
        项目概览
        <textarea value={memory.overview} onChange={(event) => onChange({ overview: event.currentTarget.value })} rows={3} />
      </label>
      <ProjectMemoryTextarea title="项目事实" value={memory.facts} onChange={(items) => onChange({ facts: items })} />
      <ProjectMemoryTextarea title="当前目标" value={memory.goals} onChange={(items) => onChange({ goals: items })} />
      <ProjectMemoryTextarea title="当前议题" value={memory.currentTopics} onChange={(items) => onChange({ currentTopics: items })} />
      <ProjectMemoryTextarea title="关键决策" value={memory.decisions} onChange={(items) => onChange({ decisions: items })} />
      <ProjectMemoryTextarea title="开放风险" value={memory.risks} onChange={(items) => onChange({ risks: items })} />
      <ProjectMemoryTextarea title="待澄清问题" value={memory.openQuestions} onChange={(items) => onChange({ openQuestions: items })} />
      <ProjectMemoryTextarea title="结论变更" value={memory.changes} onChange={(items) => onChange({ changes: items })} />
    </div>
  );
}

function ProjectMemoryTextarea({ title, value, onChange }: { title: string; value: string[]; onChange: (items: string[]) => void }) {
  return (
    <label>
      {title}
      <textarea value={value.join("\n")} onChange={(event) => onChange(splitMemoryLines(event.currentTarget.value))} rows={5} placeholder="一行一条" />
    </label>
  );
}

function ProjectTodoDetail({
  action,
  events,
  onUpdate,
  onStatusChange,
  projects,
  finalizedMeetings,
  onDelete,
  sourceLabel,
  evidenceText,
}: {
  action: ActionBacklogItem;
  events: TaskEvent[];
  onUpdate: (patch: Partial<ActionItem> & { meetingId?: number; meetingTitle?: string; projectName?: string }) => void;
  onStatusChange: (status: ActionStatus) => void;
  projects: { id?: number; name: string }[];
  finalizedMeetings: { meetingId: number; title: string; projectName: string }[];
  onDelete?: () => void;
  sourceLabel: string;
  evidenceText: string;
}) {
  const [draft, setDraft] = React.useState({
    title: action.title,
    owner: action.owner,
    due: action.due,
  });

  React.useEffect(() => {
    setDraft({ title: action.title, owner: action.owner, due: action.due });
  }, [action.id]);

  const titleRef = React.useRef<HTMLTextAreaElement>(null);

  // 选中或切换待办时自动调整 textarea 高度
  React.useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [action.id, draft.title]);

  function updateDraft(field: "title" | "owner" | "due", value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function commitDraft() {
    const patch: Partial<ActionItem> = {};
    if (draft.title !== action.title) patch.title = draft.title;
    if (draft.owner !== action.owner) patch.owner = draft.owner;
    if (draft.due !== action.due) patch.due = draft.due;
    if (Object.keys(patch).length) onUpdate(patch);
  }

  function commitOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
  }

  return (
    <aside className="action-detail-panel" aria-label="待办详情">
      <div className="action-detail-head">
        <div>
          <span>任务档案</span>
          <strong>{draft.title || "未命名待办"}</strong>
        </div>
        <div className="action-detail-head-actions">
          <span className={`status-tag ${action.status}`}>{getStatusLabel(action.status)}</span>
          {onDelete && (
            <button className="icon-button" title="删除待办" onClick={() => { if (confirm("确定删除此待办？删除后可在回收站恢复。")) onDelete(); }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="action-detail-metadata" aria-label="任务摘要">
        <span>{sourceLabel}</span>
        <span>置信度 {action.confidence}%</span>
        <span>{action.owner || "待确认负责人"}</span>
      </div>

      <section className="action-detail-section">
        <div className="action-detail-section-title">
          <h3>任务信息</h3>
          <span>可直接编辑</span>
        </div>

        <label>
          标题
          <textarea
            ref={titleRef}
            className="todo-title-textarea"
            value={draft.title}
            onChange={(event) => {
              updateDraft("title", event.currentTarget.value);
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            onBlur={commitDraft}
            rows={1}
          />
        </label>

        <div className="detail-field-grid">
          <label>
            负责人
            <input
              value={draft.owner}
              onChange={(event) => updateDraft("owner", event.currentTarget.value)}
              onBlur={commitDraft}
              onKeyDown={commitOnEnter}
            />
          </label>
          <label>
            截止
            <input
              type="date"
              value={getDateInputValue(draft.due)}
              onChange={(event) => updateDraft("due", getDueFromDateInput(event.currentTarget.value))}
              onBlur={commitDraft}
              onKeyDown={commitOnEnter}
            />
          </label>
        </div>

        <label>
          状态
          <select value={action.status} onChange={(event) => onStatusChange(event.currentTarget.value as ActionStatus)}>
            <option value="candidate">候选</option>
            <option value="clarify">待澄清</option>
            <option value="confirmed">已确认</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
      </section>

      <section className="action-detail-section">
        <div className="action-detail-section-title">
          <h3>所属项目与会议</h3>
          <span>项目不可更改</span>
        </div>
        <div className="detail-field-grid">
          <label>
            项目
            <select
              value={action.projectName}
              disabled
              className="disabled-select"
            >
              {projects.map((p) => <option value={p.name} key={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label>
            关联会议
            <select
              value={action.meetingId ?? ""}
              onChange={(event) => {
                const mid = event.currentTarget.value ? Number(event.currentTarget.value) : undefined;
                const found = mid ? finalizedMeetings.find((f) => f.meetingId === mid) : undefined;
                onUpdate({ meetingId: mid, meetingTitle: found?.title ?? "", projectName: found?.projectName ?? action.projectName });
              }}
            >
              <option value="">不关联会议</option>
              {finalizedMeetings.filter((f) => f.projectName === action.projectName).map((m) => (
                <option value={m.meetingId} key={m.meetingId}>{m.title}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="action-detail-section evidence">
        <div className="action-detail-section-title">
          <h3>依据文本</h3>
          <span>来自转写或归档快照</span>
        </div>
        <blockquote>{evidenceText}</blockquote>
      </section>

      <section className="action-detail-section">
        <div className="action-detail-section-title">
          <h3>变更记录</h3>
          <span>{events.length} 条</span>
        </div>
        {events.length ? (
          <div className="task-event-list">
            {events.map((event) => (
              <div key={event.id}>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
                <span>{formatArchiveDate(event.at)}</span>
              </div>
            ))}
          </div>
        ) : <p>暂无变更记录。</p>}
      </section>
    </aside>
  );
}

function NewTodoPanel({
  draft,
  onDraftChange,
  onCreate,
  onCancel,
}: {
  draft: { title: string; owner: string; due: string };
  onDraftChange: (draft: { title: string; owner: string; due: string }) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const titleRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [draft.title]);

  return (
    <aside className="action-detail-panel" aria-label="新增待办">
      <div className="action-detail-head">
        <div>
          <span>新增待办</span>
          <strong>{draft.title || "新待办"}</strong>
        </div>
      </div>

      <div className="action-detail-metadata">
        <span>手动新增</span>
        <span>置信度 72%</span>
      </div>

      <section className="action-detail-section">
        <div className="action-detail-section-title">
          <h3>任务信息</h3>
          <span>填完点下方新增</span>
        </div>

        <label>
          标题
          <textarea
            ref={titleRef}
            className="todo-title-textarea"
            value={draft.title}
            onChange={(event) => {
              onDraftChange({ ...draft, title: event.currentTarget.value });
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            rows={1}
            placeholder="待办标题"
            autoFocus
          />
        </label>

        <div className="detail-field-grid">
          <label>
            负责人
            <input
              value={draft.owner}
              onChange={(event) => onDraftChange({ ...draft, owner: event.currentTarget.value })}
              placeholder="待确认"
            />
          </label>
          <label>
            截止
            <input
              type="date"
              value={getDateInputValue(draft.due)}
              onChange={(event) => onDraftChange({ ...draft, due: getDueFromDateInput(event.currentTarget.value) })}
            />
          </label>
        </div>
      </section>

      <div className="glossary-detail-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
        <button className="primary-button" type="button" disabled={!draft.title.trim()} onClick={onCreate}>
          <Plus size={15} />新增待办
        </button>
      </div>
    </aside>
  );
}
