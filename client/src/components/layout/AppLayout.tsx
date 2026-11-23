import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useGetSubscription } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const { data: subscription } = useGetSubscription({
    query: { enabled: !!user && user.role !== "superadmin" },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0">
          <Header />
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="mx-auto max-w-7xl">
            {subscription && (subscription.subscription.readOnly || subscription.subscription.status === "trial" || (
              subscription.plan.limits.visitorsPerMonth !== null &&
              subscription.usage.visitorsThisMonth >= Math.ceil(subscription.plan.limits.visitorsPerMonth * 0.8)
            )) && (
              <div className={`mb-5 flex flex-col gap-2 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
                subscription.subscription.readOnly
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300"
              }`}>
                <span>
                  {subscription.subscription.readOnly
                    ? t("Your subscription is read-only. You can view and export data, but editing is disabled.")
                    : subscription.subscription.status === "trial"
                      ? t("Your Business plan trial is active. Review plans before the trial ends.")
                      : t("You have used at least 80% of your monthly visitor allowance.")}
                </span>
                <Link href="/billing" className="shrink-0 font-semibold underline underline-offset-4">{t("View billing")}</Link>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
