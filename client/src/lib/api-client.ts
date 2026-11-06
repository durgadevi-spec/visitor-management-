import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";

/**
 * Small typed API layer for the Visitor Management app.
 *
 * This replaces the old `@/lib/api-client` package, which was
 * generated at build time from an OpenAPI spec via orval inside the pnpm
 * monorepo. Since this app is now a single plain npm project, the client is
 * just hand-written here instead — same hook names/shapes the pages already
 * expect, backed by plain `fetch` + React Query.
 */

const TOKEN_KEY = "vms_token";

export interface AuthResponse {
  token: string;
  user: User;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }

  /** Convenience accessor for the server's `{ error: string }` response body. */
  get error(): string {
    return (this.data && this.data.error) || this.message;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { ...options, headers });

  if (res.status === 204) return null as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && (data.error || data.message)) || res.statusText;
    throw new ApiError(res.status, data, message);
  }

  return data as T;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

/* ================================================================
   Types (mirrors shared/schema.ts, kept as plain interfaces so this
   file has zero drizzle/node deps and is safe to bundle for the browser)
================================================================= */
export type UserRole = "admin" | "security" | "employee";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type VisitorStatus = "pending" | "approved" | "checked_in" | "checked_out" | "rejected";
export type IdProofType = "aadhar" | "pan" | "passport" | "driving_license" | "voter_id";

export interface Visitor {
  id: string;
  visitorId: string;
  name: string;
  mobile: string;
  email: string | null;
  purpose: string;
  personToMeet: string;
  personToMeetId: number | null;
  idProofType: IdProofType;
  idNumber: string;
  photoUrl: string | null;
  qrCode: string | null;
  status: VisitorStatus;
  checkIn: string | null;
  checkOut: string | null;
  duration: string | null;
  isBlacklisted: boolean;
  isFlagged: boolean;
  remarks: string | null;
  approvedBy: number | null;
  createdAt: string;
}

export interface BlacklistEntry {
  id: number;
  name: string;
  mobile: string;
  reason: string;
  addedBy: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  message: string;
  type: string;
  readStatus: boolean;
  visitorId: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalToday: number;
  visitorsInside: number;
  checkedOut: number;
  pendingApprovals: number;
  totalThisWeek: number;
  totalThisMonth: number;
  peakHour: string;
  avgDuration: string;
}

export interface ActivityItem {
  id: number;
  type: "check_in" | "check_out" | "approval" | "rejection" | "blacklist";
  visitorName: string;
  message: string;
  timestamp: string;
}

export interface ReportData {
  period: "daily" | "weekly" | "monthly";
  totalVisitors: number;
  avgDailyVisitors: number;
  peakDay: string;
  timeline: { date: string; count: number }[];
  hourlyDistribution: { hour: string; count: number }[];
  purposeBreakdown: { purpose: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
}

/* ================================================================
   Query keys
================================================================= */
export const getGetVisitorsQueryKey = (params?: { status?: string; date?: string; search?: string; person_to_meet?: string }) =>
  ["/api/visitors", params ?? {}] as const;
export const getGetVisitorQueryKey = (id: string) => ["/api/visitors", id] as const;
export const getGetReportsQueryKey = (params?: { period?: string }) => ["/api/reports", params ?? {}] as const;
export const getGetDashboardStatsQueryKey = () => ["/api/dashboard/stats"] as const;
export const getGetRecentVisitorsQueryKey = () => ["/api/dashboard/recent"] as const;
export const getGetActivityFeedQueryKey = () => ["/api/dashboard/activity"] as const;
export const getGetBlacklistQueryKey = () => ["/api/blacklist"] as const;
export const getGetUsersQueryKey = () => ["/api/users"] as const;
export const getGetNotificationsQueryKey = () => ["/api/notifications"] as const;

/* ================================================================
   Auth
================================================================= */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string, rememberMe = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  (rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function useGetMe(options?: { query?: Partial<UseQueryOptions<User, ApiError>> }) {
  return useQuery<User, ApiError>({
    queryKey: ["/api/auth/me"],
    queryFn: () => request<User>("/api/auth/me"),
    ...options?.query,
  });
}

export function useLogin(options?: {
  mutation?: UseMutationOptions<AuthResponse, ApiError, { data: { email: string; password: string } }>;
}) {
  return useMutation<AuthResponse, ApiError, { data: { email: string; password: string } }>({
    mutationFn: (vars) =>
      request("/api/auth/login", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export function useSignup(options?: {
  mutation?: UseMutationOptions<AuthResponse, ApiError, { data: SignupInput }>;
}) {
  return useMutation<AuthResponse, ApiError, { data: SignupInput }>({
    mutationFn: (vars) =>
      request("/api/auth/signup", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

/* ================================================================
   Visitors
================================================================= */
export interface CreateVisitorInput {
  name: string;
  mobile: string;
  email?: string | null;
  purpose: string;
  personToMeet: string;
  personToMeetId?: number | null;
  idProofType: IdProofType;
  idNumber: string;
  photoUrl?: string | null;
}

export function useGetVisitors(
  params?: { status?: string; date?: string; search?: string; person_to_meet?: string },
  options?: { query?: Partial<UseQueryOptions<Visitor[], ApiError>> },
) {
  return useQuery<Visitor[], ApiError>({
    queryKey: getGetVisitorsQueryKey(params),
    queryFn: () => request<Visitor[]>(`/api/visitors${buildQueryString(params)}`),
    ...options?.query,
  });
}

export function useGetVisitor(id: string, options?: { query?: Partial<UseQueryOptions<Visitor, ApiError>> }) {
  return useQuery<Visitor, ApiError>({
    queryKey: getGetVisitorQueryKey(id),
    queryFn: () => request<Visitor>(`/api/visitors/${id}`),
    ...options?.query,
  });
}

export function useCreateVisitor(options?: { mutation?: UseMutationOptions<Visitor, ApiError, { data: CreateVisitorInput }> }) {
  return useMutation<Visitor, ApiError, { data: CreateVisitorInput }>({
    mutationFn: (vars) => request("/api/visitors", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export function useApproveVisitor(options?: {
  mutation?: UseMutationOptions<Visitor, ApiError, { id: string; data: { action: "approve" | "reject"; remarks?: string | null } }>;
}) {
  return useMutation<Visitor, ApiError, { id: string; data: { action: "approve" | "reject"; remarks?: string | null } }>({
    mutationFn: (vars) => request(`/api/visitors/${vars.id}/approve`, { method: "PUT", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export function useCheckinVisitor(options?: { mutation?: UseMutationOptions<Visitor, ApiError, { id: string }> }) {
  return useMutation<Visitor, ApiError, { id: string }>({
    mutationFn: (vars) => request(`/api/visitors/${vars.id}/checkin`, { method: "PUT" }),
    ...options?.mutation,
  });
}

export function useCheckoutVisitor(options?: { mutation?: UseMutationOptions<Visitor, ApiError, { id: string }> }) {
  return useMutation<Visitor, ApiError, { id: string }>({
    mutationFn: (vars) => request(`/api/visitors/${vars.id}/checkout`, { method: "PUT" }),
    ...options?.mutation,
  });
}

/* ================================================================
   Dashboard
================================================================= */
export function useGetDashboardStats(options?: { query?: Partial<UseQueryOptions<DashboardStats, ApiError>> }) {
  return useQuery<DashboardStats, ApiError>({
    queryKey: getGetDashboardStatsQueryKey(),
    queryFn: () => request<DashboardStats>("/api/dashboard/stats"),
    ...options?.query,
  });
}

export function useGetRecentVisitors(options?: { query?: Partial<UseQueryOptions<Visitor[], ApiError>> }) {
  return useQuery<Visitor[], ApiError>({
    queryKey: getGetRecentVisitorsQueryKey(),
    queryFn: () => request<Visitor[]>("/api/dashboard/recent"),
    ...options?.query,
  });
}

export function useGetActivityFeed(options?: { query?: Partial<UseQueryOptions<ActivityItem[], ApiError>> }) {
  return useQuery<ActivityItem[], ApiError>({
    queryKey: getGetActivityFeedQueryKey(),
    queryFn: () => request<ActivityItem[]>("/api/dashboard/activity"),
    ...options?.query,
  });
}

/* ================================================================
   Reports
================================================================= */
export function useGetReports(
  params?: { period?: "daily" | "weekly" | "monthly" },
  options?: { query?: Partial<UseQueryOptions<ReportData, ApiError>> },
) {
  return useQuery<ReportData, ApiError>({
    queryKey: getGetReportsQueryKey(params),
    queryFn: () => request<ReportData>(`/api/reports${buildQueryString(params)}`),
    ...options?.query,
  });
}

/* ================================================================
   Users
================================================================= */
export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
}

export function useGetUsers(options?: { query?: Partial<UseQueryOptions<User[], ApiError>> }) {
  return useQuery<User[], ApiError>({
    queryKey: getGetUsersQueryKey(),
    queryFn: () => request<User[]>("/api/users"),
    ...options?.query,
  });
}

export function useCreateUser(options?: { mutation?: UseMutationOptions<User, ApiError, { data: CreateUserInput }> }) {
  return useMutation<User, ApiError, { data: CreateUserInput }>({
    mutationFn: (vars) => request("/api/users", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export function useUpdateUser(options?: { mutation?: UseMutationOptions<User, ApiError, { id: number; data: UpdateUserInput }> }) {
  return useMutation<User, ApiError, { id: number; data: UpdateUserInput }>({
    mutationFn: (vars) => request(`/api/users/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export function useDeleteUser(options?: { mutation?: UseMutationOptions<{ success: boolean }, ApiError, { id: number }> }) {
  return useMutation<{ success: boolean }, ApiError, { id: number }>({
    mutationFn: (vars) => request(`/api/users/${vars.id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

/* ================================================================
   Blacklist
================================================================= */
export interface AddToBlacklistInput {
  name: string;
  mobile: string;
  reason: string;
}

export function useGetBlacklist(options?: { query?: Partial<UseQueryOptions<BlacklistEntry[], ApiError>> }) {
  return useQuery<BlacklistEntry[], ApiError>({
    queryKey: getGetBlacklistQueryKey(),
    queryFn: () => request<BlacklistEntry[]>("/api/blacklist"),
    ...options?.query,
  });
}

export function useAddToBlacklist(options?: { mutation?: UseMutationOptions<BlacklistEntry, ApiError, { data: AddToBlacklistInput }> }) {
  return useMutation<BlacklistEntry, ApiError, { data: AddToBlacklistInput }>({
    mutationFn: (vars) => request("/api/blacklist", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export function useRemoveFromBlacklist(options?: { mutation?: UseMutationOptions<{ success: boolean }, ApiError, { id: number }> }) {
  return useMutation<{ success: boolean }, ApiError, { id: number }>({
    mutationFn: (vars) => request(`/api/blacklist/${vars.id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}

/* ================================================================
   Notifications
================================================================= */
export function useGetNotifications(options?: { query?: Partial<UseQueryOptions<Notification[], ApiError>> }) {
  return useQuery<Notification[], ApiError>({
    queryKey: getGetNotificationsQueryKey(),
    queryFn: () => request<Notification[]>("/api/notifications"),
    ...options?.query,
  });
}

export function useMarkNotificationRead(options?: { mutation?: UseMutationOptions<Notification, ApiError, { id: number }> }) {
  return useMutation<Notification, ApiError, { id: number }>({
    mutationFn: (vars) => request(`/api/notifications/${vars.id}/read`, { method: "PUT" }),
    ...options?.mutation,
  });
}

export function useMarkAllNotificationsRead(options?: { mutation?: UseMutationOptions<{ success: boolean }, ApiError, void> }) {
  return useMutation<{ success: boolean }, ApiError, void>({
    mutationFn: () => request("/api/notifications/read-all", { method: "PUT" }),
    ...options?.mutation,
  });
}
