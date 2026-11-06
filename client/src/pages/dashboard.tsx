import { 
  useGetDashboardStats, 
  useGetRecentVisitors, 
  useGetActivityFeed,
  getGetDashboardStatsQueryKey,
  getGetRecentVisitorsQueryKey,
  getGetActivityFeedQueryKey
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Activity, Clock, LogIn, Users, CheckCircle2, UserCheck, ShieldAlert } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";

export default function Dashboard() {
  const reduceMotion = useReducedMotion();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });

  const { data: recentVisitors, isLoading: visitorsLoading } = useGetRecentVisitors({
    query: { queryKey: getGetRecentVisitorsQueryKey() }
  });

  const { data: activities, isLoading: activityLoading } = useGetActivityFeed({
    query: { queryKey: getGetActivityFeedQueryKey() }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "checked_in": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "checked_out": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "rejected": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "approved": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mission Control</h1>
        <div className="text-sm text-muted-foreground">{format(new Date(), "PPpp")}</div>
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
            alt="Reception team welcoming visitors"
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
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Today</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.totalToday || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">+{(stats?.totalThisWeek || 0)} this week</p>
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
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Inside Now</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.visitorsInside || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently on premises</p>
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
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.pendingApprovals || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting security clearance</p>
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
            alt="Visitors waiting at a reception desk"
            className="h-28 w-full object-cover object-center"
          />
        </motion.div>
      </div>

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
              <CardTitle className="text-lg font-semibold text-foreground">Live Manifest</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                {visitorsLoading ? (
                  Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : recentVisitors?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No recent visitors</div>
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
                          <Link href={`/visitor/${visitor.id}`} className="font-medium text-foreground hover:underline">
                            {visitor.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">ID: <span className="font-mono text-primary/80">{visitor.visitorId}</span></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div className="text-xs text-muted-foreground">
                          <div>Meeting: <span className="text-foreground">{visitor.personToMeet}</span></div>
                          <div className="mt-1">
                            {visitor.status === "checked_in" && visitor.checkIn
                              ? `Check-in: ${format(new Date(visitor.checkIn), "MMM d, HH:mm")}`
                              : visitor.status === "checked_out" && visitor.checkOut
                                ? `Check-out: ${format(new Date(visitor.checkOut), "MMM d, HH:mm")}`
                                : `Registered: ${format(new Date(visitor.createdAt), "MMM d, HH:mm")}`}
                          </div>
                        </div>
                        <Badge variant="outline" className={getStatusColor(visitor.status)}>
                          {visitor.status.replace("_", " ")}
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
              <CardTitle className="text-lg font-semibold text-foreground">Activity Stream</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                {activityLoading ? (
                  Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : activities?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No recent activity</div>
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
                          {activity.message}
                        </span>
                        <span className="text-xs text-muted-foreground/70 mt-1">
                          {format(new Date(activity.timestamp), "HH:mm:ss")}
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
