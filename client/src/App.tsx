import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { LanguageProvider } from "@/contexts/LanguageContext";

// Pages
import Login from "@/pages/login";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import CheckIn from "@/pages/check-in";
import Visitors from "@/pages/visitors";
import VisitorDetail from "@/pages/visitor";
import VisitorPass from "@/pages/visitor-pass";
import Reports from "@/pages/reports";
import Blacklist from "@/pages/blacklist";
import Users from "@/pages/users";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <AppLayout><Dashboard /></AppLayout> : <Landing />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/" component={HomeRoute} />
      <Route path="/check-in">
        <AppLayout><CheckIn /></AppLayout>
      </Route>
      <Route path="/visitors">
        <AppLayout><Visitors /></AppLayout>
      </Route>
      <Route path="/visitor/:id" component={VisitorPass} />
      <Route path="/visitor-record/:id">
        <AppLayout><VisitorDetail /></AppLayout>
      </Route>
      <Route path="/reports">
        <AppLayout><Reports /></AppLayout>
      </Route>
      <Route path="/blacklist">
        <AppLayout><Blacklist /></AppLayout>
      </Route>
      <Route path="/users">
        <AppLayout><Users /></AppLayout>
      </Route>
      <Route path="/notifications">
        <AppLayout><Notifications /></AppLayout>
      </Route>
      <Route path="/settings">
        <AppLayout><Settings /></AppLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <LanguageProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </LanguageProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
