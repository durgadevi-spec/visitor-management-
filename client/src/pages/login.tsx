import { useEffect, useState, type FormEvent } from "react";
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
      signupMutation.mutate({ data: { name, email, password }, rememberMe });
      return;
    }

    loginMutation.mutate({ data: { email, password }, rememberMe });
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex justify-end p-3 pb-0">
          <LanguageSwitcher />
        </div>
        <div className="flex flex-col items-center justify-center space-y-3 border-b border-border bg-card-foreground/5 p-8 text-center">
          <div className="rounded-full bg-primary/20 p-3 ring-1 ring-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t("VMS Mission Control")}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? t("Sign in to your account") : t("Create an employee account")}
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5 p-8">
          {mode === "signup" && (
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
            <div className="space-y-2">
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
            </div>
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
    </div>
  );
}
