// 认证模式：公司版用 cas，GitHub 版用 mock（或 none）
const AUTH_MODE = (import.meta as { env?: { VITE_AUTH_MODE?: string } }).env?.VITE_AUTH_MODE || "none";

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  // 公司版：401 自动跳转登录
  if (response.status === 401 && AUTH_MODE === "cas" && !url.startsWith("/api/auth/")) {
    redirectToLogin();
    throw new Error("未登录，正在跳转登录页");
  }
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

// ===== 认证相关（仅公司版启用）=====

export type AuthUser = { id: number; email: string; displayName: string; isAdmin: boolean };
export type MockUserOption = { email: string; displayName: string };

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (AUTH_MODE === "none") return null;
  const response = await fetch("/api/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return (await response.json()).user as AuthUser;
}

export async function fetchMockUsers(): Promise<MockUserOption[]> {
  const response = await fetch("/api/auth/mock-users");
  if (!response.ok) return [];
  return (await response.json()).users as MockUserOption[];
}

export async function mockLogin(email: string): Promise<void> {
  const response = await fetch("/api/auth/mock-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(`登录失败: ${await response.text()}`);
}

export function redirectToLogin(): void {
  if (AUTH_MODE === "cas") {
    window.location.href = "/api/auth/cas-login";
  }
}

export function isAuthEnabled(): boolean {
  return AUTH_MODE !== "none";
}
