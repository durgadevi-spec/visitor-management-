import { 
  useGetNotifications, 
  getGetNotificationsQueryKey,
  useMarkNotificationRead,
  useMarkAllNotificationsRead
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCircle2, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey()
    }
  });

  const markReadMutation = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      }
    }
  });

  const markAllReadMutation = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      }
    }
  });

  const getIcon = (type: string) => {
    switch(type) {
      case "info": return <Info className="h-5 w-5 text-blue-400" />;
      case "success": return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
      case "danger": return <ShieldAlert className="h-5 w-5 text-red-500" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate({ id });
  };

  const handleMarkAll = () => {
    markAllReadMutation.mutate();
  };

  const unreadCount = notifications?.filter(n => !n.readStatus).length || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Alert Center
          </h1>
          <p className="text-sm text-muted-foreground">System notifications and action items.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={markAllReadMutation.isPending}>
            <Check className="mr-2 h-4 w-4" /> Mark All Read
          </Button>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0 divide-y divide-border">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-4 flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))
          ) : notifications?.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <Bell className="h-12 w-12 text-muted mb-4 opacity-50" />
              <p>No notifications at this time.</p>
            </div>
          ) : (
            notifications?.map((notification) => (
              <div 
                key={notification.id} 
                className={cn(
                  "p-4 flex gap-4 transition-colors hover:bg-muted/10",
                  !notification.readStatus ? "bg-muted/5 border-l-2 border-l-primary" : ""
                )}
              >
                <div className="shrink-0 mt-1">
                  <div className="h-10 w-10 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
                    {getIcon(notification.type)}
                  </div>
                </div>
                <div className="flex-1">
                  <p className={cn("text-sm", !notification.readStatus ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
                    {format(new Date(notification.createdAt), "MMM d, HH:mm:ss")}
                  </p>
                </div>
                {!notification.readStatus && (
                  <Button variant="ghost" size="icon" onClick={() => handleMarkRead(notification.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
