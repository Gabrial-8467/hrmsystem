import { api } from "./client";
import {
  getRefreshToken,
  setTokens,
  clearTokens,
} from "@/lib/auth/token-store";
import type {
  AuthSession,
  CurrentUser,
  ListResult,
  OrganizationSummary,
  PageQuery,
  PermissionGroup,
  PermissionInfo,
  RoleSummary,
  UserSummary,
  DashboardSummary,
  MyDashboard,
  AuditLogEntry,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string, rememberMe = false): Promise<AuthSession> {
  const session = await api.post<AuthSession>("/api/v1/auth/login", {
    email,
    password,
    rememberMe,
  });
  const { accessToken, refreshToken } = session;
  if (accessToken && refreshToken) {
    setTokens(accessToken, refreshToken);
  }
  return session;
}

export async function logout(): Promise<void> {
  try {
    await api.post<null>("/api/v1/auth/logout", {
      refreshToken: getRefreshToken(),
    });
  } finally {
    clearTokens();
  }
}

export async function fetchMe(): Promise<CurrentUser> {
  return api.get<CurrentUser>("/api/v1/auth/me");
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post<null>("/api/v1/auth/request-password-reset", { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post<null>("/api/v1/auth/reset-password", {
    token,
    password,
    passwordConfirmation: password,
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post<null>("/api/v1/auth/change-password", {
    currentPassword,
    newPassword,
    passwordConfirmation: newPassword,
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(query: PageQuery & { status?: string; role?: string } = {}) {
  return api.get<ListResult<UserSummary>>("/api/v1/users", { query });
}

export async function getUser(id: string) {
  return api.get<UserSummary>(`/api/v1/users/${id}`);
}

export async function createUser(body: {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  title?: string | null;
  phone?: string | null;
  roleCodes: string[];
  status?: string;
}) {
  return api.post<UserSummary>("/api/v1/users", body);
}

export async function updateUser(id: string, body: Record<string, unknown>) {
  return api.patch<UserSummary>(`/api/v1/users/${id}`, body);
}

export async function deleteUser(id: string) {
  return api.del<null>(`/api/v1/users/${id}`);
}

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export async function listRoles() {
  return api.get<{ roles: RoleSummary[]; systemRoles: string[] }>("/api/v1/roles");
}

export async function createRole(body: { name: string; code: string; description?: string | null; permissions: string[] }) {
  return api.post<RoleSummary>("/api/v1/roles", body);
}

export async function updateRole(
  id: string,
  body: { name?: string; description?: string | null; isActive?: boolean; permissions?: string[] },
) {
  return api.patch<RoleSummary>(`/api/v1/roles/${id}`, body);
}

export async function deleteRole(id: string) {
  return api.del<null>(`/api/v1/roles/${id}`);
}

export async function listPermissions() {
  return api.get<{ permissions: PermissionInfo[]; grouped: PermissionGroup[] }>("/api/v1/roles/permissions");
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function listOrganizations(query: PageQuery & { status?: string; plan?: string } = {}) {
  return api.get<ListResult<OrganizationSummary>>("/api/v1/organizations", { query });
}

export async function createOrganization(body: {
  name: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  plan?: string;
}) {
  return api.post<{ organizationId: string; initialPassword: string }>("/api/v1/organizations", body);
}

// ---------------------------------------------------------------------------
// Dashboard & activity
// ---------------------------------------------------------------------------

export async function fetchDashboardSummary() {
  return api.get<DashboardSummary>("/api/v1/dashboard/summary");
}

export async function fetchMyDashboard() {
  return api.get<MyDashboard>("/api/v1/dashboard/me");
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export async function listAuditLogs(query: PageQuery & { entity?: string; action?: string }) {
  return api.get<ListResult<AuditLogEntry>>("/api/v1/audit-logs", { query });
}