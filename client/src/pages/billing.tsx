import { useState } from "react";
import { Link, Redirect } from "wouter";
import { Check, Clock3, CreditCard, Sparkles } from "lucide-react";
import { PLANS, LIVE_FEATURE_LABELS, type BillingCycle, type PlanId } from "../../../shared/plans";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGetSubscriptionInvoicesQueryKey,
  getGetSubscriptionQueryKey,
  useChangeSubscriptionPlan,
  useGetSubscription,
  useGetSubscriptionInvoices,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function limitLabel(value: number | null, unit: string, t: (text: string) => string) {
  return value === null ? t("Unlimited") : `${value.toLocaleString("en-IN")} ${t(unit)}`;
}

export default function Billing() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const { data: overview, isLoading, isError } = useGetSubscription();
  const { data: invoices, isLoading: invoicesLoading } = useGetSubscriptionInvoices({
    query: { enabled: user?.role === "admin" },
  });

  const planRequest = useChangeSubscriptionPlan({
    mutation: {
      onSuccess: (result) => {
        toast({ title: t("Plan request sent"), description: t(result.message) });
        void queryClient.invalidateQueries({ queryKey: getGetSubscriptionInvoicesQueryKey() });
      },
      onError: (error) => toast({
        title: t("Unable to request plan change"),
        description: t(error.error),
        variant: "destructive",
      }),
    },
  });

  if (user?.role !== "admin") return <Redirect to="/" />;

  if (isLoading) {
    return <div className="space-y-4"><div className="h-10 w-64 animate-pulse rounded bg-muted" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  }
  if (isError || !overview) {
    return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("Subscription details could not be loaded. Refresh and try again.")}</p>;
  }

  const { subscription, plan, usage } = overview;
  const visitorLimit = plan.limits.visitorsPerMonth;
  const visitorPercent = visitorLimit ? Math.min(100, Math.round(usage.visitorsThisMonth / visitorLimit * 100)) : 0;
  const staffLimit = plan.limits.staffUsers;
  const staffPercent = staffLimit ? Math.min(100, Math.round(usage.staffUsers / staffLimit * 100)) : 0;

  const requestPlan = (planId: PlanId) => {
    planRequest.mutate({ planId, billingCycle: cycle });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><CreditCard className="h-4 w-4" />{t("Plans and billing")}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Choose the right plan for your team")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("Manage your VMS plan, usage limits, and manual billing requests.")}</p>
        </div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">{t("Return to dashboard")}</Link>
      </header>

      <Card className={subscription.readOnly ? "border-destructive/40 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{overview.organization.name}</span>
              <Badge variant={subscription.readOnly ? "destructive" : "secondary"}>{t(subscription.status)}</Badge>
              <Badge variant="outline">{t(plan.name)}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscription.status === "trial" && subscription.trialEndsAt
                ? `${t("Business trial ends")} ${new Date(subscription.trialEndsAt).toLocaleDateString()}.`
                : subscription.currentPeriodEnd
                  ? `${t("Current period ends")} ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`
                  : t("Manual billing is managed by the VMS team.")}
            </p>
          </div>
        </CardContent>
      </Card>

      <section aria-label={t("Plan options")} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">{t("Available plans")}</h2>
          <div className="inline-flex w-fit rounded-lg border border-border bg-card p-1">
            {(["annual", "monthly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCycle(value)}
                className={`rounded-md px-3 py-2 text-sm font-medium ${cycle === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {value === "annual" ? t("Yearly") : t("Monthly")}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t("Save up to 20% with yearly billing.")}</p>

        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.values(PLANS)).map((item) => {
            const price = cycle === "annual" ? item.annualMonthlyPrice : item.monthlyPrice;
            const isCurrent = item.id === subscription.planId;
            return (
              <Card key={item.id} className={`flex h-full flex-col ${isCurrent ? "border-primary shadow-md" : "border-border"}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{t(item.name)}</CardTitle>
                    {isCurrent && <Badge>{t("Current plan")}</Badge>}
                  </div>
                  <p className="min-h-5 text-sm text-muted-foreground">
                    {item.id === "enterprise" ? t("For larger organizations") : t("Billed per organization")}
                  </p>
                  <div className="pt-2">
                    {price === null ? (
                      <span className="text-2xl font-bold">{t("Contact sales")}</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">{money.format(price)}</span>
                        <span className="ml-1 text-sm text-muted-foreground">{t("/ month")}</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {cycle === "annual" ? t("Billed annually") : t("Billed monthly")}
                          {cycle === "annual" && item.monthlyPrice && (
                            <span className="ml-1">
                              ({t("Save")} {Math.round((1 - (item.annualMonthlyPrice ?? 0) / item.monthlyPrice) * 100)}%)
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <div className="space-y-2 border-y border-border py-4 text-sm">
                    <p>{limitLabel(item.limits.visitorsPerMonth, "visitors / month", t)}</p>
                    <p>{limitLabel(item.limits.staffUsers, "staff users", t)}</p>
                    <p>{limitLabel(item.limits.locations, "locations", t)}</p>
                    <p>{limitLabel(item.limits.auditRetentionDays, "days audit retention", t)}</p>
                  </div>
                  <ul className="mt-4 flex-1 space-y-2">
                    {item.liveFeatures.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{t(LIVE_FEATURE_LABELS[feature])}</span>
                      </li>
                    ))}
                    {item.plannedFeatures.map((feature) => (
                      <li key={feature.key} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t(feature.label)} <Badge variant="outline" className="ml-1 align-middle">{t("Coming soon")}</Badge></span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5 w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={planRequest.isPending}
                    onClick={() => requestPlan(item.id)}
                  >
                    {planRequest.isPending ? t("Sending request...") : item.id === "enterprise" ? t("Request enterprise pricing") : isCurrent ? t("Request a billing change") : t("Request this plan")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t("Plan changes are reviewed manually. No online payment is collected in the app.")}</p>
      </section>

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList aria-label={t("Billing sections")}>
          <TabsTrigger value="usage">{t("Usage")}</TabsTrigger>
          <TabsTrigger value="invoices">{t("Invoices")}</TabsTrigger>
        </TabsList>
        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle>{t("Plan usage")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("Current usage compared with your plan limits.")}</p>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <UsageMeter
                label={t("Monthly visitors")}
                current={usage.visitorsThisMonth}
                limit={visitorLimit}
                unit={t("visitors")}
                percent={visitorPercent}
                unlimitedLabel={t("Unlimited")}
                formatNumber={(value) => value.toLocaleString("en-IN")}
              />
              <UsageMeter
                label={t("Staff users")}
                current={usage.staffUsers}
                limit={staffLimit}
                unit={t("staff users")}
                percent={staffPercent}
                unlimitedLabel={t("Unlimited")}
                formatNumber={(value) => value.toLocaleString("en-IN")}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="invoices">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{t("Invoices")}</CardTitle></CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <p className="text-sm text-muted-foreground">{t("Loading invoices...")}</p>
              ) : invoices?.length ? (
                <div className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-medium">{invoice.invoiceNumber}</p><p className="text-xs text-muted-foreground">{invoice.description} · {new Date(invoice.issuedAt).toLocaleDateString()}</p></div>
                      <div className="flex items-center gap-3"><span>{money.format(invoice.amountPaise / 100)}</span><Badge variant={invoice.status === "paid" ? "secondary" : "outline"}>{t(invoice.status)}</Badge></div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">{t("No invoices are available yet. Contact the VMS team for billing.")}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsageMeter({
  label,
  current,
  limit,
  unit,
  percent,
  unlimitedLabel,
  formatNumber,
}: {
  label: string;
  current: number;
  limit: number | null;
  unit: string;
  percent: number;
  unlimitedLabel: string;
  formatNumber: (value: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatNumber(current)} / {limit === null ? unlimitedLabel : `${formatNumber(limit)} ${unit}`}
        </span>
      </div>
      {limit !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(current, limit)}
        >
          <div
            className={`h-full rounded-full ${percent >= 80 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
