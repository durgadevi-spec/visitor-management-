import { useEffect, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { ArrowLeft, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  type DailyReconciliationVisitor,
  useGetDailyReconciliation,
  useGetSubscription,
  useGetSystemSettings,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const cardStatusLabels: Record<DailyReconciliationVisitor["cardStatus"], string> = {
  not_issued: "Card not issued",
  returned: "Returned",
  not_returned: "Not returned (checkout blocked)",
  unverified: "Return not verified",
  inside: "Visitor still inside",
};

export default function Reconciliation() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { data: subscription, isLoading: subscriptionLoading, isError: subscriptionError } = useGetSubscription({
    query: { enabled: user?.role === "admin" },
  });
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useGetSystemSettings({
    query: { enabled: user?.role === "admin" },
  });
  const [date, setDate] = useState("");
  const { data: report, isLoading, isError, error } = useGetDailyReconciliation(date, {
    query: {
      enabled: !!date && user?.role === "admin" &&
        !!subscription?.plan.liveFeatures.includes("reconciliationStatement"),
    },
  });

  useEffect(() => {
    if (settings?.timezone) {
      setDate((current) => current || currentDateInTimezone(settings.timezone));
    }
  }, [settings?.timezone]);

  if (authLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/" />;
  if (subscriptionLoading || settingsLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-32 w-full" /></div>;
  }
  if (subscriptionError || settingsError) {
    return <Card className="border-destructive"><CardContent className="py-6 text-sm text-destructive">
      {t("Unable to load daily reconciliation settings. Refresh and try again.")}
    </CardContent></Card>;
  }
  if (!subscription?.plan.liveFeatures.includes("reconciliationStatement")) return <Redirect to="/" />;

  const today = settings ? currentDateInTimezone(settings.timezone) : undefined;

  const exportCsv = () => {
    if (!report) return;
    const quote = (value: unknown) => {
      const text = String(value ?? "");
      const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows: unknown[][] = [
      [t("Daily Reconciliation"), report.date, report.timezone],
      [t("Check-ins"), report.summary.checkIns],
      [t("Check-outs"), report.summary.checkOuts],
      [t("Manual checkouts"), report.summary.manualCheckouts],
      [t("Automatic checkouts"), report.summary.automaticCheckouts],
      [t("Still inside"), report.summary.visitorsInside],
      [t("ID cards issued"), report.summary.idCardsIssued],
      [t("ID cards returned"), report.summary.idCardsReturned],
      [t("Cards outstanding"), report.summary.idCardsOutstanding],
      [t("Blocked checkout attempts"), report.summary.blockedCheckoutAttempts],
      [],
      [
        t("Visitor ID"),
        t("Visitor"),
        t("Mobile"),
        t("ID card number"),
        t("Check-in"),
        t("Check-out"),
        t("ID card status"),
        t("Checked out by"),
        t("Blocked attempts"),
      ],
      ...report.visitors.map((visitor) => [
        visitor.visitorId,
        visitor.name,
        visitor.mobile,
        visitor.idCardNumber ?? t("Not recorded"),
        visitor.checkIn ? formatDateTime(visitor.checkIn, report.timezone) : "",
        visitor.checkOut ? formatDateTime(visitor.checkOut, report.timezone) : "",
        t(cardStatusLabels[visitor.cardStatus]),
        visitor.checkedOutByName ?? (visitor.checkedOutOnDate ? t("Automatic checkout") : ""),
        visitor.blockedCheckoutAttempts,
      ]),
    ];
    const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `daily-reconciliation-${report.date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const metrics = report ? [
    { label: t("Check-ins"), value: report.summary.checkIns },
    { label: t("Check-outs"), value: report.summary.checkOuts },
    { label: t("Still inside"), value: report.summary.visitorsInside },
    { label: t("ID cards issued"), value: report.summary.idCardsIssued },
    { label: t("ID cards returned"), value: report.summary.idCardsReturned },
    { label: t("Cards outstanding"), value: report.summary.idCardsOutstanding },
    { label: t("Blocked checkout attempts"), value: report.summary.blockedCheckoutAttempts },
  ] : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />{t("Dashboard")}
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{t("Daily Reconciliation")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Review daily check-ins, check-outs, and the return status of issued ID cards.")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t("Report date")}</span>
            <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
          </label>
          <Button variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="mr-2 h-4 w-4" />{t("Export CSV")}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("ID card reconciliation")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("Outstanding includes cards not confirmed as returned by the end of the selected day.")}
          </p>
        </CardHeader>
      </Card>

      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-sm text-destructive">
            {error?.message ?? t("Unable to load daily reconciliation.")}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {isLoading || !report
          ? Array.from({ length: 7 }, (_, index) => <Card key={index}><CardContent className="space-y-2 p-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-14" /></CardContent></Card>)
          : metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{t("Visitor check-in/out and ID card details")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Visitor")}</TableHead>
                  <TableHead>{t("ID card number")}</TableHead>
                  <TableHead>{t("Check-in")}</TableHead>
                  <TableHead>{t("Check-out")}</TableHead>
                  <TableHead>{t("ID card status")}</TableHead>
                  <TableHead>{t("Checked out by")}</TableHead>
                  <TableHead>{t("Blocked attempts")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index}><TableCell colSpan={7}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                )) : isError ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{t("Unable to load daily reconciliation.")}</TableCell></TableRow>
                ) : !report?.visitors.length ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t("No visitors or cards to reconcile for this date.")}</TableCell></TableRow>
                ) : report.visitors.map((visitor) => (
                  <TableRow key={visitor.id}>
                    <TableCell><p className="font-medium">{visitor.name}</p><p className="text-xs text-muted-foreground">{visitor.visitorId} · {visitor.mobile}</p></TableCell>
                    <TableCell>{visitor.idCardNumber ?? t("Not recorded")}</TableCell>
                    <TableCell>{visitor.checkIn ? formatDateTime(visitor.checkIn, report.timezone) : "—"}</TableCell>
                    <TableCell>{visitor.checkOut ? formatDateTime(visitor.checkOut, report.timezone) : "—"}</TableCell>
                    <TableCell className={visitor.cardOutstanding ? "font-medium text-destructive" : ""}>{t(cardStatusLabels[visitor.cardStatus])}</TableCell>
                    <TableCell>{visitor.checkedOutByName ?? (visitor.checkedOutOnDate ? t("Automatic checkout") : "—")}</TableCell>
                    <TableCell>{visitor.blockedCheckoutAttempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function currentDateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
