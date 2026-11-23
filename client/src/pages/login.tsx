import { useEffect, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin, useSignup } from "@/lib/api-client";
import { Link, Redirect, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type AuthMode = "login" | "signup";
const REMEMBERED_EMAIL_KEY = "vms_remembered_email";

export default function Login() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
  });
  const [mode, setMode] = useState<AuthMode>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "signup"
      ? "signup"
      : "login"
  );
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ""
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const { user, login } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data, variables) => {
        if (variables.rememberMe) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, variables.data.email);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        login(data.token, data.user, variables.rememberMe);
        setLocation("/");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: t("Login failed"),
          description: t(error.error || "Invalid credentials"),
        });
      },
    }
  });

  const signupMutation = useSignup({
    mutation: {
      onSuccess: (data, variables) => {
        if (variables.rememberMe) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, variables.data.email);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        login(data.token, data.user, variables.rememberMe);
        toast({ title: t("Account created"), description: t("You can now access the visitor management system.") });
        setLocation("/");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: t("Signup failed"),
          description: t(error.error || "Unable to create account"),
        });
      },
    }
  });

  if (user) {
    return <Redirect to="/" />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "signup") {
      if (password.length < 8) {
        toast({ variant: "destructive", title: t("Password too short"), description: t("Use at least 8 characters.") });
        return;
      }
      if (password !== confirmPassword) {
        toast({ variant: "destructive", title: t("Passwords do not match"), description: t("Confirm your password and try again.") });
        return;
      }
      signupMutation.mutate({
        data: {
          name,
          ...(organizationName.trim() ? { organizationName: organizationName.trim() } : {}),
          email,
          password,
        },
        rememberMe,
      });
      return;
    }

    loginMutation.mutate({ data: { email, password }, rememberMe });
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f7f6f1] p-4 text-foreground dark:bg-[#151a17]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_75%_5%,rgba(137,160,132,0.18),transparent_55%),radial-gradient(ellipse_at_10%_70%,rgba(190,122,89,0.12),transparent_45%)]" />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative grid w-full max-w-6xl overflow-hidden rounded-3xl border border-[#e7e2d9] bg-white shadow-[0_30px_90px_-40px_rgba(57,78,59,0.32)] dark:border-white/10 dark:bg-card lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="relative z-10 flex min-w-0 flex-col p-5 sm:p-8 lg:col-start-2 lg:row-start-1 lg:p-12">
        <div className="mb-7 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-8 flex flex-col items-start space-y-3 text-left">
          <div className="rounded-2xl bg-[#e8eee6] p-3 text-[#58755c] ring-1 ring-[#d6e0d4] dark:bg-primary/10 dark:text-primary dark:ring-primary/30">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#26372f] dark:text-foreground sm:text-4xl">
            {mode === "login" ? t("Welcome back!") : t("Create your account")}
          </h1>
          <p className="text-sm text-[#78877b] dark:text-muted-foreground">
            {mode === "login" ? t("Sign in to your account") : t("Create an organization admin account")}
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5">
          {mode === "signup" && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="signup-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("Full Name")}
                </label>
                <Input
                  id="signup-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("Your name")}
                  minLength={2}
                  required
                  className="border-border bg-background text-foreground focus-visible:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-organization" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("Organization name")}
                </label>
                <Input
                  id="signup-organization"
                  autoComplete="organization"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder={t("Your company or facility")}
                  minLength={2}
                  className="border-border bg-background text-foreground focus-visible:ring-primary"
                />
              </div>
              <p className="rounded-lg bg-[#edf2eb] px-3 py-2 text-xs leading-5 text-[#58755c]">
                {t("Start a 14-day Business plan trial. No payment is collected during signup.")}
              </p>
            </motion.div>
          )}

          <div className="space-y-2">
            <label htmlFor="auth-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("Email Address")}
            </label>
            <Input
              id="auth-email"
              name={mode === "login" ? "username" : "email"}
              type="email"
              autoComplete={mode === "login" ? "username" : "email"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              className="border-border bg-background text-foreground focus-visible:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="auth-password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("Password")}
            </label>
            <div className="relative">
              <Input
                id="auth-password"
                name={mode === "login" ? "password" : "new-password"}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("Enter your password")}
                minLength={mode === "signup" ? 8 : undefined}
                required
                className="border-border bg-background pr-11 text-foreground focus-visible:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? t("Hide password") : t("Show password")}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "signup" && <p className="text-xs text-muted-foreground">{t("Use at least 8 characters.")}</p>}
          </div>

          {mode === "signup" && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="space-y-2"
            >
              <label htmlFor="confirm-password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("Confirm Password")}
              </label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={t("Re-enter your password")}
                  required
                  className="border-border bg-background pr-11 text-foreground focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? t("Hide confirmation password") : t("Show confirmation password")}
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </motion.div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => {
                const checked = event.target.checked;
                setRememberMe(checked);
                if (!checked) {
                  window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
                }
              }}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            {t("Remember me")}
          </label>

          <Button
            type="submit"
            className="w-full bg-primary font-bold uppercase tracking-widest text-primary-foreground shadow-[0_0_10px_rgba(var(--primary),0.2)] hover:bg-primary/90"
            disabled={isPending}
          >
            {isPending
              ? (mode === "login" ? t("Signing In...") : t("Creating Account..."))
              : (mode === "login" ? t("Sign In") : t("Create Account"))}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "login" ? t("Don't have an account?") : t("Already have an account?")}{" "}
            <button
              type="button"
              onClick={() => {
                setMode((currentMode) => currentMode === "login" ? "signup" : "login");
                setPassword("");
                setConfirmPassword("");
              }}
              className="font-medium text-primary hover:underline"
            >
              {mode === "login" ? t("Sign up") : t("Sign in")}
            </button>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            {t("UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED")}
          </div>
          <div className="text-center text-sm">
            <Link href="/" className="font-medium text-primary hover:underline">
              {t("Back to home")}
            </Link>
          </div>
        </form>
        </div>
        <aside className="relative flex min-h-64 items-center justify-center overflow-hidden bg-gradient-to-br from-[#edf8fb] via-[#f4f8f6] to-[#e9f4f6] px-6 py-10 dark:from-[#26392f] dark:via-[#263229] dark:to-[#263c43] sm:min-h-80 lg:col-start-1 lg:row-start-1 lg:min-h-full lg:px-10">
          <div className="absolute left-7 top-6 z-20 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/75 text-[#58755c] shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-primary">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-[#26372f] dark:text-foreground">VMS</div>
              <div className="text-[9px] font-medium tracking-[0.12em] text-[#78877b] dark:text-muted-foreground">{t("VISITOR MANAGEMENT")}</div>
            </div>
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-white/60 blur-2xl dark:bg-white/5" />
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.12 }}
            className="relative flex w-full max-w-[560px] items-center justify-center pt-10"
          >
            <motion.img
              key={mode}
              src={mode === "signup" ? "/signup-reception.png" : "/auth-welcome.png"}
              alt={mode === "signup"
                ? t("Illustration of a visitor arriving at reception")
                : t("Illustration of a visitor being welcomed at reception")}
              decoding="async"
              initial={mode === "signup" && !reduceMotion ? { opacity: 0, y: 12, scale: 0.96 } : false}
              animate={reduceMotion
                ? undefined
                : mode === "signup"
                  ? { opacity: 1, scale: 1, y: [0, -7, 0] }
                  : { y: [0, -7, 0] }}
              transition={mode === "signup"
                ? {
                    opacity: { duration: 0.35 },
                    scale: { duration: 0.35 },
                    y: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
                  }
                : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-10 max-h-[340px] w-full object-contain sm:max-h-[460px]"
            />
          </motion.div>
        </aside>
      </motion.div>
    </div>
  );
}
