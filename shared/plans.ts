export type PlanId = "starter" | "business" | "enterprise";
export type BillingCycle = "monthly" | "annual";

export type LiveFeatureKey =
  | "walkInCheckIn"
  | "visitorPasses"
  | "qrScanning"
  | "visitorDirectory"
  | "preRegistration"
  | "csvReports"
  | "dashboards"
  | "blacklist"
  | "autoCheckout"
  | "approvals"
  | "notifications"
  | "companyBranding"
  | "languages"
  | "pdfReports"
  | "gadgets"
  | "mandatoryPhoto"
  | "appointments"
  | "reconciliationStatement"
  | "sms";

export const LIVE_FEATURE_LABELS: Record<LiveFeatureKey, string> = {
  walkInCheckIn: "Walk-in visitor check-in",
  visitorPasses: "QR visitor passes",
  qrScanning: "QR visitor pass scanning",
  visitorDirectory: "Visitor directory and searchable history",
  preRegistration: "Pre-registration with scheduled visit dates",
  csvReports: "CSV visitor reports",
  dashboards: "Dashboard and activity feed",
  blacklist: "Blacklist screening",
  autoCheckout: "Automatic end-of-day checkout",
  approvals: "Approvals",
  notifications: "In-app notifications",
  companyBranding: "Company name and logo on visitor passes",
  languages: "English and Tamil interface",
  pdfReports: "Downloadable PDF reports",
  gadgets: "Visitor gadget tracking",
  mandatoryPhoto: "Mandatory visitor photo capture",
  appointments: "Appointment booking and visitor registration",
  reconciliationStatement: "Daily visitor and ID card reconciliation",
  sms: "Appointment SMS notifications",
};

export interface PlannedFeature {
  key: string;
  label: string;
  status: "planned";
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  currency: "INR";
  monthlyPrice: number | null;
  annualMonthlyPrice: number | null;
  limits: {
    visitorsPerMonth: number | null;
    staffUsers: number | null;
    locations: number | null;
    auditRetentionDays: number | null;
  };
  liveFeatures: LiveFeatureKey[];
  plannedFeatures: PlannedFeature[];
}

const starterFeatures: LiveFeatureKey[] = [
  "walkInCheckIn",
  "visitorPasses",
  "visitorDirectory",
  "csvReports",
  "dashboards",
  "blacklist",
  "autoCheckout",
  "notifications",
  "companyBranding",
  "languages",
];

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    currency: "INR",
    monthlyPrice: 2499,
    annualMonthlyPrice: 1999,
    limits: {
      visitorsPerMonth: 1000,
      staffUsers: 5,
      locations: 1,
      auditRetentionDays: 30,
    },
    liveFeatures: starterFeatures,
    plannedFeatures: [],
  },
  business: {
    id: "business",
    name: "Business",
    currency: "INR",
    monthlyPrice: 4299,
    annualMonthlyPrice: 3499,
    limits: {
      visitorsPerMonth: 5000,
      staffUsers: 10,
      locations: 1,
      auditRetentionDays: 365,
    },
    liveFeatures: [
      ...starterFeatures,
      "pdfReports",
      "gadgets",
      "mandatoryPhoto",
      "approvals",
      "qrScanning",
      "appointments",
      "reconciliationStatement",
      "sms",
    ],
    plannedFeatures: [],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    currency: "INR",
    monthlyPrice: null,
    annualMonthlyPrice: null,
    limits: {
      visitorsPerMonth: null,
      staffUsers: null,
      locations: null,
      auditRetentionDays: null,
    },
    liveFeatures: [...starterFeatures, "pdfReports", "gadgets", "mandatoryPhoto", "approvals", "qrScanning", "appointments", "reconciliationStatement", "sms"],
    plannedFeatures: [],
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}

export function planHasFeature(planId: PlanId, feature: LiveFeatureKey): boolean {
  return PLANS[planId].liveFeatures.includes(feature);
}

export function getPlanPrice(planId: PlanId, cycle: BillingCycle): number | null {
  const plan = PLANS[planId];
  return cycle === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
}

export function getPlanMonthlyVisitLimit(planId: PlanId): number | null {
  return PLANS[planId].limits.visitorsPerMonth;
}

export function getPlanStaffLimit(planId: PlanId): number | null {
  return PLANS[planId].limits.staffUsers;
}
