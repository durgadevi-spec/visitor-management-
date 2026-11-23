import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import type { BillingCycle, PlanDefinition, PlanId } from "../../../shared/plans";

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

export interface SubscriptionOverview {
  organization: { id: number; name: string };
  subscription: {
    planId: PlanId;
    status: string;
    billingCycle: BillingCycle;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    readOnly: boolean;
  };
  plan: PlanDefinition;
  usage: {
    visitorsThisMonth: number;
    staffUsers: number;
  };
}

export interface SubscriptionInvoice {
  id: number;
  organizationId: number;
  invoiceNumber: string;
  amountPaise: number;
  currency: string;
  status: string;
  description: string;
  issuedAt: string;
  paidAt: string | null;
}

export interface DailyReconciliationVisitor {
  id: string;
  visitorId: string;
  name: string;
  mobile: string;
  status: "checked_in" | "checked_out";
  checkIn: string | null;
  checkOut: string | null;
  checkedInOnDate: boolean;
  checkedOutOnDate: boolean;
  insideAtEndOfDate: boolean;
  idCardNumber: string | null;
  idCardReturned: boolean | null;
  cardStatus: "not_issued" | "returned" | "not_returned" | "unverified" | "inside";
  cardOutstanding: boolean;
  checkedOutByName: string | null;
  checkedOutByEmail: string | null;
  blockedCheckoutAttempts: number;
}

export interface DailyReconciliationReport {
  date: string;
  timezone: string;
  summary: {
    checkIns: number;
    checkOuts: number;
    manualCheckouts: number;
    automaticCheckouts: number;
    visitorsInside: number;
    idCardsIssued: number;
    idCardsReturned: number;
    idCardsOutstanding: number;
    blockedCheckoutAttempts: number;
  };
  visitors: DailyReconciliationVisitor[];
}

export interface SuperAdminOrganization {
  id: number;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactMobile: string | null;
  createdAt: string;
  planId: PlanId | null;
  subscriptionStatus: string | null;
  billingCycle: BillingCycle | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  staffUsers: number;
  totalVisitors: number;
}

export interface SuperAdminPlanRequest {
  id: number;
  organizationId: number;
  organizationName: string;
  requestedBy: number;
  requesterName: string;
  requesterEmail: string;
  requestedPlanId: PlanId;
  billingCycle: BillingCycle;
  status: string;
  createdAt: string;
}

export interface SuperAdminOrganizationDetail {
  organization: {
    id: number;
    name: string;
    slug: string;
    contactEmail: string | null;
    contactMobile: string | null;
    createdAt: string;
  };
  subscription: {
    id: number;
    organizationId: number;
    planId: PlanId;
    status: string;
    billingCycle: BillingCycle;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    canceledAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  users: Array<{ id: number; name: string; email: string; role: AuthRole; createdAt: string }>;
  invoices: SubscriptionInvoice[];
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
  const token = getToken();
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
export type AuthRole = UserRole | "superadmin";

export interface User {
  id: number;
  organizationId: number | null;
  name: string;
  email: string;
  role: AuthRole;
  createdAt: string;
}

export type VisitorStatus = "pending" | "approved" | "checked_in" | "checked_out" | "rejected" | "scheduled" | "cancelled";
export type IdProofType = "aadhar" | "pan" | "passport" | "driving_license" | "voter_id";

export interface Visitor {
  id: string;
  organizationId: number;
  appointmentId: string | null;
  visitorId: string;
  name: string;
  mobile: string;
  email: string | null;
  purpose: string;
  personToMeet: string;
  personToMeetId: number | null;
  idProofType: IdProofType;
  idNumber: string;
  idCardNumber: string | null;
  idCardReturned: boolean | null;
  checkedOutBy: number | null;
  photoUrl: string | null;
  qrCode: string | null;
  status: VisitorStatus;
  scheduledFor: string | null;
  checkIn: string | null;
  checkOut: string | null;
  duration: string | null;
  isBlacklisted: boolean;
  isFlagged: boolean;
  remarks: string | null;
  approvedBy: number | null;
  currentLocationLatitude: number | null;
  currentLocationLongitude: number | null;
  currentLocationUpdatedAt: string | null;
  createdAt: string;
}

export interface PublicVisitorPass {
  visitorId: string;
  name: string;
  personToMeet: string;
  photoUrl: string | null;
  status: VisitorStatus;
  scheduledFor: string | null;
  createdAt: string;
  facilityName: string;
  companyLogo: string | null;
  trackingAvailable: boolean;
  receptionCoordinates: { latitude: number; longitude: number } | null;
}

export interface VisitorAuditEntry {
  id: number;
  visitorId: string;
  action: string;
  actorUserId: number | null;
  actorEmail: string;
  details: string;
  createdAt: string;
}

export interface VisitorGadget {
  id: number;
  visitorId: string;
  name: string;
  makeModel: string | null;
  serialNumber: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  reviewedBy: number | null;
  reviewedAt: string | null;
  returnedAt: string | null;
  createdAt: string;
}

export interface VisitorLookupMatch {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  personToMeet: string;
  idProofType: IdProofType;
  idNumber: string;
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
  organizationId: number;
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

export interface SystemSettings {
  id: number;
  organizationId: number;
  facilityName: string;
  companyLogo: string | null;
  contactEmail: string;
  autoCheckoutEnabled: boolean;
  autoCheckoutTime: string;
  timezone: string;
  requireApproval: boolean;
  requirePhoto: boolean;
  receptionLatitude: number | null;
  receptionLongitude: number | null;
}

export interface AppointmentListItem {
  id: string;
  organizationId: number;
  appointmentNumber: string;
  visitorName: string;
  mobile: string;
  email: string;
  company: string;
  scheduledAt: string;
  timezone: string;
  purpose: string;
  meetingPerson: string;
  meetingPersonId: number | null;
  department: string;
  notes: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  adminRemarks: string | null;
  cancellationReason: string | null;
  rescheduleReason: string | null;
  completedAt: string | null;
  createdAt: string;
  visitor?: {
    id: string;
    appointmentId?: string | null;
    visitorId: string;
    status: VisitorStatus;
    checkIn: string | null;
    checkOut: string | null;
    idCardNumber: string | null;
    idCardReturned: boolean | null;
    checkedOutBy: number | null;
    checkedOutByEmail: string | null;
    duration: string | null;
  } | null;
}

export interface AppointmentDetails {
  appointment: AppointmentListItem;
  submission: {
    id: number;
    fullName: string;
    mobile: string;
    email: string;
    company: string;
    fullAddress: string;
    idProofType: IdProofType;
    idProofNumber: string;
    additionalInformation: string;
    photoUrl: string;
    submittedAt: string;
  } | null;
  visitor: AppointmentListItem["visitor"];
  passes: Array<{
    id: number;
    visitorPassNumber: string;
    validFrom: string;
    validUntil: string;
    revokedAt: string | null;
    createdAt: string;
  }>;
  audit: Array<{ id: number; action: string; actorEmail: string; details: string; createdAt: string }>;
  smsLogs: Array<{
    id: number;
    recipient: string;
    messageType: string;
    status: string;
    attemptCount: number;
    lastError: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    createdAt: string;
  }>;
}

export interface PublicAppointmentRegistration {
  appointmentNumber: string;
  visitorName: string;
  mobile: string;
  email: string;
  company: string;
  scheduledAt: string;
  timezone: string;
  purpose: string;
  meetingPerson: string;
  department: string;
  status: string;
  organizationName: string;
}

export interface AppointmentPass {
  visitorId: string;
  name: string;
  photoUrl: string | null;
  appointmentNumber: string;
  visitorPassNumber: string;
  scheduledAt: string;
  timezone: string;
  meetingPerson: string;
  department: string;
  purpose: string;
  visitorStatus: VisitorStatus;
  facilityName: string;
  companyLogo: string | null;
}

/* ================================================================
   Query keys
================================================================= */
export const getGetVisitorsQueryKey = (params?: { status?: string; date?: string; search?: string; person_to_meet?: string }) =>
  ["/api/visitors", params ?? {}] as const;
export const getLookupVisitorsByMobileQueryKey = (mobile: string) => ["/api/visitors/lookup", mobile] as const;
export const getGetAllVisitorGadgetsQueryKey = () => ["/api/gadgets"] as const;
export const getGetVisitorQueryKey = (id: string) => ["/api/visitors", id] as const;
export const getGetVisitorAuditQueryKey = (id: string) => ["/api/visitors", id, "audit"] as const;
export const getGetVisitorGadgetsQueryKey = (id: string) => ["/api/visitors", id, "gadgets"] as const;
export const getGetReportsQueryKey = (params?: { period?: string }) => ["/api/reports", params ?? {}] as const;
export const getGetDashboardStatsQueryKey = () => ["/api/dashboard/stats"] as const;
export const getGetRecentVisitorsQueryKey = () => ["/api/dashboard/recent"] as const;
export const getGetActivityFeedQueryKey = () => ["/api/dashboard/activity"] as const;
export const getGetBlacklistQueryKey = () => ["/api/blacklist"] as const;
export const getGetUsersQueryKey = () => ["/api/users"] as const;
export const getGetNotificationsQueryKey = () => ["/api/notifications"] as const;
export const getGetSystemSettingsQueryKey = () => ["/api/settings"] as const;
export const getGetSubscriptionQueryKey = () => ["/api/subscription"] as const;
export const getGetSubscriptionInvoicesQueryKey = () => ["/api/subscription/invoices"] as const;
export const getGetSuperAdminOrganizationsQueryKey = () => ["/api/superadmin/organizations"] as const;
export const getGetSuperAdminPlanRequestsQueryKey = () => ["/api/superadmin/plan-requests"] as const;
export const getGetAppointmentsQueryKey = (params?: Record<string, unknown>) => ["/api/appointments", params ?? {}] as const;
export const getGetAppointmentQueryKey = (id: string) => ["/api/appointments", id] as const;
export const getGetAppointmentSummaryQueryKey = () => ["/api/appointments/summary"] as const;

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

export function useGetSystemSettings(options?: { query?: Partial<UseQueryOptions<SystemSettings, ApiError>> }) {
  return useQuery<SystemSettings, ApiError>({
    queryKey: getGetSystemSettingsQueryKey(),
    queryFn: () => request<SystemSettings>("/api/settings"),
    ...options?.query,
  });
}

export function useGetSubscription(options?: { query?: Partial<UseQueryOptions<SubscriptionOverview, ApiError>> }) {
  return useQuery<SubscriptionOverview, ApiError>({
    queryKey: getGetSubscriptionQueryKey(),
    queryFn: () => request<SubscriptionOverview>("/api/subscription"),
    ...options?.query,
  });
}

export function useGetSubscriptionInvoices(options?: { query?: Partial<UseQueryOptions<SubscriptionInvoice[], ApiError>> }) {
  return useQuery<SubscriptionInvoice[], ApiError>({
    queryKey: getGetSubscriptionInvoicesQueryKey(),
    queryFn: () => request<SubscriptionInvoice[]>("/api/subscription/invoices"),
    ...options?.query,
  });
}

export function useChangeSubscriptionPlan(options?: {
  mutation?: UseMutationOptions<
    { requestId: number; status: string; message: string },
    ApiError,
    { planId: PlanId; billingCycle: BillingCycle }
  >;
}) {
  return useMutation({
    mutationFn: (data: { planId: PlanId; billingCycle: BillingCycle }) =>
      request<{ requestId: number; status: string; message: string }>("/api/subscription/change-plan", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ...options?.mutation,
  });
}

export function useGetSuperAdminOrganizations(options?: { query?: Partial<UseQueryOptions<SuperAdminOrganization[], ApiError>> }) {
  return useQuery<SuperAdminOrganization[], ApiError>({
    queryKey: getGetSuperAdminOrganizationsQueryKey(),
    queryFn: () => request<SuperAdminOrganization[]>("/api/superadmin/organizations"),
    ...options?.query,
  });
}

export function useGetSuperAdminOrganization(id: number, options?: { query?: Partial<UseQueryOptions<SuperAdminOrganizationDetail, ApiError>> }) {
  return useQuery<SuperAdminOrganizationDetail, ApiError>({
    queryKey: ["/api/superadmin/organizations", id],
    queryFn: () => request<SuperAdminOrganizationDetail>(`/api/superadmin/organizations/${id}`),
    ...options?.query,
  });
}

export function useGetSuperAdminPlanRequests(options?: { query?: Partial<UseQueryOptions<SuperAdminPlanRequest[], ApiError>> }) {
  return useQuery<SuperAdminPlanRequest[], ApiError>({
    queryKey: getGetSuperAdminPlanRequestsQueryKey(),
    queryFn: () => request<SuperAdminPlanRequest[]>("/api/superadmin/plan-requests"),
    ...options?.query,
  });
}

export function useReviewSuperAdminPlanRequest(options?: {
  mutation?: UseMutationOptions<
    { id: number; status: string },
    ApiError,
    { id: number; action: "approve" | "decline" }
  >;
}) {
  return useMutation({
    mutationFn: (data: { id: number; action: "approve" | "decline" }) =>
      request<{ id: number; status: string }>(`/api/superadmin/plan-requests/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: data.action }),
      }),
    ...options?.mutation,
  });
}

export function useUpdateSuperAdminSubscription(options?: {
  mutation?: UseMutationOptions<
    unknown,
    ApiError,
    {
      organizationId: number;
      planId: PlanId;
      status: "trial" | "active" | "past_due" | "canceled" | "expired";
      billingCycle: BillingCycle;
    }
  >;
}) {
  return useMutation({
    mutationFn: (data: {
      organizationId: number;
      planId: PlanId;
      status: "trial" | "active" | "past_due" | "canceled" | "expired";
      billingCycle: BillingCycle;
    }) => request(`/api/superadmin/organizations/${data.organizationId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify({ planId: data.planId, status: data.status, billingCycle: data.billingCycle }),
    }),
    ...options?.mutation,
  });
}

export function useCreateSuperAdminInvoice(options?: {
  mutation?: UseMutationOptions<
    SubscriptionInvoice,
    ApiError,
    { organizationId: number; amountRupees: number; description: string; status: "pending" | "paid" }
  >;
}) {
  return useMutation({
    mutationFn: (data: { organizationId: number; amountRupees: number; description: string; status: "pending" | "paid" }) =>
      request<SubscriptionInvoice>(`/api/superadmin/organizations/${data.organizationId}/invoices`, {
        method: "POST",
        body: JSON.stringify({ amountRupees: data.amountRupees, description: data.description, status: data.status }),
      }),
    ...options?.mutation,
  });
}

export function useUpdateSystemSettings(options?: {
  mutation?: UseMutationOptions<SystemSettings, ApiError, Omit<SystemSettings, "id" | "organizationId">>;
}) {
  return useMutation<SystemSettings, ApiError, Omit<SystemSettings, "id" | "organizationId">>({
    mutationFn: (data) => request("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
    ...options?.mutation,
  });
}

export function useLogin(options?: {
  mutation?: UseMutationOptions<AuthResponse, ApiError, { data: { email: string; password: string }; rememberMe: boolean }>;
}) {
  return useMutation<AuthResponse, ApiError, { data: { email: string; password: string }; rememberMe: boolean }>({
    mutationFn: (vars) =>
      request("/api/auth/login", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export interface SignupInput {
  name: string;
  organizationName?: string;
  email: string;
  password: string;
}

export function useSignup(options?: {
  mutation?: UseMutationOptions<AuthResponse, ApiError, { data: SignupInput; rememberMe: boolean }>;
}) {
  return useMutation<AuthResponse, ApiError, { data: SignupInput; rememberMe: boolean }>({
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
  idCardNumber?: string;
  photoUrl?: string | null;
  scheduledFor?: string;
  gadgets?: { name: string; makeModel?: string | null; serialNumber?: string | null }[];
}

export type UpdateVisitorInput = Omit<CreateVisitorInput, "personToMeetId" | "photoUrl" | "email" | "idCardNumber"> & {
  email?: string;
  idCardNumber?: string;
};

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

export function useLookupVisitorsByMobile(
  mobile: string,
  options?: { query?: Partial<UseQueryOptions<VisitorLookupMatch[], ApiError>> },
) {
  return useQuery<VisitorLookupMatch[], ApiError>({
    queryKey: getLookupVisitorsByMobileQueryKey(mobile),
    queryFn: () => request<VisitorLookupMatch[]>(`/api/visitors/lookup${buildQueryString({ mobile })}`),
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

export function useGetPublicVisitorPass(id: string, options?: { query?: Partial<UseQueryOptions<PublicVisitorPass, ApiError>> }) {
  return useQuery<PublicVisitorPass, ApiError>({
    queryKey: ["/api/public/visitor-pass", id],
    queryFn: () => request<PublicVisitorPass>(`/api/public/visitor-pass/${encodeURIComponent(id)}`),
    ...options?.query,
  });
}

export type PublicVisitorLocationUpdate =
  | { action: "update"; latitude: number; longitude: number; accuracyMeters: number }
  | { action: "stop" };

export function updatePublicVisitorLocation(id: string, update: PublicVisitorLocationUpdate) {
  return request<{ stored: boolean; reason?: "outside_geofence" | "poor_accuracy" | "stopped" }>(
    `/api/public/visitor-pass/${encodeURIComponent(id)}/location`,
    { method: "POST", body: JSON.stringify(update) },
  );
}

export function useGetVisitorAudit(id: string, options?: { query?: Partial<UseQueryOptions<VisitorAuditEntry[], ApiError>> }) {
  return useQuery<VisitorAuditEntry[], ApiError>({
    queryKey: getGetVisitorAuditQueryKey(id),
    queryFn: () => request<VisitorAuditEntry[]>(`/api/visitors/${id}/audit`),
    ...options?.query,
  });
}

export function useGetVisitorGadgets(id: string, options?: { query?: Partial<UseQueryOptions<VisitorGadget[], ApiError>> }) {
  return useQuery<VisitorGadget[], ApiError>({
    queryKey: getGetVisitorGadgetsQueryKey(id),
    queryFn: () => request<VisitorGadget[]>(`/api/visitors/${id}/gadgets`),
    ...options?.query,
  });
}

export function useGetAllVisitorGadgets(options?: { query?: Partial<UseQueryOptions<VisitorGadget[], ApiError>> }) {
  return useQuery<VisitorGadget[], ApiError>({
    queryKey: getGetAllVisitorGadgetsQueryKey(),
    queryFn: () => request<VisitorGadget[]>("/api/gadgets"),
    ...options?.query,
  });
}

export function useReviewVisitorGadget(options?: {
  mutation?: UseMutationOptions<VisitorGadget, ApiError, { visitorId: string; gadgetId: number; action: "approve" | "reject" }>;
}) {
  return useMutation<VisitorGadget, ApiError, { visitorId: string; gadgetId: number; action: "approve" | "reject" }>({
    mutationFn: ({ visitorId, gadgetId, action }) => request(`/api/visitors/${visitorId}/gadgets/${gadgetId}/approval`, {
      method: "PUT",
      body: JSON.stringify({ action }),
    }),
    ...options?.mutation,
  });
}

export function useReturnVisitorGadget(options?: {
  mutation?: UseMutationOptions<VisitorGadget, ApiError, { visitorId: string; gadgetId: number }>;
}) {
  return useMutation<VisitorGadget, ApiError, { visitorId: string; gadgetId: number }>({
    mutationFn: ({ visitorId, gadgetId }) => request(`/api/visitors/${visitorId}/gadgets/${gadgetId}/return`, { method: "PUT" }),
    ...options?.mutation,
  });
}

export function useCreateVisitor(options?: { mutation?: UseMutationOptions<Visitor, ApiError, { data: CreateVisitorInput }> }) {
  return useMutation<Visitor, ApiError, { data: CreateVisitorInput }>({
    mutationFn: (vars) => request("/api/visitors", { method: "POST", body: JSON.stringify(vars.data) }),
    ...options?.mutation,
  });
}

export function useUpdateVisitor(options?: {
  mutation?: UseMutationOptions<Visitor, ApiError, { id: string; data: UpdateVisitorInput }>;
}) {
  return useMutation<Visitor, ApiError, { id: string; data: UpdateVisitorInput }>({
    mutationFn: (vars) =>
      request(`/api/visitors/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.data) }),
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

export function useCheckinVisitor(options?: { mutation?: UseMutationOptions<Visitor, ApiError, { id: string; data?: { idCardNumber?: string } }> }) {
  return useMutation<Visitor, ApiError, { id: string; data?: { idCardNumber?: string } }>({
    mutationFn: (vars) => request(`/api/visitors/${vars.id}/checkin`, {
      method: "PUT",
      body: JSON.stringify(vars.data ?? {}),
    }),
    ...options?.mutation,
  });
}

export function useCheckoutVisitor(options?: { mutation?: UseMutationOptions<Visitor, ApiError, { id: string; data: { idCardReturned: true } }> }) {
  return useMutation<Visitor, ApiError, { id: string; data: { idCardReturned: true } }>({
    mutationFn: (vars) => request(`/api/visitors/${vars.id}/checkout`, {
      method: "PUT",
      body: JSON.stringify(vars.data),
    }),
    ...options?.mutation,
  });
}

export function useRecordVisitorCheckoutBlocked(options?: {
  mutation?: UseMutationOptions<Visitor, ApiError, { id: string }>;
}) {
  return useMutation<Visitor, ApiError, { id: string }>({
    mutationFn: (vars) => request(`/api/visitors/${vars.id}/checkout-blocked`, { method: "PUT" }),
    ...options?.mutation,
  });
}

export interface CreateAppointmentInput {
  visitorName: string;
  mobile: string;
  email: string;
  company: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  purpose: string;
  meetingPerson: string;
  meetingPersonId?: number | null;
  department: string;
  notes?: string;
}

export interface AppointmentSubmissionInput {
  fullName: string;
  mobile: string;
  email: string;
  company: string;
  fullAddress: string;
  idProofType: IdProofType;
  idProofNumber: string;
  additionalInformation?: string;
  photoUrl: string;
}

export interface AppointmentActionResult {
  appointment?: AppointmentListItem;
  visitorId?: string;
  visitorNumber?: string;
  visitorPassNumber?: string;
  passUrl?: string;
  sms?: string;
}

function invalidateAppointmentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() }),
  ]);
}

export function useGetAppointments(
  params?: { status?: string; search?: string; from?: string; to?: string },
  options?: { query?: Partial<UseQueryOptions<AppointmentListItem[], ApiError>> },
) {
  return useQuery<AppointmentListItem[], ApiError>({
    queryKey: getGetAppointmentsQueryKey(params),
    queryFn: () => request<AppointmentListItem[]>(`/api/appointments${buildQueryString(params)}`),
    ...options?.query,
  });
}

export function useGetAppointmentSummary(options?: { query?: Partial<UseQueryOptions<Record<string, number>, ApiError>> }) {
  return useQuery<Record<string, number>, ApiError>({
    queryKey: getGetAppointmentSummaryQueryKey(),
    queryFn: () => request<Record<string, number>>("/api/appointments/summary"),
    ...options?.query,
  });
}

export function useGetAppointment(id: string, options?: { query?: Partial<UseQueryOptions<AppointmentDetails, ApiError>> }) {
  return useQuery<AppointmentDetails, ApiError>({
    queryKey: getGetAppointmentQueryKey(id),
    queryFn: () => request<AppointmentDetails>(`/api/appointments/${encodeURIComponent(id)}`),
    ...options?.query,
  });
}

export function useCreateAppointment(options?: {
  mutation?: UseMutationOptions<AppointmentListItem & { registrationUrl: string; sms: string }, ApiError, CreateAppointmentInput>;
}) {
  const queryClient = useQueryClient();
  return useMutation<AppointmentListItem & { registrationUrl: string; sms: string }, ApiError, CreateAppointmentInput>({
    ...options?.mutation,
    mutationFn: (data) => request("/api/appointments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: async (...args) => {
      await invalidateAppointmentQueries(queryClient);
      await options?.mutation?.onSuccess?.(...args);
    },
  });
}

export function useAppointmentAction(action: "approve" | "reject" | "cancel" | "reschedule") {
  const queryClient = useQueryClient();
  return useMutation<AppointmentActionResult, ApiError, { id: string; data: Record<string, unknown> }>({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      request(`/api/appointments/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAppointmentQueries(queryClient),
  });
}

export function useIssueAppointmentPass() {
  const queryClient = useQueryClient();
  return useMutation<{ visitorPassNumber: string; passUrl: string }, ApiError, string>({
    mutationFn: (id) => request(`/api/appointments/${encodeURIComponent(id)}/issue-pass`, { method: "POST" }),
    onSuccess: () => invalidateAppointmentQueries(queryClient),
  });
}

export function useRetryAppointmentSms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ sms: string; registrationUrl?: string; passUrl?: string }>(
      `/api/appointments/sms/${id}/retry`,
      { method: "POST" },
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
  });
}

export function useGetPublicAppointment(
  token: string,
  options?: { query?: Partial<UseQueryOptions<PublicAppointmentRegistration, ApiError>> },
) {
  return useQuery<PublicAppointmentRegistration, ApiError>({
    queryKey: ["/api/public/appointments", token],
    queryFn: () => request<PublicAppointmentRegistration>(`/api/public/appointments/${encodeURIComponent(token)}`),
    ...options?.query,
  });
}

export function submitPublicAppointmentRegistration(token: string, data: AppointmentSubmissionInput) {
  return request<{ status: string; appointmentNumber: string }>(
    `/api/public/appointments/${encodeURIComponent(token)}/submission`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export function useGetPublicAppointmentPass(
  token: string,
  options?: { query?: Partial<UseQueryOptions<AppointmentPass, ApiError>> },
) {
  return useQuery<AppointmentPass, ApiError>({
    queryKey: ["/api/public/appointment-passes", token],
    queryFn: () => request<AppointmentPass>(`/api/public/appointment-passes/${encodeURIComponent(token)}`),
    ...options?.query,
  });
}

export function verifyAppointmentPass(token: string) {
  return request<{
    appointmentNumber: string;
    visitorPassNumber: string;
    scheduledAt: string;
    timezone: string;
    purpose: string;
    meetingPerson: string;
    department: string;
    appointmentStatus: string;
    visitor: { id: string; visitorId: string; name: string; mobile: string; status: VisitorStatus };
  }>(`/api/appointments/passes/verify/${encodeURIComponent(token)}`);
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

export function useGetDailyReconciliation(
  date: string,
  options?: { query?: Partial<UseQueryOptions<DailyReconciliationReport, ApiError>> },
) {
  return useQuery<DailyReconciliationReport, ApiError>({
    queryKey: ["/api/reconciliation/daily", date],
    queryFn: () => request<DailyReconciliationReport>(`/api/reconciliation/daily${buildQueryString({ date })}`),
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
  role: Exclude<UserRole, "superadmin">;
}

export interface UpdateUserInput {
  name: string;
  email: string;
  password?: string;
  role: Exclude<UserRole, "superadmin">;
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

export function useUpdateBlacklist(options?: {
  mutation?: UseMutationOptions<BlacklistEntry, ApiError, { id: number; data: AddToBlacklistInput }>;
}) {
  return useMutation<BlacklistEntry, ApiError, { id: number; data: AddToBlacklistInput }>({
    mutationFn: (vars) =>
      request(`/api/blacklist/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.data) }),
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
