import { Plus } from "lucide-react";
import type { ActionItem } from "../../types";
import {
  getDateInputValue,
  getDueFromDateInput,
  getSourceLabel,
  getStatusLabel,
  stripSourceLabel,
} from "../../lib/actions";

export function ActionItemsTab({
  actions,
  editingId,
  onEdit,
  onCloseEdit,
  onUpdate,
  onDelete,
  onAdd,
}: {
  actions: ActionItem[];
  editingId: number | null;
  onEdit: (id: number) => void;
  onCloseEdit: () => void;
  onUpdate: (id: number, patch: Partial<ActionItem>) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}) {
  const visibleActions = actions.filter((action) => action.status !== "cancelled");
  const candidateCount = visibleActions.filter((a) => a.status === "candidate").length;
  const clarifyCount = visibleActions.filter((a) => a.status === "clarify").length;
  const confirmedCount = visibleActions.filter((a) => a.status === "confirmed").length;
  const inProgressCount = visibleActions.filter((a) => a.status === "in_progress").length;
  const doneCount = visibleActions.filter((a) => a.status === "done").length;

  return (
    <div className="action-items-tab">
      <div className="action-items-header">
        <div className="action-items-stats">
          <span className="stat-item"><strong>{candidateCount}</strong> 候选</span>
          <span className="stat-item"><strong>{clarifyCount}</strong> 待澄清</span>
          <span className="stat-item"><strong>{confirmedCount}</strong> 已确认</span>
          <span className="stat-item"><strong>{inProgressCount}</strong> 进行中</span>
          <span className="stat-item"><strong>{doneCount}</strong> 已完成</span>
        </div>
        <button className="primary-button" onClick={onAdd}><Plus size={15} />新增行动项</button>
      </div>

      {visibleActions.length === 0 ? (
        <div className="action-items-empty">
          <div className="empty-icon"><Plus size={28} /></div>
          <h2>暂无候选行动项</h2>
          <p>会议进行中，AI 会自动识别候选行动项，也可以手动新增。</p>
        </div>
      ) : (
        <div className="action-items-list">
          {visibleActions.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              editing={editingId === action.id}
              onEdit={() => onEdit(action.id)}
              onCloseEdit={onCloseEdit}
              onUpdate={(patch) => onUpdate(action.id, patch)}
              onDelete={() => onDelete(action.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionRow({
  action,
  editing,
  onEdit,
  onCloseEdit,
  onUpdate,
  onDelete,
}: {
  action: ActionItem;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onUpdate: (patch: Partial<ActionItem>) => void;
  onDelete: () => void;
}) {
  const statusLabel = getStatusLabel(action.status);
  const sourceText = stripSourceLabel(action.source);

  if (editing) {
    return (
      <article className="action-row editing">
        <div className="action-row-body">
          <label className="edit-field">
            <span>待办</span>
            <input value={action.title} onChange={(e) => onUpdate({ title: e.target.value })} autoFocus />
          </label>
          <div className="edit-row-grid">
            <label className="edit-field">
              <span>负责人</span>
              <input value={action.owner} onChange={(e) => onUpdate({ owner: e.target.value })} />
            </label>
            <label className="edit-field">
              <span>截止</span>
              <input
                type="date"
                value={getDateInputValue(action.due)}
                onChange={(e) => onUpdate({ due: getDueFromDateInput(e.currentTarget.value) })}
              />
            </label>
          </div>
          <div className="action-row-actions">
            <button className="secondary-button" onClick={onCloseEdit}>完成编辑</button>
            <button className="primary-button" onClick={() => { onUpdate({ status: "confirmed" }); onCloseEdit(); }}>确认待办</button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`action-row ${action.status === "confirmed" ? "confirmed" : ""} ${action.status}`}>
      <div className="action-row-left">
        <div className="action-confidence">{action.confidence}%</div>
        <div className="action-status-label">{statusLabel}</div>
      </div>
      <div className="action-row-body">
        <h3 className="action-row-title">{action.title}</h3>
        <div className="action-row-info">
          <span>{action.owner || "待确认"}</span>
          <span className="info-sep"></span>
          <span>{action.due || "待确认"}</span>
          <span className="info-sep"></span>
          <span>{getSourceLabel(action.source)}</span>
        </div>
        {sourceText && (
          <div className="action-quote-line">
            <span className="quote-who">{action.owner}</span> {sourceText}
          </div>
        )}
        <div className="action-row-actions">
          <button className="act-btn" onClick={onEdit}>编辑</button>
          {action.status !== "confirmed" && (
            <button className="act-btn primary" onClick={() => onUpdate({ status: "confirmed" })}>确认</button>
          )}
          {action.status === "confirmed" && (
            <button className="act-btn" onClick={() => onUpdate({ status: "in_progress" })}>开始执行</button>
          )}
          <button className="act-btn danger" onClick={() => { if (confirm("确定删除此行动项？")) onDelete(); }}>删除</button>
        </div>
      </div>
    </article>
  );
}
