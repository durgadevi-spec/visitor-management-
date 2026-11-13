import { 
  useGetDashboardStats, 
  useGetRecentVisitors, 
  useGetActivityFeed,
  useGetVisitors,
  getGetDashboardStatsQueryKey,
  getGetRecentVisitorsQueryKey,
  getGetActivityFeedQueryKey
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, LogIn, Users, CheckCircle2, UserCheck, ShieldAlert, Printer } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export default function Dashboard() {
  const reduceMotion = useReducedMotion();
  const { t, formatDate } = useLanguage();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });

  const { data: recentVisitors, isLoading: visitorsLoading } = useGetRecentVisitors({
    query: { queryKey: getGetRecentVisitorsQueryKey() }
  });

  const { data: activities, isLoading: activityLoading } = useGetActivityFeed({
    query: { queryKey: getGetActivityFeedQueryKey() }
  });

  const {
    isFetching: insideVisitorsFetching,
    isLoading: insideVisitorsLoading,
    refetch: refetchVisitorsInside,
  } = useGetVisitors({ status: "checked_in" });

  const printEmergencyRollCall = async () => {
    if (insideVisitorsLoading || insideVisitorsFetching) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.alert(t("Allow pop-ups for this site to print the emergency roll-call report."));
      return;
    }

    const result = await refetchVisitorsInside();
    if (result.isError || !result.data) {
      printWindow.close();
      window.alert(`${t("Unable to load the current visitor list:")} ${result.error?.message ?? t("No visitor data was returned.")}`);
      return;
    }

    const visitorsInside = result.data;
    const rows = visitorsInside.map((visitor) => `
      <tr>
        <td>${escapeHtml(visitor.name)}</td>
        <td>${escapeHtml(visitor.personToMeet)}</td>
        <td>${visitor.checkIn ? escapeHtml(formatDate(new Date(visitor.checkIn), "PPpp")) : t("Not recorded")}</td>
      </tr>
    `).join("");
    const generatedAt = escapeHtml(formatDate(new Date(), "PPpp"));

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="${document.documentElement.lang}">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${t("Emergency Roll Call")}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
            h1 { margin: 0 0 8px; }
            p { margin: 0 0 20px; color: #444; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #999; padding: 10px; text-align: left; }
            th { background: #eee; }
            @media print { body { margin: 16mm; } }
          </style>
        </head>
        <body>
          <h1>${t("Emergency Roll Call")}</h1>
          <p>${t("Generated:")} ${generatedAt} | ${t("Visitors currently inside:")} ${visitorsInside.length}</p>
          <table>
            <thead><tr><th>${t("Visitor Name")}</th><th>${t("Host")}</th><th>${t("Check-in Time")}</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="3">${t("No visitors are currently checked in.")}</td></tr>`}</tbody>
          </table>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "checked_in": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "checked_out": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "rejected": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "approved": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "scheduled": return "bg-amber-500/20 text-amber-500 border-amber-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "check_in": return <LogIn className="h-4 w-4 text-blue-400" />;
      case "check_out": return <Activity className="h-4 w-4 text-green-400" />;
      case "approval": return <CheckCircle2 className="h-4 w-4 text-purple-400" />;
      case "rejection": return <Activity className="h-4 w-4 text-red-400" />;
      case "blacklist": return <ShieldAlert className="h-4 w-4 text-destructive" />;
      default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-5">
      <motion.div
        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("Mission Control")}</h1>
        <div className="text-sm text-muted-foreground">{formatDate(new Date(), "PPpp")}</div>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <motion.div
          className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-r from-sky-50 to-blue-50/60 px-3 dark:from-slate-900 dark:to-slate-800"
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -2, 0] }}
          transition={reduceMotion
            ? { duration: 0 }
            : { opacity: { duration: 0.3, delay: 0.04 }, y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } }}
        >
          <img
            src="/dashboard-office-illustration.png"
            alt={t("Reception team welcoming visitors")}
            className="h-28 w-full object-contain"
          />
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.04 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
        >
        <Card className="h-full border-border bg-card transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("Total Today")}</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.totalToday || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">+{(stats?.totalThisWeek || 0)} {t("this week")}</p>
          </CardContent>
        </Card>
        </motion.div>
        
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.08 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
        >
        <Card className="h-full border-border bg-card transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("Inside Now")}</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.visitorsInside || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t("Currently on premises")}</p>
          </CardContent>
        </Card>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.12 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
        >
        <Card className="h-full border-border bg-card transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("Pending")}</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.pendingApprovals || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t("Awaiting security clearance")}</p>
          </CardContent>
        </Card>
        </motion.div>

        <motion.div
          className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-r from-sky-50 to-blue-50/60 px-3 dark:from-slate-900 dark:to-slate-800"
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -2, 0] }}
          transition={reduceMotion
            ? { duration: 0 }
            : { opacity: { duration: 0.3, delay: 0.16 }, y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.35 } }}
        >
          <img
            src="/dashboard-lobby-illustration.png"
            alt={t("Visitors waiting at a reception desk")}
            className="h-28 w-full object-cover object-center"
          />
        </motion.div>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{t("Emergency Roll Call")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Print the current list of visitors on the premises")}
            </p>
          </div>
          <Button onClick={printEmergencyRollCall} disabled={insideVisitorsLoading || insideVisitorsFetching}>
            <Printer className="mr-2 h-4 w-4" />
            {insideVisitorsLoading || insideVisitorsFetching ? t("Loading visitors...") : t("Print Roll Call")}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-7">
        {/* Recent Visitors */}
        <motion.div
          className="lg:col-span-4"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.18 }}
        >
          <Card className="h-full border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-foreground">{t("Live Manifest")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                {visitorsLoading ? (
                  Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : recentVisitors?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">{t("No recent visitors")}</div>
                ) : (
                  recentVisitors?.map((visitor, index) => (
                    <motion.div
                      key={visitor.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/50 bg-background/50 p-3 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                      initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.25, delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.24) }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 text-primary font-bold">
                          {visitor.name.charAt(0)}
                        </div>
                        <div>
                          <Link href={`/visitor-record/${visitor.id}`} className="font-medium text-foreground hover:underline">
                            {visitor.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{t("ID:")} <span className="font-mono text-primary/80">{visitor.visitorId}</span></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div className="text-xs text-muted-foreground">
                          <div>{t("Meeting:")} <span className="text-foreground">{visitor.personToMeet}</span></div>
                          <div className="mt-1">
                            {visitor.status === "checked_in" && visitor.checkIn
                              ? `${t("Check-in:")} ${formatDate(new Date(visitor.checkIn), "MMM d, HH:mm")}`
                              : visitor.status === "checked_out" && visitor.checkOut
                                ? `${t("Check-out:")} ${formatDate(new Date(visitor.checkOut), "MMM d, HH:mm")}`
                                : `${t("Registered:")} ${formatDate(new Date(visitor.createdAt), "MMM d, HH:mm")}`}
                          </div>
                        </div>
                        <Badge variant="outline" className={getStatusColor(visitor.status)}>
                          {t(visitor.status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))}
                        </Badge>
                      </div>
                    </motion.div>
                  ))
                )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Activity Feed */}
        <motion.div
          className="lg:col-span-3"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.22 }}
        >
          <Card className="h-full border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-foreground">{t("Activity Stream")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                {activityLoading ? (
                  Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : activities?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">{t("No recent activity")}</div>
                ) : (
                  activities?.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      className="flex gap-3"
                      initial={reduceMotion ? false : { opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.25, delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.24) }}
                    >
                      <div className="mt-1 flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-background border border-border flex items-center justify-center">
                          {getActivityIcon(activity.type)}
                        </div>
                      </div>
                      <div className="flex flex-col flex-1">
                        <span className="text-sm font-medium text-foreground">
                          {activity.visitorName}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t(activity.message)}
                        </span>
                        <span className="text-xs text-muted-foreground/70 mt-1">
                          {formatDate(new Date(activity.timestamp), "HH:mm:ss")}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
