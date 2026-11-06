import { ShieldAlert, ShieldCheck, LogOut, LayoutDashboard, Users, UserPlus, FileBarChart, Bell, Settings, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useGetNotifications } from "@/lib/api-client";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { data: notifications } = useGetNotifications();
  const unreadCount = notifications?.filter((notification) => !notification.readStatus).length ?? 0;

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["admin", "security", "employee"] },
    { name: "Check-in", href: "/check-in", icon: UserPlus, roles: ["admin", "security"] },
    { name: "Visitors", href: "/visitors", icon: Users, roles: ["admin", "security", "employee"] },
    { name: "Reports", href: "/reports", icon: FileBarChart, roles: ["admin", "security"] },
    { name: "Blacklist", href: "/blacklist", icon: ShieldAlert, roles: ["admin", "security"] },
    { name: "Users", href: "/users", icon: Shield, roles: ["admin"] },
    { name: "Notifications", href: "/notifications", icon: Bell, roles: ["admin", "security", "employee"] },
    { name: "Settings", href: "/settings", icon: Settings, roles: ["admin"] },
  ];

  const allowedNav = navigation.filter(item => user && item.roles.includes(user.role));

  return (
    <aside className="flex h-full min-h-0 w-52 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="relative isolate flex h-32 shrink-0 items-center overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 px-5 text-white">
        <div className="relative z-10 flex items-center gap-3">
          <ShieldCheck className="h-10 w-10 shrink-0" />
          <div>
            <div className="font-heading text-2xl font-bold tracking-tight">VMS</div>
            <div className="text-[10px] font-medium tracking-wide text-blue-100">Visitor Management</div>
          </div>
        </div>
        <div aria-hidden="true" className="absolute -bottom-7 -left-5 h-12 w-[120%] rounded-[50%] bg-sidebar" />
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-hidden px-2 pb-4 pt-3">
        <nav className="space-y-1.5">
          {allowedNav.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent/70",
                  isActive
                    ? "bg-gradient-to-r from-blue-100 to-sky-50 text-blue-700 shadow-sm dark:from-blue-950 dark:to-slate-900 dark:text-sky-300"
                    : "text-sidebar-foreground hover:text-foreground"
                )}
              >
                {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-blue-600" />}
                <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-blue-600 dark:text-sky-400" : "text-sidebar-foreground")} />
                <span className="flex-1">{item.name}</span>
                {item.name === "Notifications" && unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-sidebar-border bg-gradient-to-r from-sky-50/80 to-sidebar p-3 dark:from-slate-900">
        <div className="flex items-center gap-2 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-sky-300">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="truncate text-sm font-medium text-foreground">{user?.name}</div>
            <div className="truncate text-xs text-muted-foreground capitalize">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
