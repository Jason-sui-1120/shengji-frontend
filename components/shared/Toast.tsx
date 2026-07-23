import React from "react";

export type ToastTone = "error" | "info" | "success";
export type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

const ToastContext = React.createContext<{
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextIdRef = React.useRef(1);
  // 不能只依赖 React state 去重：同一批 WebSocket 状态在一次渲染提交前
  // 连续抵达时，多个回调会读到同一个旧 state，仍可能把完全相同的提示叠出来。
  // 用 ref 作为同步的“在屏提示”索引，状态只是渲染结果。
  const activeToastKeysRef = React.useRef(new Map<string, number>());

  const push = React.useCallback((tone: ToastTone, message: string) => {
    const key = `${tone}\u0000${message}`;
    if (activeToastKeysRef.current.has(key)) return;
    const id = nextIdRef.current++;
    activeToastKeysRef.current.set(key, id);
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      if (activeToastKeysRef.current.get(key) !== id) return;
      activeToastKeysRef.current.delete(key);
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => {
      const item = current.find((toast) => toast.id === id);
      if (item) activeToastKeysRef.current.delete(`${item.tone}\u0000${item.message}`);
      return current.filter((toast) => toast.id !== id);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-viewport" role="region" aria-label="通知">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role="alert">
          <span>{toast.message}</span>
          <button type="button" className="toast-close" aria-label="关闭" onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
