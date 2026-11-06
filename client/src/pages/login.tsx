import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin } from "@/lib/api-client";
import { Redirect, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token, data.user);
        setLocation("/");
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: error?.error || "Invalid credentials",
        });
      },
    }
  });

  if (user) {
    return <Redirect to="/" />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background text-foreground dark p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-col items-center justify-center space-y-3 bg-card-foreground/5 p-8 text-center border-b border-border">
          <div className="rounded-full bg-primary/20 p-3 ring-1 ring-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VMS Mission Control</h1>
          <p className="text-sm text-muted-foreground">Command Center Authentication</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Operator Email
              </label>
              <Input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="durgadevi@ctint.in" 
                required
                className="bg-background border-border text-foreground font-mono focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Access Code
              </label>
              <Input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                required
                className="bg-background border-border text-foreground font-mono focus-visible:ring-primary"
              />
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(var(--primary),0.2)]"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? "Authenticating..." : "Initialize Session"}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED
          </div>
        </form>
      </div>
    </div>
  );
}
