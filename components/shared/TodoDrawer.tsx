import { Check, X, ChevronRight, ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import type { ActionBacklogItem, ActionStatus } from "../../types";
import { isOpenAction, getUrgencyLevel, type UrgencyLevel } from "../../lib/actions";

export function TodoDrawer({
  open,
  onClose,
  actionBacklog,
  onUpdateAction,
  onJumpToSource,
}: {
  open: boolean;
  onClose: () => void;
  actionBacklog: ActionBacklogItem[];
  onUpdateAction?: (action: ActionBacklogItem, patch: { status?: ActionStatus; due?: string }) => void;
  onJumpToSource?: (action: ActionBacklogItem) => void;
}) {
  const [filter, setFilter] = useState<"all" | "urgent" | "week" | "done">("all");

  const openActions = actionBacklog.filter(isOpenAction);
  const doneActions = actionBacklog.filter((a) => a.status === "done" || a.status === "cancelled");

  const urgentCount = openActions.filter((a) => {
    const level = getUrgencyLevel(a);
    return level === "overdue" || level === "urgent";
  }).length;

  // 本周到期 = 7天内
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekCount = openActions.filter((a) => {
    const due = a.due?.trim();
    if (!due || due === "待确认") return false;
    const d = new Date(due);
    return !isNaN(d.getTime()) && d <= weekLater && d >= now;
  }).length;

  const visibleActions = useMemo(() => {
    let list = filter === "done" ? doneActions : openActions;
    if (filter === "urgent") {
      list = list.filter((a) => {
        const level = getUrgencyLevel(a);
        return level === "overdue" || level === "urgent";
      });
    } else if (filter === "week") {
      list = list.filter((a) => {
        const due = a.due?.trim();
        if (!due || due === "待确认") return false;
        const d = new Date(due);
        return !isNaN(d.getTime()) && d <= weekLater && d >= now;
      });
    }
    return list;
  }, [filter, openActions, doneActions, weekLater, now]);

  return (
    <>
      <div
        className={`drawer-overlay ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`todo-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="全局待办"
      >
        <div className="todo-drawer-head">
          <div className="todo-drawer-title">全局待办</div>
          <button className="todo-drawer-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="todo-drawer-filter">
          <button className={`todo-drawer-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            全部 {openActions.length}
          </button>
          <button className={`todo-drawer-chip ${filter === "urgent" ? "active" : ""}`} onClick={() => setFilter("urgent")}>
            紧急 {urgentCount}
          </button>
          <button className={`todo-drawer-chip ${filter === "week" ? "active" : ""}`} onClick={() => setFilter("week")}>
            本周 {weekCount}
          </button>
          <button className={`todo-drawer-chip ${filter === "done" ? "active" : ""}`} onClick={() => setFilter("done")}>
            已完成 {doneActions.length}
          </button>
        </div>

        <div className="todo-drawer-body">
          {visibleActions.length > 0 ? (
            visibleActions.map((action) => (
              <DrawerTodoItem
                key={action.id}
                action={action}
                onUpdate={onUpdateAction}
                onJumpToSource={onJumpToSource}
              />
            ))
          ) : (
            <div className="todo-drawer-empty">
              {filter === "done" ? "暂无已完成待办" : "暂无待办"}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function DrawerTodoItem({
  action,
  onUpdate,
  onJumpToSource,
}: {
  action: ActionBacklogItem;
  onUpdate?: (action: ActionBacklogItem, patch: { status?: ActionStatus; due?: string }) => void;
  onJumpToSource?: (action: ActionBacklogItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const level = getUrgencyLevel(action);
  const dueDisplay = action.due === "待确认" ? "待确认" : action.due;
  const statusLabel = getStatusShortLabel(action.status);

  return (
    <div className={`todo-drawer-item ${expanded ? "expanded" : ""}`}>
      <button className="todo-drawer-row" onClick={() => setExpanded(!expanded)}>
        <i className={`todo-drawer-dot ${level}`} />
        <div className="todo-drawer-main">
          <div className="todo-drawer-text">{action.title}</div>
          <div className="todo-drawer-sub">
            {action.projectName} · {statusLabel}
          </div>
        </div>
        <ChevronRight size={14} className="todo-drawer-chevron" />
      </button>
      {expanded && (
        <div className="todo-drawer-quick">
          {onUpdate && (
            <>
              <button
                className="todo-drawer-quick-btn primary"
                onClick={() => onUpdate(action, { status: "done" })}
              >
                <Check size={13} /> 完成
              </button>
              <div className="todo-drawer-status">
                {(["clarify", "confirmed", "in_progress"] as ActionStatus[]).map((s) => (
                  <button
                    key={s}
                    className={`todo-drawer-chip-sm ${action.status === s ? "active" : ""}`}
                    onClick={() => onUpdate(action, { status: s })}
                  >
                    {getStatusShortLabel(s)}
                  </button>
                ))}
              </div>
            </>
          )}
          {onJumpToSource && (
            <button className="todo-drawer-link" onClick={() => onJumpToSource(action)}>
              <ExternalLink size={11} /> 来源
            </button>
          )}
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
