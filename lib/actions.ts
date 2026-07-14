import type { ActionStatus } from "../types";

export function getStatusLabel(status: ActionStatus) {
  return {
    candidate: "候选",
    clarify: "待澄清",
    confirmed: "已确认",
    in_progress: "进行中",
    done: "已完成",
    cancelled: "已取消",
  }[status];
}

export function parseStatusLabel(label: string): ActionStatus {
  if (label.includes("已完成") || label.includes("done")) return "done";
  if (label.includes("进行中") || label.includes("in_progress")) return "in_progress";
  if (label.includes("已确认") || label.includes("confirmed")) return "confirmed";
  if (label.includes("候选") || label.includes("candidate")) return "candidate";
  return "clarify";
}

export function isOpenAction(action: { status: ActionStatus | string }) {
  return ["candidate", "clarify", "confirmed", "in_progress"].includes(action.status);
}

export type UrgencyLevel = "overdue" | "urgent" | "normal" | "done";

/** 基于截止日期计算紧急度：已逾期=overdue，今明两天=urgent，一周内=normal，其他=normal */
export function getUrgencyLevel(action: { due: string; status: ActionStatus | string }): UrgencyLevel {
  if (action.status === "done" || action.status === "cancelled") return "done";
  const due = action.due?.trim();
  if (!due || due === "待确认") return "normal";
  // 尝试解析日期
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due);
  if (isNaN(dueDate.getTime())) return "normal";
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 1) return "urgent";
  return "normal";
}

export function getUrgencyLabel(level: UrgencyLevel): string {
  switch (level) {
    case "overdue": return "逾期";
    case "urgent": return "紧急";
    case "normal": return "普通";
    case "done": return "已完成";
  }
}

export function getSourceKind(source: string) {
  if (source.startsWith("历史关闭")) return "closed";
  if (source.startsWith("历史更新")) return "updated";
  if (source.startsWith("历史延续")) return "continued";
  return "new";
}

export function getExplicitSourceKind(source: string) {
  if (source.startsWith("本次新增")) return "new";
  if (source.startsWith("历史关闭")) return "closed";
  if (source.startsWith("历史更新")) return "updated";
  if (source.startsWith("历史延续")) return "continued";
  return null;
}

export function getSourceLabel(source: string) {
  if (source.startsWith("历史关闭")) return "历史关闭";
  if (source.startsWith("历史更新")) return "历史更新";
  if (source.startsWith("历史延续")) return "历史延续";
  return "本次新增";
}

export function stripSourceLabel(source: string) {
  return source.replace(/^(历史关闭|历史更新|历史延续|本次新增)[：:]\s*/, "");
}

export function getDateInputValue(value: string) {
  const normalized = normalizeDueDate(value);
  return normalized ?? "";
}

export function getDueFromDateInput(value: string) {
  return value || "待确认";
}

export function getDueHint(value: string) {
  if (!value || value === "待确认" || value === "待定") return "未选择日期时为待确认";
  if (normalizeDueDate(value)) return "已选择标准日期";
  return `当前识别：${value}，请选择明确日期`;
}

function normalizeDueDate(value: string) {
  const text = (value || "").trim();
  if (!text || text === "待确认" || text === "待定") return null;
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return buildDateValue(isoMatch[1], isoMatch[2], isoMatch[3]);
  const slashMatch = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (slashMatch) return buildDateValue(slashMatch[1], slashMatch[2], slashMatch[3]);
  const chineseMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (chineseMatch) return buildDateValue(String(new Date().getFullYear()), chineseMatch[1], chineseMatch[2]);
  return null;
}

function buildDateValue(year: string, month: string, day: string) {
  const yyyy = Number(year);
  const mm = Number(month);
  const dd = Number(day);
  if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function getTaskEventLabel(patch: { status?: string; owner?: string; due?: string; title?: string }) {
  if (patch.status) return "状态更新";
  if (patch.owner) return "负责人更新";
  if (patch.due) return "截止时间更新";
  if (patch.title) return "标题更新";
  return "待办更新";
}

export function getTaskEventDetail(
  action: { title: string; owner: string; due: string; status: ActionStatus },
  patch: { status?: ActionStatus; owner?: string; due?: string; title?: string },
) {
  if (patch.status) return `${action.title}：${getStatusLabel(action.status)} → ${getStatusLabel(patch.status)}`;
  if (patch.owner) return `${action.title}：负责人 ${action.owner || "待确认"} → ${patch.owner}`;
  if (patch.due) return `${action.title}：截止 ${action.due || "待确认"} → ${patch.due}`;
  if (patch.title) return `${action.title} → ${patch.title}`;
  return action.title;
}
