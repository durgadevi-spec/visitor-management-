import { useParams } from "wouter";
import { UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetPublicVisitorPass } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function VisitorPass() {
  const { id } = useParams<{ id: string }>();
  const { t, formatDate } = useLanguage();
  const { data: pass, isLoading, isError } = useGetPublicVisitorPass(id ?? "", {
    query: { enabled: !!id },
  });

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="mx-auto h-12 w-40" />
            <Skeleton className="mx-auto h-36 w-36 rounded-xl" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (isError || !pass) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center">
            <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
            <h1 className="text-lg font-semibold">{t("Visitor pass unavailable")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("This pass could not be found. Please ask the front desk for assistance.")}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-4">
      <Card className="w-full max-w-sm overflow-hidden border-stone-200 shadow-lg">
        <header className="flex min-h-20 items-center justify-center border-b bg-white px-6 py-4">
          <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
          {pass.companyLogo ? (
            <img src={pass.companyLogo} alt={`${pass.facilityName} logo`} className="mr-3 h-12 max-w-24 object-contain" />
          ) : null}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t("Visitor Pass")}</p>
            <h1 className="mt-1 text-base font-semibold text-foreground">{pass.facilityName}</h1>
          </div>
        </header>
        <CardContent className="flex flex-col items-center p-6 text-center">
          <div className="h-36 w-36 overflow-hidden rounded-xl border bg-stone-100">
            {pass.photoUrl ? (
              <img src={pass.photoUrl} alt={pass.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserCircle className="h-20 w-20 text-muted-foreground/50" />
              </div>
            )}
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">{pass.name}</h2>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{pass.visitorId}</p>
          <Badge variant="outline" className="mt-3 capitalize">
            {t(pass.status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))}
          </Badge>
          <div className="mt-6 w-full space-y-3 border-t pt-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("Host")}</span>
              <span className="text-right font-medium">{pass.personToMeet}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{pass.scheduledFor ? t("Expected Visit Date") : t("Date issued")}</span>
              <span className="text-right font-medium">{pass.scheduledFor
                ? formatDate(new Date(`${pass.scheduledFor}T00:00:00`), "MMM d, yyyy")
                : formatDate(new Date(pass.createdAt), "MMM d, yyyy")}</span>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">{t("Present this pass to reception or security.")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
