import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin, useSignup } from "@/lib/api-client";
import { Redirect, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AuthMode = "login" | "signup";
const REMEMBERED_EMAIL_KEY = "vms_remembered_email";

export default function Login() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
  });
  const [mode, setMode] = useState<AuthMode>("login");
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
          title: "Login failed",
          description: error.error || "Invalid credentials",
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
        toast({ title: "Account created", description: "You can now access the visitor management system." });
        setLocation("/");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Signup failed",
          description: error.error || "Unable to create account",
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
        toast({ variant: "destructive", title: "Password too short", description: "Use at least 8 characters." });
        return;
      }
      if (password !== confirmPassword) {
        toast({ variant: "destructive", title: "Passwords do not match", description: "Confirm your password and try again." });
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
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-col items-center justify-center space-y-3 border-b border-border bg-card-foreground/5 p-8 text-center">
          <div className="rounded-full bg-primary/20 p-3 ring-1 ring-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VMS Mission Control</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Sign in to your account" : "Create an employee account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5 p-8">
          {mode === "signup" && (
            <div className="space-y-2">
              <label htmlFor="signup-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Full Name
              </label>
              <Input
                id="signup-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                minLength={2}
                required
                className="border-border bg-background text-foreground focus-visible:ring-primary"
              />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="auth-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email Address
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
              Password
            </label>
            <div className="relative">
              <Input
                id="auth-password"
                name={mode === "login" ? "password" : "new-password"}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                minLength={mode === "signup" ? 8 : undefined}
                required
                className="border-border bg-background pr-11 text-foreground focus-visible:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "signup" && <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>}
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confirm Password
              </label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  required
                  className="border-border bg-background pr-11 text-foreground focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
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
            Remember me
          </label>

          <Button
            type="submit"
            className="w-full bg-primary font-bold uppercase tracking-widest text-primary-foreground shadow-[0_0_10px_rgba(var(--primary),0.2)] hover:bg-primary/90"
            disabled={isPending}
          >
            {isPending
              ? (mode === "login" ? "Signing In..." : "Creating Account...")
              : (mode === "login" ? "Sign In" : "Create Account")}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode((currentMode) => currentMode === "login" ? "signup" : "login");
                setPassword("");
                setConfirmPassword("");
              }}
              className="font-medium text-primary hover:underline"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED
          </div>
        </form>
      </div>
    </div>
  );
}
