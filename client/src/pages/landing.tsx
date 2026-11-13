import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ClipboardCheck,
  Clock3,
  QrCode,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const features = [
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
  const { t } = useLanguage();

  return (
    <motion.div
      className="relative mx-auto w-full max-w-[620px]"
      initial={{ opacity: 0, y: 22, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.12, duration: 0.4 }}
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
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.72 + index * 0.13, duration: 0.4 }}
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
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
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
  const reveal = reduceMotion
    ? { initial: false as const, whileInView: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 } };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f6f1] text-[#26372f]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_at_68%_5%,rgba(137,160,132,0.18),transparent_50%),radial-gradient(ellipse_at_12%_35%,rgba(190,122,89,0.10),transparent_45%)]" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <a href="#" className="flex items-center gap-3" aria-label="VMS home">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d6e0d4] bg-[#e8eee6] text-[#58755c] shadow-lg shadow-[#6c8b70]/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">VMS</div>
            <div className="text-[10px] font-medium tracking-wide text-[#78877b]">{t("VISITOR MANAGEMENT").toUpperCase()}</div>
          </div>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-[#53665a] md:flex" aria-label="Main navigation">
          <a className="transition-colors hover:text-[#26372f]" href="#features">{t("Features")}</a>
          <a className="transition-colors hover:text-[#26372f]" href="#how-it-works">{t("How it works")}</a>
          <a className="transition-colors hover:text-[#26372f]" href="#faq">{t("FAQ")}</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-[#40564a] transition-colors hover:bg-[#f1f3ed] hover:text-[#26372f] sm:px-4">
            {t("Sign in")}
          </Link>
          <Link href="/login?mode=signup" className="rounded-lg bg-[#b66b50] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-[#6c8b70]/20 transition-all hover:-translate-y-0.5 hover:bg-[#a85d44] sm:px-4">
            {t("Get started")}
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 lg:px-10 lg:pb-32 lg:pt-20">
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
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login?mode=signup" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b66b50] px-6 text-sm font-semibold text-white shadow-[0_12px_35px_-12px_rgba(166,99,70,0.28)] transition-all hover:-translate-y-1 hover:bg-[#a85d44]">
              {t("Create your account")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#features" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#dfe5dc] bg-[#f5f6f1] px-6 text-sm font-medium text-[#26372f] transition-all hover:-translate-y-1 hover:border-[#bdcfba] hover:bg-[#eef1e9]">
              {t("Explore features")}
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#78877b]">
            {["QR visitor passes", "Live visitor status", "Detailed reports"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#58755c]" /> {t(item)}
              </span>
            ))}
          </div>
        </motion.div>

        <ProductPreview />
      </section>

      <section id="features" className="relative border-y border-[#e5e9e2] bg-[#f8f8f4] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
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
                <div className={`mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-[#34483b] shadow-sm`}>
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-[#26372f]">{t(feature.title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#78877b]">{t(feature.description)}</p>
                <div className="mt-5 h-px w-8 bg-[#b66b50]/60 transition-all duration-300 group-hover:w-14" />
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-10">
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
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8eee6] text-[#a95f46]">
                    <item.icon className="h-5 w-5" />
                  </div>
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

      <section id="faq" className="border-y border-[#e5e9e2] bg-[#f8f8f4] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
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
          className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[#dce4d9] bg-gradient-to-br from-[#e8eee6] via-[#f2eee4] to-[#f4e9e2] px-6 py-12 text-center sm:px-12 sm:py-16"
        >
          <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full border border-[#94a98c]/25" />
          <div className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full border border-[#b66b50]/15" />
          <h2 className="relative text-3xl font-semibold tracking-tight text-[#26372f] sm:text-4xl">{t("Make every arrival feel organized.")}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm leading-6 text-[#53665a] sm:text-base">
            {t("Start using a clearer way to register visitors and manage their time on site.")}
          </p>
          <Link href="/login?mode=signup" className="group relative mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b66b50] px-6 text-sm font-semibold text-white transition-all hover:-translate-y-1 hover:bg-[#a85d44]">
            {t("Create an account")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-[#e5e9e2] px-5 py-7 text-center text-xs text-[#89968b] sm:px-8">
        <span>{t("© {year} VMS Visitor Management. All rights reserved.").replace("{year}", String(new Date().getFullYear()))}</span>
      </footer>
    </main>
  );
}
