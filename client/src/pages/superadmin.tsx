import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { Building2, Check, ChevronRight, CircleDollarSign, Loader2, X } from "lucide-react";
import { PLANS, type BillingCycle, type PlanId } from "../../../shared/plans";
import { useAuth } from "@/contexts/AuthContext";
import {
  getGetSuperAdminOrganizationsQueryKey,
  getGetSuperAdminPlanRequestsQueryKey,
  useCreateSuperAdminInvoice,
  useGetSuperAdminOrganization,
  useGetSuperAdminOrganizations,
  useGetSuperAdminPlanRequests,
  useReviewSuperAdminPlanRequest,
  useUpdateSuperAdminSubscription,
} from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground";
const planIds: PlanId[] = ["starter", "business", "enterprise"];

export default function SuperAdmin() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<PlanId>("business");
  const [status, setStatus] = useState<"trial" | "active" | "past_due" | "canceled" | "expired">("active");
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<"pending" | "paid">("pending");
  const { data: organizations, isLoading: organizationsLoading, isError: organizationsError } = useGetSuperAdminOrganizations();
  const { data: requests, isLoading: requestsLoading, isError: requestsError } = useGetSuperAdminPlanRequests();
  const { data: detail, isLoading: detailLoading } = useGetSuperAdminOrganization(selectedId ?? 0, {
    query: { enabled: selectedId !== null },
  });

  const invalidateAdminData = () => {
    void queryClient.invalidateQueries({ queryKey: getGetSuperAdminOrganizationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSuperAdminPlanRequestsQueryKey() });
    if (selectedId !== null) {
      void queryClient.invalidateQueries({ queryKey: ["/api/superadmin/organizations", selectedId] });
    }
  };

  const reviewRequest = useReviewSuperAdminPlanRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Plan request updated") });
        invalidateAdminData();
      },
      onError: (error) => toast({ title: t("Unable to update plan request"), description: t(error.error), variant: "destructive" }),
    },
  });
  const updateSubscription = useUpdateSuperAdminSubscription({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Subscription updated") });
        invalidateAdminData();
      },
      onError: (error) => toast({ title: t("Unable to update subscription"), description: t(error.error), variant: "destructive" }),
    },
  });
  const createInvoice = useCreateSuperAdminInvoice({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Invoice recorded") });
        setInvoiceAmount("");
        setInvoiceDescription("");
        invalidateAdminData();
      },
      onError: (error) => toast({ title: t("Unable to record invoice"), description: t(error.error), variant: "destructive" }),
    },
  });

  useEffect(() => {
    if (!detail?.subscription) return;
    setPlanId(detail.subscription.planId);
    setStatus(detail.subscription.status as typeof status);
    setCycle(detail.subscription.billingCycle);
  }, [detail?.subscription]);

  if (user?.role !== "superadmin") return <Redirect to="/" />;

  const saveSubscription = () => {
    if (selectedId === null) return;
    updateSubscription.mutate({ organizationId: selectedId, planId, status, billingCycle: cycle });
  };

  const submitInvoice = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedId === null) return;
    const amountRupees = Number(invoiceAmount);
    if (!Number.isSafeInteger(amountRupees) || amountRupees <= 0 || !invoiceDescription.trim()) {
      toast({ title: t("Enter a valid invoice amount and description"), variant: "destructive" });
      return;
    }
    createInvoice.mutate({
      organizationId: selectedId,
      amountRupees,
      description: invoiceDescription.trim(),
      status: invoiceStatus,
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 text-sm font-medium text-primary"><Building2 className="h-4 w-4" />{t("Platform administration")}</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Organizations and subscriptions")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("Review tenant accounts, plan requests, manual billing, and subscription status.")}</p>
      </header>

      <Card>
        <CardHeader><CardTitle>{t("Pending plan requests")}</CardTitle></CardHeader>
        <CardContent>
          {requestsError ? (
            <p role="alert" className="text-sm text-destructive">{t("Plan requests could not be loaded.")}</p>
          ) : requestsLoading ? (
            <p className="text-sm text-muted-foreground">{t("Loading requests...")}</p>
          ) : !requests?.some((request) => request.status === "pending") ? (
            <p className="text-sm text-muted-foreground">{t("There are no pending plan requests.")}</p>
          ) : (
            <div className="space-y-3">
              {requests.filter((request) => request.status === "pending").map((request) => (
                <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{request.organizationName} · {t(PLANS[request.requestedPlanId].name)}</p>
                    <p className="text-xs text-muted-foreground">{request.requesterName} ({request.requesterEmail}) · {t(request.billingCycle)} · {new Date(request.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => reviewRequest.mutate({ id: request.id, action: "approve" })} disabled={reviewRequest.isPending}>
                      <Check className="mr-1 h-4 w-4" />{t("Approve")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reviewRequest.mutate({ id: request.id, action: "decline" })} disabled={reviewRequest.isPending}>
                      <X className="mr-1 h-4 w-4" />{t("Decline")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>{t("Organizations")}</CardTitle></CardHeader>
          <CardContent>
            {organizationsError ? (
              <p role="alert" className="text-sm text-destructive">{t("Organizations could not be loaded.")}</p>
            ) : organizationsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Loading organizations...")}</div>
            ) : !organizations?.length ? (
              <p className="text-sm text-muted-foreground">{t("No organizations have registered yet.")}</p>
            ) : (
              <div className="space-y-2">
                {organizations.map((organization) => (
                  <button
                    key={organization.id}
                    type="button"
                    onClick={() => setSelectedId(organization.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === organization.id ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{organization.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{organization.contactEmail ?? organization.slug}</p>
                    </div>
                    <div className="hidden text-right text-xs sm:block">
                      <p>{organization.planId ? t(PLANS[organization.planId].name) : t("No plan")}</p>
                      <p className="text-muted-foreground">{organization.staffUsers} {t("users")} · {organization.totalVisitors} {t("visitors")}</p>
                    </div>
                    <Badge variant={organization.subscriptionStatus === "active" || organization.subscriptionStatus === "trial" ? "secondary" : "destructive"}>
                      {t(organization.subscriptionStatus ?? "unconfigured")}
                    </Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{selectedId === null ? t("Organization details") : t("Manage organization")}</CardTitle></CardHeader>
          <CardContent>
            {selectedId === null ? (
              <p className="text-sm text-muted-foreground">{t("Select an organization to review its users, invoices, and subscription.")}</p>
            ) : detailLoading || !detail ? (
              <p className="text-sm text-muted-foreground">{t("Loading organization details...")}</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold">{detail.organization.name}</h3>
                  <p className="text-sm text-muted-foreground">{detail.organization.contactEmail ?? t("No contact email")}</p>
                  <p className="text-xs text-muted-foreground">{t("Created")} {new Date(detail.organization.createdAt).toLocaleDateString()}</p>
                </div>

                <div className="space-y-3 rounded-lg border border-border p-3">
                  <h4 className="font-medium">{t("Subscription controls")}</h4>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select className={selectClass} value={planId} onChange={(event) => setPlanId(event.target.value as PlanId)} aria-label={t("Plan")}>
                      {planIds.map((id) => <option key={id} value={id}>{t(PLANS[id].name)}</option>)}
                    </select>
                    <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label={t("Status")}>
                      {["trial", "active", "past_due", "canceled", "expired"].map((item) => <option key={item} value={item}>{t(item)}</option>)}
                    </select>
                    <select className={selectClass} value={cycle} onChange={(event) => setCycle(event.target.value as BillingCycle)} aria-label={t("Billing cycle")}>
                      <option value="annual">{t("Yearly")}</option>
                      <option value="monthly">{t("Monthly")}</option>
                    </select>
                  </div>
                  <Button onClick={saveSubscription} disabled={updateSubscription.isPending}>
                    {updateSubscription.isPending ? t("Saving...") : t("Save subscription")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">{t("Organization users")} ({detail.users.length})</h4>
                  {detail.users.map((member) => (
                    <div key={member.id} className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{member.name}</span><span className="text-muted-foreground">{t(member.role)}</span>
                    </div>
                  ))}
                </div>

                <form onSubmit={submitInvoice} className="space-y-3 rounded-lg border border-border p-3">
                  <h4 className="flex items-center gap-2 font-medium"><CircleDollarSign className="h-4 w-4" />{t("Record manual invoice")}</h4>
                  <input className={selectClass + " w-full"} type="number" min="1" step="1" required value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} placeholder={t("Amount in INR")} />
                  <input className={selectClass + " w-full"} value={invoiceDescription} onChange={(event) => setInvoiceDescription(event.target.value)} required maxLength={500} placeholder={t("Invoice description")} />
                  <div className="flex items-center gap-3">
                    <select className={selectClass} value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value as typeof invoiceStatus)}>
                      <option value="pending">{t("Pending")}</option><option value="paid">{t("Paid")}</option>
                    </select>
                    <Button type="submit" disabled={createInvoice.isPending}>{createInvoice.isPending ? t("Saving...") : t("Create invoice")}</Button>
                  </div>
                </form>

                <div className="space-y-2">
                  <h4 className="font-medium">{t("Invoices")} ({detail.invoices.length})</h4>
                  {detail.invoices.map((invoice) => (
                    <div key={invoice.id} className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{invoice.invoiceNumber}</span>
                      <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(invoice.amountPaise / 100)} · {t(invoice.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
