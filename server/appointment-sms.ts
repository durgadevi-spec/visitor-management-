import { and, eq, lte } from "drizzle-orm";
import { db } from "./db";
import { appointmentSmsLogsTable } from "../shared/schema.ts";

export type AppointmentSmsType =
  | "registration_link"
  | "submission_confirmation"
  | "approved"
  | "rejected"
  | "cancelled"
  | "rescheduled"
  | "reminder";

interface SendAppointmentSmsOptions {
  organizationId: number;
  appointmentId: string;
  recipient: string;
  messageType: AppointmentSmsType;
  dedupeKey: string;
  variables: Record<string, string>;
}

export async function claimAppointmentSms(options: SendAppointmentSmsOptions) {
  const now = new Date();
  const [inserted] = await db.insert(appointmentSmsLogsTable).values({
    organizationId: options.organizationId,
    appointmentId: options.appointmentId,
    recipient: options.recipient,
    messageType: options.messageType,
    provider: "msg91",
    dedupeKey: options.dedupeKey,
    status: "sending",
    attemptCount: 1,
    updatedAt: now,
  }).onConflictDoNothing().returning();
  if (inserted) return { entry: inserted, claimed: true };

  const [existing] = await db.select().from(appointmentSmsLogsTable).where(and(
    eq(appointmentSmsLogsTable.organizationId, options.organizationId),
    eq(appointmentSmsLogsTable.dedupeKey, options.dedupeKey),
  ));
  if (!existing) throw new Error("SMS notification log could not be created");
  const reclaimingStaleSend = existing.status === "sending" &&
    existing.updatedAt <= new Date(now.getTime() - 60_000);
  if (existing.status !== "failed" && !reclaimingStaleSend) {
    return { entry: existing, claimed: false };
  }

  const [retrying] = await db.update(appointmentSmsLogsTable).set({
    status: "sending",
    attemptCount: existing.attemptCount + 1,
    lastError: null,
    updatedAt: now,
  }).where(and(
    eq(appointmentSmsLogsTable.id, existing.id),
    reclaimingStaleSend
      ? and(
          eq(appointmentSmsLogsTable.status, "sending"),
          lte(appointmentSmsLogsTable.updatedAt, new Date(now.getTime() - 60_000)),
        )
      : eq(appointmentSmsLogsTable.status, "failed"),
  )).returning();
  return { entry: retrying ?? existing, claimed: !!retrying };
}

export async function markAppointmentSmsFailed(id: number, message: string) {
  const [failed] = await db.update(appointmentSmsLogsTable).set({
    status: "failed",
    lastError: message.slice(0, 500),
    updatedAt: new Date(),
  }).where(and(
    eq(appointmentSmsLogsTable.id, id),
    eq(appointmentSmsLogsTable.status, "sending"),
  )).returning();
  return failed;
}

const templateEnvironmentKeys: Record<AppointmentSmsType, string> = {
  registration_link: "MSG91_TEMPLATE_REGISTRATION_LINK",
  submission_confirmation: "MSG91_TEMPLATE_SUBMISSION_CONFIRMATION",
  approved: "MSG91_TEMPLATE_APPROVED",
  rejected: "MSG91_TEMPLATE_REJECTED",
  cancelled: "MSG91_TEMPLATE_CANCELLED",
  rescheduled: "MSG91_TEMPLATE_RESCHEDULED",
  reminder: "MSG91_TEMPLATE_REMINDER",
};

function providerMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : {};
  const id = record.request_id ?? record.requestId ?? record.message_id ?? record.messageId ??
    nested.request_id ?? nested.requestId ?? nested.message_id ?? nested.messageId;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

export async function sendAppointmentSms(options: SendAppointmentSmsOptions) {
  const claim = await claimAppointmentSms(options);
  if (!claim.claimed) return claim.entry;
  return sendClaimedAppointmentSms(options, claim.entry);
}

export async function sendClaimedAppointmentSms(
  options: SendAppointmentSmsOptions,
  logEntry: typeof appointmentSmsLogsTable.$inferSelect,
) {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const senderId = process.env.MSG91_SENDER_ID?.trim();
  const templateId = process.env[templateEnvironmentKeys[options.messageType]]?.trim();
  if (!authKey || !senderId || !templateId) {
    const error = "MSG91 is not fully configured for this message template";
    const [failed] = await db.update(appointmentSmsLogsTable).set({
      status: "failed",
      lastError: error,
      updatedAt: new Date(),
    }).where(eq(appointmentSmsLogsTable.id, logEntry.id)).returning();
    return failed;
  }

  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId,
        short_url: "0",
        recipients: [{
          mobiles: `91${options.recipient}`,
          ...options.variables,
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = (await response.text()).slice(0, 2000);
    let responseBody: unknown = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }

    const bodyRecord = responseBody && typeof responseBody === "object"
      ? responseBody as Record<string, unknown>
      : {};
    const providerRejected = typeof bodyRecord.type === "string" && bodyRecord.type.toLowerCase() === "error";
    if (!response.ok || providerRejected) {
      const providerMessage = typeof bodyRecord.message === "string" ? bodyRecord.message.slice(0, 400) : "";
      const [failed] = await db.update(appointmentSmsLogsTable).set({
        status: "failed",
        providerResponse: responseText,
        lastError: providerMessage || `MSG91 rejected the request (HTTP ${response.status})`,
        updatedAt: new Date(),
      }).where(eq(appointmentSmsLogsTable.id, logEntry.id)).returning();
      return failed;
    }

    const [sent] = await db.update(appointmentSmsLogsTable).set({
      status: "sent",
      providerMessageId: providerMessageId(responseBody),
      providerResponse: responseText,
      lastError: null,
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(appointmentSmsLogsTable.id, logEntry.id)).returning();
    return sent;
  } catch (error) {
    const message = error instanceof Error ? error.message : "MSG91 request failed";
    const [failed] = await db.update(appointmentSmsLogsTable).set({
      status: "failed",
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(appointmentSmsLogsTable.id, logEntry.id)).returning();
    return failed;
  }
}
