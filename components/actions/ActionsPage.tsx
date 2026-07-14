import React from "react";
import { ListChecks, Plus, Trash2, Mic } from "lucide-react";
import type {
  ActionBacklogItem,
  ActionItem,
  ActionStatus,
  Project,
  TaskEvent,
} from "../../types";
import {
  isOpenAction,
  getStatusLabel,
  stripSourceLabel,
  getUrgencyLevel,
  getDateInputValue,
  getDueFromDateInput,
} from "../../lib/actions";
import { formatArchiveDate } from "../../lib/date";

export function ActionsPage({
  actions,
  taskEvents,
  projectFilter,
  onProjectFilterChange,
  onAdd,
  onUpdate,
  onOpenMeeting,
  projects,
  finalizedMeetings,
  onDeleteAction,
}: {
  actions: ActionBacklogItem[];
  taskEvents: TaskEvent[];
  projectFilter: string;
  onProjectFilterChange: (projectName: string) => void;
  onAdd: (projectName?: string, meetingId?: number) => void;
  onUpdate: (action: ActionBacklogItem, patch: Partial<ActionItem> & { meetingId?: number; meetingTitle?: string; projectName?: string }) => void;
  onOpenMeeting: () => void;
  projects: Project[];
  finalizedMeetings: { meetingId: number; title: string; projectName: string }[];
  onDeleteAction?: (actionId: number | string) => void;
}) {
  const [filter, setFilter] = React.useState<"open" | "candidate" | "clarify" | "confirmed" | "in_progress" | "done" | "cancelled" | "all">("open");
  const [selectedActionId, setSelectedActionId] = React.useState<string | number | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState({
    title: "",
    owner: "",
    due: "",
  });

  const projectOptions = Array.from(new Set([...projects.map((p) => p.name), ...actions.map((a) => a.projectName)])).filter(Boolean);

  const scopedActions = actions.filter((a) => projectFilter === "all" || a.projectName === projectFilter);

  const visibleActions = scopedActions.filter((a) => {
    if (filter === "all") return true;
    if (filter === "open") return isOpenAction(a);
    return a.status === filter;
  });

  const counts = {
    open: scopedActions.filter(isOpenAction).length,
    candidate: scopedActions.filter((a) => a.status === "candidate").length,
    clarify: scopedActions.filter((a) => a.status === "clarify").length,
    confirmed: scopedActions.filter((a) => a.status === "confirmed").length,
    in_progress: scopedActions.filter((a) => a.status === "in_progress").length,
    done: scopedActions.filter((a) => a.status === "done").length,
    cancelled: scopedActions.filter((a) => a.status === "cancelled").length,
    all: scopedActions.length,
  };

  // 清除不存在的选中
  React.useEffect(() => {
    if (selectedActionId && !actions.some((a) => a.id === selectedActionId)) {
      setSelectedActionId(null);
    }
  }, [actions, selectedActionId]);

  function updateActionStatus(action: ActionBacklogItem, status: ActionStatus) {
    onUpdate(action, { status });
  }

  function startNew() {
    setIsNew(true);
    setSelectedActionId(null);
    setNewDraft({ title: "", owner: "", due: "" });
  }

  function cancelNew() {
    setIsNew(false);
    setNewDraft({ title: "", owner: "", due: "" });
    if (visibleActions.length > 0) {
      setSelectedActionId(visibleActions[0].id);
    }
  }

  function createNew() {
    const title = newDraft.title.trim();
    if (!title) return;
    onAdd(projectFilter !== "all" ? projectFilter : undefined);
    setIsNew(false);
    setNewDraft({ title: "", owner: "", due: "" });
  }

  const selectedAction = actions.find((a) => a.id === selectedActionId) || visibleActions[0] || null;

  const tabs = [
    { key: "open", label: "待处理", count: counts.open },
    { key: "candidate", label: "候选", count: counts.candidate },
    { key: "clarify", label: "待澄清", count: counts.clarify },
    { key: "confirmed", label: "已确认", count: counts.confirmed },
    { key: "in_progress", label: "进行中", count: counts.in_progress },
    { key: "done", label: "已完成", count: counts.done },
    { key: "cancelled", label: "已取消", count: counts.cancelled },
    { key: "all", label: "全部", count: counts.all },
  ] as const;

  return (
    <section className="history-page">
      <div className="history-page-head">
        <div>
          <h1 className="timeline-page-title">待办</h1>
          <div className="timeline-page-sub">{visibleActions.length} 项 · {projectFilter === "all" ? "全部项目" : projectFilter}</div>
        </div>
        <div className="history-page-actions">
          <button className="secondary-button" onClick={onOpenMeeting}><Mic size={15} />回到会议</button>
          <button className="primary-button" onClick={startNew}><Plus size={15} />新增待办</button>
        </div>
      </div>

      {/* 项目筛选 chip */}
      <div className="timeline-filter">
        <button
          className={`timeline-chip ${projectFilter === "all" ? "active" : ""}`}
          onClick={() => onProjectFilterChange("all")}
        >
          全部项目
        </button>
        {projectOptions.map((name) => (
          <button
            key={name}
            className={`timeline-chip ${projectFilter === name ? "active" : ""}`}
            onClick={() => onProjectFilterChange(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* 状态筛选 chip */}
      <div className="timeline-filter">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            className={`timeline-chip ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label} {count}
          </button>
        ))}
      </div>

      <div className="project-todo-layout">
        <div className="project-todo-list-panel">
          <div className="project-todo-rows">
            {visibleActions.length ? visibleActions.map((action) => {
              const level = getUrgencyLevel(action);
              const statusLabel = getStatusLabel(action.status);
              const isSelected = !isNew && ((selectedActionId !== null && actions.some((a) => a.id === selectedActionId))
                ? selectedActionId === action.id
                : visibleActions[0]?.id === action.id);
              return (
                <button
                  key={String(action.id)}
                  className={`project-todo-row ${isSelected ? "selected" : ""}`}
                  onClick={() => { setSelectedActionId(action.id); setIsNew(false); }}
                >
                  <i className={`dash-todo-dot ${level}`} />
                  <div className="project-todo-text">{action.title}</div>
                  <span className="project-action-sub">{statusLabel}</span>
                </button>
              );
            }) : <p className="project-empty">暂无待办</p>}
          </div>
        </div>
        <div className="project-todo-detail">
          {isNew ? (
            <NewActionPanel
              draft={newDraft}
              onDraftChange={setNewDraft}
              onCreate={createNew}
              onCancel={cancelNew}
            />
          ) : selectedAction ? (
            <ActionDetailPanel
              action={selectedAction}
              events={taskEvents.filter((e) => e.actionId === String(selectedAction.id))}
              onUpdate={(patch) => onUpdate(selectedAction, patch)}
              onStatusChange={(status) => updateActionStatus(selectedAction, status)}
              projects={projects}
              finalizedMeetings={finalizedMeetings}
              onDelete={onDeleteAction ? () => onDeleteAction(selectedAction.id) : undefined}
            />
          ) : (
            <div className="project-todo-detail-empty">暂无待办</div>
          )}
        </div>
      </div>
    </section>
  );
}

function NewActionPanel({
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

function ActionDetailPanel({
  action,
  events,
  onUpdate,
  onStatusChange,
  projects,
  finalizedMeetings,
  onDelete,
}: {
  action: ActionBacklogItem;
  events: TaskEvent[];
  onUpdate: (patch: Partial<ActionItem> & { meetingId?: number; meetingTitle?: string; projectName?: string }) => void;
  onStatusChange: (status: ActionStatus) => void;
  projects: { id?: number; name: string }[];
  finalizedMeetings: { meetingId: number; title: string; projectName: string }[];
  onDelete?: () => void;
}) {
  const evidenceText = stripSourceLabel(action.source) || "暂无依据文本。";
  const sourceLabel = action.sourceType === "current" ? "当前会议" : "历史会议";
  const [draft, setDraft] = React.useState({
    title: action.title,
    owner: action.owner,
    due: action.due,
  });

  React.useEffect(() => {
    setDraft({ title: action.title, owner: action.owner, due: action.due });
  }, [action.id]);

  const titleRef = React.useRef<HTMLTextAreaElement>(null);

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
          <span>编辑后自动保存</span>
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
          <span>可切换归属</span>
        </div>
        <div className="detail-field-grid">
          <label>
            项目
            <select
              value={action.projectName}
              onChange={(event) => {
                const newProject = event.currentTarget.value;
                const firstMeeting = finalizedMeetings.find((f) => f.projectName === newProject);
                onUpdate({ projectName: newProject, meetingId: firstMeeting?.meetingId ?? action.meetingId, meetingTitle: firstMeeting?.title ?? "" });
              }}
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
