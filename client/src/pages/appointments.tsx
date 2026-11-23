import { useEffect, useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { CalendarClock, Check, Clipboard, Download, Eye, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AppointmentListItem,
  useAppointmentAction,
  useCreateAppointment,
  useGetAppointment,
  useGetAppointments,
  useGetAppointmentSummary,
  useGetSubscription,
  useGetSystemSettings,
  useGetUsers,
  useIssueAppointmentPass,
  useRetryAppointmentSms,
} from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type ActionDialog = { id: string; action: "reject" | "cancel" | "reschedule" };

const appointmentStatuses = [
  "pending",
  "submitted",
  "approved",
  "checked_in",
  "completed",
  "rejected",
  "cancelled",
  "expired",
];

export default function Appointments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: subscription } = useGetSubscription();
  const { data: settings } = useGetSystemSettings();
  const { data: users } = useGetUsers();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialog | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [lastShareableUrl, setLastShareableUrl] = useState("");
  const [form, setForm] = useState({
    visitorName: "",
    mobile: "",
    email: "",
    company: "",
    scheduledDate: "",
    scheduledTime: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    purpose: "",
    meetingPerson: "",
    meetingPersonId: "",
    department: "",
    notes: "",
  });
  const queryParams = useMemo(() => ({
    status: status === "all" ? undefined : status,
    search: search.trim() || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  }), [from, search, status, to]);
  const { data: appointments, isLoading, isError } = useGetAppointments(queryParams);
  const { data: summary } = useGetAppointmentSummary();
  const { data: details, isLoading: detailsLoading } = useGetAppointment(selectedId, {
    query: { enabled: !!selectedId },
  });
  const createAppointment = useCreateAppointment();
  const issuePass = useIssueAppointmentPass();
  const retrySms = useRetryAppointmentSms();
  const approveAction = useAppointmentAction("approve");
  const updateAction = useAppointmentAction(actionDialog?.action ?? "cancel");

  useEffect(() => {
    if (settings?.timezone) setForm((current) => ({ ...current, timezone: settings.timezone }));
  }, [settings?.timezone]);

  if (user?.role !== "admin") return <Redirect to="/" />;

  const isReadOnly = subscription?.subscription.readOnly ?? false;
  const hosts = users?.filter((staff) => staff.role !== "superadmin") ?? [];

  const notifyError = (error: unknown) => toast({
    variant: "destructive",
    title: "Request failed",
    description: error instanceof Error ? error.message : "The request could not be completed.",
  });

  const resetCreateForm = () => {
    setForm({
      visitorName: "",
      mobile: "",
      email: "",
      company: "",
      scheduledDate: "",
      scheduledTime: "",
      timezone: settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Kolkata",
      purpose: "",
      meetingPerson: "",
      meetingPersonId: "",
      department: "",
      notes: "",
    });
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const host = hosts.find((staff) => String(staff.id) === form.meetingPersonId);
    try {
      const created = await createAppointment.mutateAsync({
        ...form,
        meetingPerson: host?.name || form.meetingPerson,
        meetingPersonId: host?.id ?? null,
      });
      setLastShareableUrl(created.registrationUrl);
      setCreateOpen(false);
      resetCreateForm();
      toast({
        title: "Appointment created",
        description: created.sms === "sent"
          ? `${created.appointmentNumber} was created and the registration SMS was accepted.`
          : `${created.appointmentNumber} was created, but the registration SMS failed. Retry it from the SMS log.`,
        variant: created.sms === "sent" ? "default" : "destructive",
      });
      setSelectedId(created.id);
    } catch (error) {
      notifyError(error);
    }
  };

  const handleApprove = async (appointment: AppointmentListItem) => {
    try {
      const result = await approveAction.mutateAsync({ id: appointment.id, data: { reason: "" } });
      if (result.passUrl) setLastShareableUrl(result.passUrl);
      toast({
        title: "Appointment approved",
        description: result.sms === "sent" ? "A visitor record and QR pass have been created and SMS was accepted." : "A visitor record and QR pass have been created. Copy the pass link to share it.",
      });
      setSelectedId("");
    } catch (error) {
      notifyError(error);
    }
  };

  const handleAction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actionDialog) return;
    const data = actionDialog.action === "reschedule"
      ? { reason: actionReason, scheduledDate: rescheduleDate, scheduledTime: rescheduleTime }
      : { reason: actionReason };
    try {
      const result = await updateAction.mutateAsync({ id: actionDialog.id, data });
      if (result.passUrl) setLastShareableUrl(result.passUrl);
      toast({ title: actionDialog.action === "reject" ? "Application rejected" : actionDialog.action === "cancel" ? "Appointment cancelled" : "Appointment rescheduled" });
      setActionDialog(null);
      setSelectedId("");
      setActionReason("");
    } catch (error) {
      notifyError(error);
    }
  };

  const handleRetry = async (logId: number) => {
    try {
      const result = await retrySms.mutateAsync(logId);
      if (result.registrationUrl) setLastShareableUrl(result.registrationUrl);
      if (result.passUrl) setLastShareableUrl(result.passUrl);
      toast({
        title: result.sms === "sent" ? "SMS retry accepted" : "SMS retry failed",
        description: result.sms === "sent" ? "The failed notification was retried." : "MSG91 did not accept the retry.",
        variant: result.sms === "sent" ? "default" : "destructive",
      });
    } catch (error) {
      notifyError(error);
    }
  };

  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Appointment No.", "Visitor", "Mobile", "Email", "Company", "Purpose", "Host", "Department", "Scheduled At", "Status", "Visitor ID", "Check-in", "Check-out", "Duration", "ID Card No.", "ID Card Returned", "Checked-out By"],
      ...(appointments ?? []).map((appointment) => [
        appointment.appointmentNumber,
        appointment.visitorName,
        appointment.mobile,
        appointment.email,
        appointment.company,
        appointment.purpose,
        appointment.meetingPerson,
        appointment.department,
        new Date(appointment.scheduledAt).toLocaleString("en-IN", { timeZone: appointment.timezone }),
        appointment.status,
        appointment.visitor?.visitorId ?? "",
        appointment.visitor?.checkIn ? formatAppointmentDate(appointment.visitor.checkIn, appointment.timezone) : "",
        appointment.visitor?.checkOut ? formatAppointmentDate(appointment.visitor.checkOut, appointment.timezone) : "",
        appointment.visitor?.duration ?? "",
        appointment.visitor?.idCardNumber ?? "",
        appointment.visitor?.idCardReturned === null || appointment.visitor?.idCardReturned === undefined
          ? ""
          : appointment.visitor.idCardReturned ? "Yes" : "No",
        appointment.visitor?.checkedOutByEmail ?? "",
      ]),
    ];
    const content = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `appointments-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyRegistrationUrl = async () => {
    if (!lastShareableUrl) return;
    try {
      await navigator.clipboard.writeText(lastShareableUrl);
      toast({ title: "Link copied" });
    } catch (error) {
      notifyError(error);
    }
  };

  const handleIssuePass = async (appointmentId: string) => {
    try {
      const result = await issuePass.mutateAsync(appointmentId);
      setLastShareableUrl(result.passUrl);
      toast({ title: "Pass link generated", description: `${result.visitorPassNumber} is ready to share.` });
    } catch (error) {
      notifyError(error);
    }
  };

  const summaryCards = [
    { key: "pending", label: "Pending registration", value: summary?.pending ?? 0 },
    { key: "submitted", label: "Submitted applications", value: summary?.submitted ?? 0 },
    { key: "approved", label: "Approved", value: summary?.approved ?? 0 },
    { key: "checked_in", label: "Currently inside", value: summary?.checked_in ?? 0 },
    { key: "completed", label: "Completed", value: summary?.completed ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">Manage visitor registration, review, passes, check-in, and checkout.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!appointments?.length}><Download className="mr-2 h-4 w-4" />Export report</Button>
          <Button onClick={() => setCreateOpen(true)} disabled={isReadOnly}><Plus className="mr-2 h-4 w-4" />New appointment</Button>
        </div>
      </header>

      {lastShareableUrl && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">Shareable appointment link</p><p className="truncate text-xs text-muted-foreground">{lastShareableUrl}</p></div>
            <Button variant="outline" size="sm" onClick={copyRegistrationUrl}><Clipboard className="mr-2 h-4 w-4" />Copy link</Button>
            <Button variant="ghost" size="sm" onClick={() => setLastShareableUrl("")}><X className="h-4 w-4" /><span className="sr-only">Dismiss link</span></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map((item) => <Card key={item.key}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold">{item.value}</p></CardContent></Card>)}
      </div>

      <Card>
        <div className="border-b p-4">
          <div className="grid items-center gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(140px,0.8fr)_auto_minmax(200px,1.3fr)_minmax(190px,1fr)_minmax(190px,1fr)]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filter appointments by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["all", ...appointmentStatuses].map((item) => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item === "all" ? "All statuses" : item.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" onClick={() => { setStatus("all"); setSearch(""); setFrom(""); setTo(""); }}>Clear filters</Button>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search number, visitor, host…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm text-muted-foreground">From <Input className="min-w-0" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm text-muted-foreground">To <Input className="min-w-0" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Appointment</TableHead><TableHead>Visitor</TableHead><TableHead>Host</TableHead><TableHead>Scheduled</TableHead><TableHead>Status</TableHead><TableHead>Check-in / out</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 5 }, (_, index) => <TableRow key={index}><TableCell colSpan={7}><Skeleton className="h-7 w-full" /></TableCell></TableRow>)
                  : isError ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">Unable to load appointments. Refresh and try again.</TableCell></TableRow>
                    : !appointments?.length ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No appointments match these filters.</TableCell></TableRow>
                      : appointments.map((appointment) => (
                        <TableRow key={appointment.id} className="cursor-pointer" onClick={() => setSelectedId(appointment.id)}>
                          <TableCell><p className="font-medium">{appointment.appointmentNumber}</p><p className="text-xs text-muted-foreground">{appointment.purpose}</p></TableCell>
                          <TableCell><p>{appointment.visitorName}</p><p className="text-xs text-muted-foreground">{appointment.mobile}</p></TableCell>
                          <TableCell><p>{appointment.meetingPerson}</p><p className="text-xs text-muted-foreground">{appointment.department}</p></TableCell>
                          <TableCell>{formatAppointmentDate(appointment.scheduledAt, appointment.timezone)}</TableCell>
                          <TableCell><StatusBadge status={appointment.status} /></TableCell>
                          <TableCell className="text-xs"><p>{appointment.visitor?.checkIn ? formatAppointmentDate(appointment.visitor.checkIn, appointment.timezone) : "—"}</p><p>{appointment.visitor?.checkOut ? formatAppointmentDate(appointment.visitor.checkOut, appointment.timezone) : "—"}</p></TableCell>
                          <TableCell className="text-right"><Button variant="ghost" size="icon" aria-label="View appointment"><Eye className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>New appointment</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Visitor name"><Input required minLength={2} value={form.visitorName} onChange={(event) => setForm({ ...form, visitorName: event.target.value })} /></Field>
              <Field label="Mobile (10 digits)"><Input required pattern="[0-9]{10}" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} /></Field>
              <Field label="Email"><Input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="Company"><Input required value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></Field>
              <Field label="Appointment date"><Input required type="date" min={currentDateInTimezone(form.timezone)} value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} /></Field>
              <Field label="Appointment time"><Input required type="time" value={form.scheduledTime} onChange={(event) => setForm({ ...form, scheduledTime: event.target.value })} /></Field>
              <Field label="Timezone"><Input required value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></Field>
              <Field label="Department"><Input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></Field>
              <Field label="Host (optional)">
                <Select value={form.meetingPersonId || "manual"} onValueChange={(value) => {
                  const host = hosts.find((staff) => String(staff.id) === value);
                  setForm({ ...form, meetingPersonId: value === "manual" ? "" : value, meetingPerson: host?.name ?? "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose a host" /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">Enter host name</SelectItem>{hosts.map((host) => <SelectItem key={host.id} value={String(host.id)}>{host.name} · {host.email}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {!form.meetingPersonId && <Field label="Host name"><Input required value={form.meetingPerson} onChange={(event) => setForm({ ...form, meetingPerson: event.target.value })} /></Field>}
              <Field label="Purpose"><Input required minLength={2} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></Field>
            </div>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            <p className="text-xs text-muted-foreground">The visitor receives a secure registration link. A visitor record is created only after the application is approved.</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={createAppointment.isPending}><CalendarClock className="mr-2 h-4 w-4" />Create appointment</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{details?.appointment.appointmentNumber ?? "Appointment details"}</DialogTitle></DialogHeader>
          {detailsLoading || !details ? <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40 w-full" /></div> : (
            <div className="space-y-5">
              <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                <Detail label="Visitor" value={details.submission?.fullName ?? details.appointment.visitorName} />
                <Detail label="Mobile" value={details.submission?.mobile ?? details.appointment.mobile} />
                <Detail label="Company" value={details.submission?.company ?? details.appointment.company} />
                <Detail label="Scheduled" value={formatAppointmentDate(details.appointment.scheduledAt, details.appointment.timezone)} />
                <Detail label="Host" value={details.appointment.meetingPerson} />
                <Detail label="Department" value={details.appointment.department} />
                <Detail label="Status" value={details.appointment.status.replace(/_/g, " ")} />
                <Detail label="Purpose" value={details.appointment.purpose} />
                {details.submission && <>
                  <Detail label="Address" value={details.submission.fullAddress} />
                  <Detail label="ID proof" value={`${details.submission.idProofType.replace(/_/g, " ")} · ${details.submission.idProofNumber}`} />
                  {details.submission.additionalInformation && <Detail label="Additional information" value={details.submission.additionalInformation} />}
                  <div className="sm:col-span-2"><img src={details.submission.photoUrl} alt="Submitted visitor" className="h-40 w-40 rounded-md border object-cover" /></div>
                </>}
              </section>

              {details.visitor && <section className="rounded-lg border p-4">
                <h3 className="mb-3 font-semibold">Visitor access record</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <Detail label="Visitor ID" value={details.visitor.visitorId} />
                  <Detail label="Access status" value={details.visitor.status.replace(/_/g, " ")} />
                  <Detail label="Check-in time" value={details.visitor.checkIn ? formatAppointmentDate(details.visitor.checkIn, details.appointment.timezone) : "Not checked in"} />
                  <Detail label="Checkout time" value={details.visitor.checkOut ? formatAppointmentDate(details.visitor.checkOut, details.appointment.timezone) : "Not checked out"} />
                  <Detail label="Visit duration" value={details.visitor.duration ?? "—"} />
                  <Detail label="ID card number" value={details.visitor.idCardNumber ?? "Not assigned"} />
                  <Detail label="ID card returned" value={details.visitor.idCardReturned === null ? "Not checked out" : details.visitor.idCardReturned ? "Yes" : "No"} />
                  <Detail label="Checked out by" value={details.visitor.checkedOutByEmail ?? "—"} />
                  <Link className="text-primary underline" href={`/visitor-record/${details.visitor.id}`}>Open visitor history</Link>
                </div>
              </section>}

              {details.passes.length > 0 && <section><h3 className="mb-2 font-semibold">Pass history</h3><div className="space-y-2">{details.passes.map((pass) => <div key={pass.id} className="flex justify-between rounded-md border p-3 text-sm"><span>{pass.visitorPassNumber}</span><span>{pass.revokedAt ? "Revoked" : `Valid until ${new Date(pass.validUntil).toLocaleString()}`}</span></div>)}</div></section>}

              <section><h3 className="mb-2 font-semibold">SMS delivery log</h3>{details.smsLogs.length === 0 ? <p className="text-sm text-muted-foreground">No SMS messages sent.</p> : <div className="space-y-2">{details.smsLogs.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>{entry.messageType.replace(/_/g, " ")}</span><span className="capitalize">{entry.status} · {entry.attemptCount} attempt(s)</span>{entry.lastError && <p className="w-full text-xs text-destructive">{entry.lastError}</p>}{entry.status === "failed" && !isReadOnly && <Button size="sm" variant="outline" onClick={() => handleRetry(entry.id)} disabled={retrySms.isPending}>Retry</Button>}</div>)}</div>}</section>

              <section><h3 className="mb-2 font-semibold">Appointment history</h3><div className="max-h-40 space-y-2 overflow-y-auto">{details.audit.map((entry) => <div key={entry.id} className="border-l-2 pl-3 text-sm"><p className="font-medium">{entry.action.replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{entry.details} · {new Date(entry.createdAt).toLocaleString()}</p></div>)}</div></section>

              {!isReadOnly && <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {details.visitor && ["approved", "checked_in"].includes(details.appointment.status) && <Button variant="outline" onClick={() => handleIssuePass(details.appointment.id)} disabled={issuePass.isPending}><Clipboard className="mr-2 h-4 w-4" />Generate pass link</Button>}
                {details.appointment.status === "submitted" && <>
                  <Button variant="destructive" onClick={() => { setActionDialog({ id: details.appointment.id, action: "reject" }); setActionReason(""); }}>Reject</Button>
                  <Button onClick={() => handleApprove(details.appointment)} disabled={approveAction.isPending}><Check className="mr-2 h-4 w-4" />Approve and issue pass</Button>
                </>}
                {["pending", "submitted", "approved"].includes(details.appointment.status) && <>
                  <Button variant="outline" onClick={() => { setActionDialog({ id: details.appointment.id, action: "reschedule" }); setActionReason(""); setRescheduleDate(""); setRescheduleTime(""); }}>Reschedule</Button>
                  <Button variant="destructive" onClick={() => { setActionDialog({ id: details.appointment.id, action: "cancel" }); setActionReason(""); }}><X className="mr-2 h-4 w-4" />Cancel</Button>
                </>}
              </div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{actionDialog?.action === "reject" ? "Reject application" : actionDialog?.action === "cancel" ? "Cancel appointment" : "Reschedule appointment"}</DialogTitle></DialogHeader>
          <form onSubmit={handleAction} className="space-y-4">
            {actionDialog?.action === "reschedule" && <div className="grid grid-cols-2 gap-3"><Field label="New date"><Input required type="date" min={currentDateInTimezone(details?.appointment.timezone ?? form.timezone)} value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></Field><Field label="New time"><Input required type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} /></Field></div>}
            <Field label={actionDialog?.action === "reject" ? "Rejection reason" : actionDialog?.action === "cancel" ? "Cancellation reason" : "Reason"}><Textarea required minLength={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setActionDialog(null)}>Close</Button><Button type="submit" disabled={updateAction.isPending}>Confirm</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="break-words text-sm font-medium">{value}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "completed" ? "default" : status === "rejected" || status === "cancelled" || status === "expired" ? "destructive" : "outline";
  return <Badge variant={variant} className="capitalize">{status.replace(/_/g, " ")}</Badge>;
}

function formatAppointmentDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function currentDateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
