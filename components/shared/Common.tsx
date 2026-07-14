import React from "react";

export function NavItem({
  icon,
  label,
  active,
  badge,
  liveLabel,
  liveTone = "live",
  onClick,
  actionIcon,
  onAction,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
  liveLabel?: string;
  liveTone?: "live" | "reconnecting" | "error";
  onClick?: () => void;
  actionIcon?: React.ReactNode;
  onAction?: (e: React.MouseEvent) => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""} ${liveLabel ? `is-${liveTone}` : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {liveLabel ? <em className={`nav-live-badge ${liveTone}`}><i />{liveLabel}</em> : badge && <em>{badge}</em>}
      {actionIcon && onAction && (
        <i
          className="nav-action-icon"
          onClick={(e) => { e.stopPropagation(); onAction(e); }}
        >
          {actionIcon}
        </i>
      )}
    </button>
  );
}

export function StatusChip({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" | "blue" | "neutral" }) {
  return (
    <div className={`status-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
