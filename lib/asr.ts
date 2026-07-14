import type { LiveAsrStatus } from "../types";

export function isLiveAsrSessionActive(status: LiveAsrStatus) {
  return status === "connecting" || status === "recording" || status === "reconnecting";
}

export function getLiveAsrStatusLabel(status: LiveAsrStatus) {
  if (status === "connecting") return "连接中";
  if (status === "recording") return "录音中";
  if (status === "reconnecting") return "重连中";
  if (status === "error") return "异常";
  if (status === "stopping") return "停止中";
  return "未录音";
}

export function getLiveAsrStatusTone(status: LiveAsrStatus): "live" | "reconnecting" | "error" {
  if (status === "reconnecting" || status === "connecting") return "reconnecting";
  if (status === "error") return "error";
  return "live";
}

export function getWebSocketCloseReason(code: number) {
  if (code === 1000) return "正常关闭";
  if (code === 1001) return "页面或服务离开";
  if (code === 1006) return "连接异常关闭";
  if (code === 1011) return "服务内部错误";
  if (code === 1012) return "服务重启";
  if (code === 1013) return "服务过载或稍后重试";
  return "未知断开原因";
}

export function isPermissionError(error: unknown) {
  return error instanceof DOMException && ["NotAllowedError", "SecurityError", "NotFoundError"].includes(error.name);
}

export function getDisplayDraft(buffered: string, partial: string) {
  const base = buffered.trim();
  const next = partial.trim();
  if (!base) return next;
  if (!next) return base;
  if (base.endsWith(next)) return base;
  if (next.startsWith(base)) return next;

  const maxOverlap = Math.min(base.length, next.length, 24);
  for (let size = maxOverlap; size >= 3; size -= 1) {
    if (base.slice(-size) === next.slice(0, size)) {
      return base + next.slice(size);
    }
  }
  return base + next;
}
