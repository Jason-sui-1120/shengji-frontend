import type { FinishCheck } from "../../types";

export function FinishChecklist({ checks }: { checks: FinishCheck[] }) {
  return (
    <div className="finish-checklist">
      <p>生成最终纪要前，先确认本场会议资料是否完整。检查通过后会生成可编辑草稿，确认后再归档。</p>
      <div>
        {checks.map((check) => (
          <article className={`finish-check ${check.tone}`} key={check.label}>
            <span>{check.label}</span>
            <strong>{check.value}</strong>
            <p>{check.detail}</p>
            {check.actionLabel && check.action && (
              <button className="secondary-button" onClick={check.action} disabled={check.actionDisabled}>
                {check.actionLabel}
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
