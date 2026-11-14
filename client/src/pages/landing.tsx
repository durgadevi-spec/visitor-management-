import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ClipboardCheck,
  Clock3,
  Mail,
  MessageCircle,
  QrCode,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SALES_WHATSAPP = "919962216493";
const SALES_EMAIL = "durgadevi@ctint.in";

function salesWhatsAppLink(message: string) {
  return `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

const features: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  image?: string;
  imageAlt?: string;
}> = [
  {
    icon: QrCode,
    title: "Quick check-in",
    description: "Register visitors, capture a photo, and issue a scannable visitor pass.",
    color: "from-[#a3b69a] to-[#708b74]",
  },
  {
    icon: UsersRound,
    title: "Know who's inside",
    description: "See current visitors, hosts, and visit status from one live dashboard.",
    color: "from-[#d8b27b] to-[#b98555]",
    image: "/landing/visitor-identity-check.png",
    imageAlt: "Visitor identity and records being reviewed",
  },
  {
    icon: ClipboardCheck,
    title: "Keep a clear record",
    description: "Review visitor history, activity records, and optional gadget declarations.",
    color: "from-[#a4b7a0] to-[#718c76]",
  },
  {
    icon: BarChart3,
    title: "Useful reports",
    description: "Filter visitor records and export detailed CSV or PDF reports.",
    color: "from-[#d7b27a] to-[#b66b50]",
  },
  {
    icon: Clock3,
    title: "Automatic checkout",
    description: "Set an end-of-day checkout time and timezone for visitors still inside.",
    color: "from-[#a4b7a0] to-[#718c76]",
  },
  {
    icon: ShieldCheck,
    title: "A familiar welcome",
    description: "Add your company name and logo to printable visitor passes.",
    color: "from-[#d8b27b] to-[#b98555]",
  },
];

const benefits = [
  "Visitor check-in and check-out tracking",
  "QR visitor passes and pass scanning",
  "Printable emergency roll call",
  "Searchable visitor records and exports",
];

function ProductPreview() {
  const reduceMotion = useReducedMotion();
  const { t } = useLanguage();

  return (
    <motion.div
      className="relative mx-auto w-full max-w-[620px]"
      initial={reduceMotion ? false : { opacity: 0, y: 22, rotate: 1.5 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut", delay: 0.15 }}
    >
      <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-[#aab99f]/35 via-[#d4b783]/20 to-[#bf7658]/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-[#dfe5dc] bg-[#fffefa]/95 p-3 shadow-[0_35px_100px_-35px_rgba(107,128,100,0.25)] backdrop-blur-xl sm:p-5">
        <div className="flex items-center justify-between border-b border-[#e2e7df] px-2 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8eee6] text-[#58755c]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#26372f]">{t("Visitor overview")}</div>
              <div className="text-[11px] text-[#78877b]">{t("Dashboard preview · Sample data")}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[#d5e0d2] bg-[#edf2eb] px-2.5 py-1 text-[10px] font-medium text-[#58755c]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#789277]" />
            {t("PREVIEW")}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 py-4 sm:gap-3">
          {[
            { label: t("Visitors today"), value: "24", icon: UsersRound, tint: "text-[#a95f46]" },
            { label: t("Inside now"), value: "08", icon: Check, tint: "text-[#58755c]" },
            { label: t("Avg. visit"), value: "42m", icon: Clock3, tint: "text-[#9b7147]" },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              className="rounded-xl border border-[#e5e9e2] bg-[#f3f5ef] p-3 sm:p-4"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.4 + index * 0.12, duration: reduceMotion ? 0 : 0.4 }}
            >
              <stat.icon className={`mb-3 h-4 w-4 ${stat.tint}`} />
              <div className="text-xl font-semibold tracking-tight text-[#26372f] sm:text-2xl">{stat.value}</div>
              <div className="mt-1 truncate text-[10px] text-[#78877b] sm:text-xs">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="rounded-xl border border-[#e5e9e2] bg-[#f8f8f4] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold text-[#26372f]">{t("Recent visitors")}</div>
            <div className="text-[10px] text-[#89968b]">{t("View all")}</div>
          </div>
          <div className="space-y-2.5">
            {[
              { initials: "AK", name: "Alex Kumar", host: t("Meeting with Maya"), status: t("Checked In"), color: "bg-[#f5ece5] text-[#a95f46]", statusColor: "text-[#58755c]" },
              { initials: "SR", name: "Sana Rao", host: t("Project discussion"), status: t("Checked In"), color: "bg-[#f3eee4] text-[#846345]", statusColor: "text-[#58755c]" },
              { initials: "JM", name: "Jordan Miller", host: t("Meeting with Chris"), status: t("Checked Out"), color: "bg-[#f6eee3] text-[#9b7242]", statusColor: "text-[#78877b]" },
            ].map((visitor, index) => (
              <motion.div
                key={visitor.initials}
                className="flex items-center gap-2.5 rounded-lg border border-[#eceee9] bg-[#f3f4ed] p-2.5 sm:gap-3"
                initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.72 + index * 0.13, duration: reduceMotion ? 0 : 0.4 }}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${visitor.color}`}>
                  {visitor.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-[#33473c]">{visitor.name}</div>
                  <div className="truncate text-[10px] text-[#89968b]">{visitor.host}</div>
                </div>
                <div className={`hidden text-[10px] sm:block ${visitor.statusColor}`}>{visitor.status}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="absolute -right-2 top-[38%] hidden items-center gap-2 rounded-xl border border-[#e2e7df] bg-white p-3 shadow-xl sm:flex"
          animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: reduceMotion ? 0 : 4, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut" }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9efea] text-[#627d65]">
            <BellRing className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[#26372f]">{t("Visitor checked in")}</div>
            <div className="text-[9px] text-[#78877b]">{t("Activity recorded")}</div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function Landing() {
  const reduceMotion = useReducedMotion();
  const { t } = useLanguage();
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoContactMethod, setDemoContactMethod] = useState<"whatsapp" | "email">("whatsapp");
  const reveal = reduceMotion
    ? { initial: false as const, whileInView: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 } };

  function submitDemoRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const company = String(formData.get("company") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const message = [
      "Hi, I would like to book a VMS demo.",
      `Name: ${name}`,
      company && `Company: ${company}`,
      email && `Email: ${email}`,
      phone && `Phone: ${phone}`,
      notes && `What I would like to see: ${notes}`,
    ].filter(Boolean).join("\n");

    if (demoContactMethod === "whatsapp") {
      window.open(salesWhatsAppLink(message), "_blank", "noopener,noreferrer");
    } else {
      const subject = encodeURIComponent("VMS demo request");
      window.location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${encodeURIComponent(message)}`;
    }
    setDemoOpen(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f6f1] text-[#26372f]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_at_68%_5%,rgba(137,160,132,0.18),transparent_50%),radial-gradient(ellipse_at_12%_35%,rgba(190,122,89,0.10),transparent_45%)]" />
      <header className="relative z-10 mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:flex-nowrap sm:px-8 sm:py-5 lg:px-10">
        <a href="#" className="flex items-center gap-3" aria-label="VMS home">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d6e0d4] bg-[#e8eee6] text-[#58755c] shadow-lg shadow-[#6c8b70]/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">VMS</div>
            <div className="text-[10px] font-medium tracking-wide text-[#78877b]">{t("VISITOR MANAGEMENT").toUpperCase()}</div>
          </div>
        </a>
        <nav className="hidden items-center gap-2 text-sm md:flex" aria-label="Main navigation">
          <a className="rounded-lg border border-[#d6e0d4] bg-white/70 px-3 py-2 font-medium text-[#40564a] shadow-sm transition-all hover:border-[#afc1ad] hover:bg-white hover:text-[#26372f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58755c]/30" href="#features">{t("Features")}</a>
          <a className="rounded-lg border border-[#d6e0d4] bg-white/70 px-3 py-2 font-medium text-[#40564a] shadow-sm transition-all hover:border-[#afc1ad] hover:bg-white hover:text-[#26372f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58755c]/30" href="#how-it-works">{t("How it works")}</a>
          <a className="rounded-lg border border-[#d6e0d4] bg-white/70 px-3 py-2 font-medium text-[#40564a] shadow-sm transition-all hover:border-[#afc1ad] hover:bg-white hover:text-[#26372f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58755c]/30" href="#faq">{t("FAQ")}</a>
        </nav>
        <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-3">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-[#d6e0d4] bg-white/70 px-3 py-2 text-sm font-medium text-[#40564a] transition-all hover:-translate-y-0.5 hover:border-[#bdcfba] hover:bg-white sm:inline-flex"
          >
            <MessageCircle className="h-4 w-4 text-[#58755c]" />
            {t("Book a demo")}
          </button>
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-[#40564a] transition-colors hover:bg-[#f1f3ed] hover:text-[#26372f] sm:px-4">
            {t("Sign in")}
          </Link>
          <Link href="/login?mode=signup" className="rounded-lg bg-[#b66b50] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-[#6c8b70]/20 transition-all hover:-translate-y-0.5 hover:bg-[#a85d44] sm:px-4">
            {t("Get started")}
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-[1600px] items-center gap-14 px-5 pb-8 pt-12 sm:px-8 sm:pb-10 sm:pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 lg:px-10 lg:pb-12 lg:pt-20">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d6e0d4] bg-[#eff2eb] px-3.5 py-1.5 text-xs font-medium text-[#687e68]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#789277]" />
            {t("A clearer view of every visit")}
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#26372f] sm:text-5xl lg:text-[4.25rem]">
            {t("Welcome visitors.")}
            <span className="mt-1 block bg-gradient-to-r from-[#708b74] via-[#9b7147] to-[#b66b50] bg-clip-text text-transparent">
              {t("Stay in control.")}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#53665a] sm:text-lg sm:leading-8">
            {t("Manage check-ins, visitor passes, and activity from one simple workspace built for your front desk and security team.")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/login?mode=signup" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b66b50] px-6 text-sm font-semibold text-white shadow-[0_12px_35px_-12px_rgba(166,99,70,0.28)] transition-all hover:-translate-y-1 hover:bg-[#a85d44]">
              {t("Create your account")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d6e0d4] bg-white px-6 text-sm font-semibold text-[#40564a] transition-all hover:-translate-y-1 hover:border-[#bdcfba] hover:bg-[#fbfcf8]"
            >
              <MessageCircle className="h-4 w-4 text-[#58755c]" />
              {t("Book a demo")}
            </button>
            <a href="#features" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#dfe5dc] bg-[#f5f6f1] px-6 text-sm font-medium text-[#26372f] transition-all hover:-translate-y-1 hover:border-[#bdcfba] hover:bg-[#eef1e9]">
              {t("Explore features")}
            </a>
          </div>
          <a
            href={salesWhatsAppLink("Hi, I would like to request a free trial of VMS.")}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#58755c] underline decoration-[#9aae98] underline-offset-4 transition-colors hover:text-[#3f6245]"
          >
            {t("Request a free trial")}
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="mt-1 pl-2 text-xs leading-5 text-[#78877b]">{t("Trial access is arranged after we confirm your setup.")}</p>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#78877b]">
            {["QR visitor passes", "Live visitor status", "Detailed reports"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#58755c]" /> {t(item)}
              </span>
            ))}
          </div>
          <motion.figure
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-7 w-56 overflow-hidden rounded-xl border border-[#e2e7df] bg-white p-2 shadow-md sm:w-64"
          >
            <img
              src="/landing/visitor-entry-queue.png"
              alt={t("Visitors checking in at entry gates")}
              loading="lazy"
              decoding="async"
              className="aspect-[3/2] w-full object-contain"
            />
          </motion.figure>
        </motion.div>

        <ProductPreview />
      </section>

      <section id="features" className="relative scroll-mt-6 border-y border-[#e5e9e2] bg-[#f8f8f4] pb-20 pt-10 sm:pb-24 sm:pt-12">
        <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-10">
          <motion.div
            {...reveal}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.55 }}
            className="mx-auto max-w-2xl text-center"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a95f46]">{t("Built for smoother arrivals")}</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#26372f] sm:text-4xl">{t("Everything at the front desk, in sync.")}</h2>
            <p className="mt-4 text-sm leading-6 text-[#78877b] sm:text-base">
              {t("Give your team a consistent way to welcome visitors and keep the visit record up to date.")}
            </p>
          </motion.div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <motion.article
                key={feature.title}
                {...reveal}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                whileHover={reduceMotion ? undefined : { y: -7, scale: 1.015 }}
                className="group rounded-2xl border border-[#e1e6de] bg-white p-6 transition-colors hover:border-[#cbd9c8] hover:bg-[#fbfaf5]"
              >
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-[#34483b] shadow-sm`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  {feature.image && (
                    <img
                      src={feature.image}
                      alt={t(feature.imageAlt ?? "")}
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-24 rounded-lg bg-[#f7f6f1] object-contain p-1 sm:h-20 sm:w-28"
                    />
                  )}
                </div>
                <h3 className="text-base font-semibold text-[#26372f]">{t(feature.title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#78877b]">{t(feature.description)}</p>
                <div className="mt-5 h-px w-8 bg-[#b66b50]/60 transition-all duration-300 group-hover:w-14" />
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative scroll-mt-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1600px] gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-10">
          <motion.div
            {...reveal}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55 }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a95f46]">{t("Simple from arrival to exit")}</div>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-[#26372f] sm:text-4xl">{t("A dependable visitor journey, without the paper trail.")}</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#78877b] sm:text-base">
              {t("Register a visitor, issue a pass, and keep their check-in and check-out history together in one place.")}
            </p>
            <div className="mt-8 space-y-4">
              {benefits.map((benefit, index) => (
                <motion.div
                  key={benefit}
                  initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: index * 0.08 }}
                  className="flex items-center gap-3 text-sm text-[#53665a]"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#d5e0d2] bg-[#edf2eb] text-[#58755c]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {benefit}
                </motion.div>
              ))}
            </div>
            <motion.img
              src="/landing/reception-checkpoints.png"
              alt={t("Reception and visitor entry checkpoints")}
              loading="lazy"
              decoding="async"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5 }}
              className="mt-8 block h-auto w-full max-w-[430px] rounded-xl border border-[#e2e7df] bg-white p-2 shadow-sm"
            />
          </motion.div>
          <motion.div
            {...reveal}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="relative"
          >
            <div className="absolute inset-8 rounded-full bg-[#dfe8dc] blur-3xl" />
            <div className="relative space-y-3 rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-2xl sm:p-7">
              {[
                { step: "01", title: "Register", detail: "Capture visitor details and visit purpose.", icon: ClipboardCheck },
                { step: "02", title: "Welcome", detail: "Check in and provide a QR visitor pass.", icon: QrCode },
                { step: "03", title: "Keep track", detail: "Review activity and record checkout.", icon: Clock3 },
              ].map((item, index) => (
                <motion.div
                  key={item.step}
                  whileHover={reduceMotion ? undefined : { x: 5 }}
                  className="flex items-center gap-4 rounded-xl border border-[#e8ebe5] bg-[#f8f8f4] p-4"
                >
                  {item.step === "02" ? (
                    <img
                      src="/landing/digital-visitor-pass.png"
                      alt={t("Digital visitor badge and pass")}
                      loading="lazy"
                      decoding="async"
                      className="h-11 w-14 shrink-0 rounded-lg bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8eee6] text-[#a95f46]">
                      <item.icon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold tracking-widest text-[#a95f46]">{item.step}</span>
                      <span className="text-sm font-semibold text-[#26372f]">{t(item.title)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#78877b]">{t(item.detail)}</p>
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 text-[#a0aaa1] ${index === 2 ? "opacity-0" : ""}`} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-6 border-y border-[#e5e9e2] bg-[#f8f8f4] py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1600px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <motion.div
            {...reveal}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55 }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a95f46]">{t("Good to know")}</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#26372f] sm:text-4xl">{t("A few common questions.")}</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#78877b]">
              {t("A quick overview of how the current visitor workflow works.")}
            </p>
            <motion.img
              src="/faq-questions.png"
              alt={t("Illustration for frequently asked questions")}
              loading="lazy"
              decoding="async"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5 }}
              className="mx-auto mt-6 block h-auto w-full max-w-[320px] rounded-2xl border border-[#e1e6de] bg-white/80 p-2 shadow-sm lg:mx-0"
            />
          </motion.div>
          <div className="space-y-3">
            {[
              {
                question: "Do visitors need to create an account?",
                answer: "No. Reception or security staff can register visitors and check them in using the visitor management system.",
              },
              {
                question: "Does scanning a visitor pass open the gate automatically?",
                answer: "No. Scanning opens the visitor profile so authorized staff can review the pass and manage check-in or checkout.",
              },
              {
                question: "Can we change the automatic checkout time?",
                answer: "Yes. An administrator can configure the checkout time and timezone in System Settings.",
              },
              {
                question: "Can reports be downloaded?",
                answer: "Yes. Visitor reports can be filtered and downloaded as CSV or PDF, including recorded gadget details.",
              },
              {
                question: "How do I book a demo or request a trial?",
                answer: "Book a demo using the form and choose WhatsApp or email to contact our team.",
              },
            ].map((item, index) => (
              <motion.details
                key={item.question}
                {...reveal}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                className="group rounded-xl border border-[#e1e6de] bg-white p-4 open:border-[#cbd9c8] sm:p-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[#33473c]">
                  {t(item.question)}
                  <span className="text-lg font-normal text-[#a95f46] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl pr-8 text-sm leading-6 text-[#78877b]">{t(item.answer)}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
        <motion.div
          {...reveal}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.55 }}
          className="relative mx-auto max-w-[1600px] overflow-hidden rounded-3xl border border-[#dce4d9] bg-gradient-to-br from-[#e8eee6] via-[#f2eee4] to-[#f4e9e2] px-6 py-12 sm:px-12 sm:py-16"
        >
          <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full border border-[#94a98c]/25" />
          <div className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full border border-[#b66b50]/15" />
          <div className="relative z-10 text-center lg:max-w-[70%] lg:text-left">
            <h2 className="text-3xl font-semibold tracking-tight text-[#26372f] sm:text-4xl">{t("Make every arrival feel organized.")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#53665a] sm:text-base lg:mx-0">
              {t("Start using a clearer way to register visitors and manage their time on site.")}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap lg:justify-start">
              <Link href="/login?mode=signup" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b66b50] px-6 text-sm font-semibold text-white transition-all hover:-translate-y-1 hover:bg-[#a85d44]">
                {t("Create an account")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href={salesWhatsAppLink("Hi, I would like to request a free trial of VMS.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#cbd9c8] bg-white/80 px-6 text-sm font-semibold text-[#40564a] transition-all hover:-translate-y-1 hover:bg-white"
              >
                <MessageCircle className="h-4 w-4 text-[#58755c]" />
                {t("Request a free trial")}
              </a>
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#cbd9c8] bg-white/80 px-6 text-sm font-semibold text-[#40564a] transition-all hover:-translate-y-1 hover:bg-white"
              >
                <MessageCircle className="h-4 w-4 text-[#58755c]" />
                {t("Book a demo")}
              </button>
            </div>
            <p className="mt-3 text-xs text-[#687e68]">{t("Trial access is arranged after we confirm your setup.")}</p>
          </div>
          <motion.img
            src="/landing/front-desk-welcome.png"
            alt={t("Receptionist welcoming a visitor")}
            loading="lazy"
            decoding="async"
            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.5 }}
            className="relative mx-auto mt-8 block h-auto w-44 rounded-xl border border-white/70 bg-white/70 p-2 shadow-lg sm:w-56 lg:absolute lg:right-12 lg:top-1/2 lg:mt-0 lg:w-64 lg:-translate-y-1/2"
          />
        </motion.div>
      </section>

      <footer className="border-t border-[#e5e9e2] px-5 py-7 text-center text-xs text-[#89968b] sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-3 sm:flex-row">
          <span>{t("© {year} VMS Visitor Management. All rights reserved.").replace("{year}", String(new Date().getFullYear()))}</span>
          <a href={`mailto:${SALES_EMAIL}`} className="inline-flex items-center gap-2 font-medium text-[#58755c] transition-colors hover:text-[#3f6245]">
            <Mail className="h-3.5 w-3.5" />
            {SALES_EMAIL}
          </a>
        </div>
      </footer>

      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-[#dfe5dc] bg-[#fffefa] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[#26372f]">{t("Book a VMS demo")}</DialogTitle>
            <DialogDescription className="text-[#687e68]">
              {t("Tell us a little about your team. Choose WhatsApp or email to prepare your request.")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitDemoRequest} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-[#40564a]">
                {t("Your name")}
                <input
                  name="name"
                  autoComplete="name"
                  required
                  className="w-full rounded-lg border border-[#dfe5dc] bg-white px-3 py-2.5 text-sm font-normal text-[#26372f] outline-none transition focus:border-[#8da68d] focus:ring-2 focus:ring-[#8da68d]/20"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-[#40564a]">
                {t("Company")}
                <input
                  name="company"
                  autoComplete="organization"
                  className="w-full rounded-lg border border-[#dfe5dc] bg-white px-3 py-2.5 text-sm font-normal text-[#26372f] outline-none transition focus:border-[#8da68d] focus:ring-2 focus:ring-[#8da68d]/20"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-[#40564a]">
                {t("Email address")}
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required={demoContactMethod === "email"}
                  className="w-full rounded-lg border border-[#dfe5dc] bg-white px-3 py-2.5 text-sm font-normal text-[#26372f] outline-none transition focus:border-[#8da68d] focus:ring-2 focus:ring-[#8da68d]/20"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-[#40564a]">
                {t("Phone number")}
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required={demoContactMethod === "whatsapp"}
                  className="w-full rounded-lg border border-[#dfe5dc] bg-white px-3 py-2.5 text-sm font-normal text-[#26372f] outline-none transition focus:border-[#8da68d] focus:ring-2 focus:ring-[#8da68d]/20"
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium text-[#40564a]">
              {t("What would you like to see? (optional)")}
              <textarea
                name="notes"
                rows={3}
                className="w-full resize-y rounded-lg border border-[#dfe5dc] bg-white px-3 py-2.5 text-sm font-normal text-[#26372f] outline-none transition focus:border-[#8da68d] focus:ring-2 focus:ring-[#8da68d]/20"
              />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-[#40564a]">{t("How would you like us to contact you?")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["whatsapp", "email"] as const).map((method) => (
                  <label
                    key={method}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm transition ${
                      demoContactMethod === method
                        ? "border-[#8da68d] bg-[#edf2eb] text-[#33473c]"
                        : "border-[#dfe5dc] bg-white text-[#687e68]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="contactMethod"
                      value={method}
                      checked={demoContactMethod === method}
                      onChange={() => setDemoContactMethod(method)}
                      className="accent-[#58755c]"
                    />
                    {method === "whatsapp" ? t("WhatsApp") : t("Email")}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs leading-5 text-[#78877b]">
              {t("Your chosen app will open with the request filled in. Review it and press Send to contact our team.")}
            </p>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#58755c] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#48654c]"
            >
              {demoContactMethod === "whatsapp" ? t("Continue to WhatsApp") : t("Open email draft")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
