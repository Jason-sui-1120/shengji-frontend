import { FileText, CalendarClock, Clock3, AlertTriangle, History, ExternalLink } from "lucide-react";
import type { HistoryBlockData, HistoryContextSummary } from "../../types";

export function HistoryContextTab({
  context,
  blocks,
  onOpenProjectMemory,
  onOpenActions,
}: {
  context: HistoryContextSummary | null;
  blocks: HistoryBlockData[];
  onOpenProjectMemory?: (projectName: string) => void;
  onOpenActions?: (projectName: string) => void;
}) {
  const icons = [
    <FileText size={18} />,
    <CalendarClock size={18} />,
    <Clock3 size={18} />,
    <AlertTriangle size={18} />,
  ];

  return (
    <div className="history-context-tab">
      {context && (
        <div className="history-context-header">
          <div className="hc-header-icon">
            <History size={20} />
          </div>
          <div className="hc-header-info">
            <div className="hc-header-title">{context.title}</div>
            <div className="hc-header-sub">
              {context.dateLabel} · {context.projectName}
              {context.topicCount > 0 && ` · ${context.topicCount} 个议题`}
            </div>
            {context.overview && <p className="hc-header-overview">{context.overview}</p>}
          </div>
          {onOpenProjectMemory && context && (
            <button className="hc-header-link" onClick={() => onOpenProjectMemory(context.projectName)}>
              <ExternalLink size={14} />查看项目记忆
            </button>
          )}
        </div>
      )}
      {!context && (
        <div className="history-context-header empty">
          <div className="hc-header-icon">
            <History size={20} />
          </div>
          <div className="hc-header-info">
            <div className="hc-header-title">暂无历史上下文</div>
            <div className="hc-header-sub">当前项目还没有历史归档可参考</div>
          </div>
        </div>
      )}

      <div className="history-context-grid">
        {blocks.length > 0 ? (
          blocks.map((block, index) => (
            <article className="history-context-card" key={`${block.title}-${index}`}>
              <div className="history-context-card-head">
                <div className="hc-card-icon">
                  {icons[index % icons.length] ?? <FileText size={16} />}
                </div>
                <span className="hc-card-title">{block.title}</span>
                <span className="hc-card-badge">{block.meta}</span>
              </div>
              <div className="history-context-card-body">
                {block.items.length > 0 ? (
                  <ul className="hc-list">
                    {block.items.map((item, idx) => (
                      <li key={`${block.title}-${idx}`}>
                        <span className="hc-list-dot">·</span>
                        <span className="hc-list-text">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="hc-list-empty">暂无</div>
                )}
              </div>
              {block.link && (
                <div className="history-context-card-foot">
                  <button
                    className="hc-card-link"
                    onClick={() => {
                      const title = block.title;
                      if (title.includes("待办") || title.includes("未完成")) {
                        onOpenActions?.(context?.projectName ?? "");
                      } else {
                        onOpenProjectMemory?.(context?.projectName ?? "");
                      }
                    }}
                  >
                    <ExternalLink size={12} />{block.link}
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="history-context-empty">
            <div className="empty-icon"><FileText size={28} /></div>
            <h2>暂无历史数据</h2>
            <p>会议结束后归档，下次会议会自动载入历史上下文。</p>
          </div>
        )}
      </div>
    </div>
  );
}
