import React, { useEffect, useState } from "react";
import { fetchCurrentUser, fetchMockUsers, mockLogin, redirectToLogin, isAuthEnabled, type AuthUser, type MockUserOption } from "../../lib/api";

type GateState =
  | { phase: "checking" }
  | { phase: "authenticated"; user: AuthUser }
  | { phase: "mock-login"; options: MockUserOption[] }
  | { phase: "redirecting" }
  | { phase: "logging-in" };

const centerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  color: "#666",
  fontSize: 14,
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // 认证未启用时直接渲染子组件
  if (!isAuthEnabled()) {
    return <>{children}</>;
  }

  return <AuthGateInner>{children}</AuthGateInner>;
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ phase: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchCurrentUser();
      if (cancelled) return;
      if (user) {
        setState({ phase: "authenticated", user });
        return;
      }
      const options = await fetchMockUsers();
      if (cancelled) return;
      if (options.length > 0) {
        setState({ phase: "mock-login", options });
        return;
      }
      setState({ phase: "redirecting" });
      redirectToLogin();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "checking" || state.phase === "redirecting" || state.phase === "logging-in") {
    return (
      <div style={centerStyle}>
        <div>{state.phase === "redirecting" ? "正在跳转到公司单点登录…" : "登录状态检查中…"}</div>
      </div>
    );
  }

  if (state.phase === "mock-login") {
    return (
      <div style={centerStyle}>
        <div style={{ fontSize: 16, color: "#333", fontWeight: 600 }}>选择一个测试账号登录</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
          {state.options.map((option) => (
            <button
              key={option.email}
              onClick={async () => {
                setState({ phase: "logging-in" });
                await mockLogin(option.email);
                window.location.reload();
              }}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {option.displayName}（{option.email}）
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
