import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Printer, UserCircle } from "lucide-react";
import { useGetPublicAppointmentPass } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppointmentPassPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { data: pass, isLoading, isError } = useGetPublicAppointmentPass(token, {
    query: { enabled: !!token },
  });
  const [qrCode, setQrCode] = useState("");
  const [qrError, setQrError] = useState("");

  useEffect(() => {
    if (!pass || !token) return;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(window.location.href, { width: 240, margin: 1, errorCorrectionLevel: "M" }))
      .then(setQrCode)
      .catch((error: unknown) => setQrError(error instanceof Error ? error.message : "Unable to generate appointment QR pass."));
  }, [pass, token]);

  const appointmentDate = pass
    ? new Intl.DateTimeFormat("en-IN", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: pass.timezone,
    }).format(new Date(pass.scheduledAt))
    : "";

  if (isLoading) {
    return <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-4"><Card className="w-full max-w-md"><CardContent className="space-y-4 p-6"><Skeleton className="mx-auto h-8 w-40" /><Skeleton className="mx-auto h-56 w-56" /><Skeleton className="h-6 w-full" /></CardContent></Card></main>;
  }

  if (isError || !pass) {
    return <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-4"><Card className="w-full max-w-md"><CardContent className="p-8 text-center"><h1 className="text-xl font-semibold">Appointment pass unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This pass could not be found or is no longer valid. Contact the host organization for assistance.</p></CardContent></Card></main>;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-lg print:border-0 print:shadow-none">
        <header className="flex items-center justify-center gap-3 border-b bg-white px-6 py-5">
          {pass.companyLogo && <img src={pass.companyLogo} alt={`${pass.facilityName} logo`} className="h-12 max-w-24 object-contain" />}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Appointment pass</p>
            <h1 className="mt-1 text-base font-semibold">{pass.facilityName}</h1>
          </div>
        </header>
        <CardContent className="flex flex-col items-center p-6 text-center">
          {pass.photoUrl
            ? <img src={pass.photoUrl} alt={pass.name} className="h-24 w-24 rounded-full border object-cover" />
            : <UserCircle className="h-24 w-24 text-muted-foreground/50" />}
          <h2 className="mt-3 text-2xl font-bold">{pass.name}</h2>
          <p className="font-mono text-sm text-muted-foreground">{pass.visitorPassNumber}</p>
          {qrCode ? <img src={qrCode} alt="Appointment QR code for security verification" className="mt-5 h-56 w-56" /> : <Skeleton className="mt-5 h-56 w-56" />}
          {qrError && <p role="alert" className="text-xs text-destructive">{qrError}</p>}
          <div className="mt-5 w-full space-y-3 border-t pt-4 text-left text-sm">
            <PassDetail label="Appointment" value={pass.appointmentNumber} />
            <PassDetail label="Date and time" value={appointmentDate} />
            <PassDetail label="Host" value={pass.meetingPerson} />
            <PassDetail label="Department" value={pass.department} />
            <PassDetail label="Purpose" value={pass.purpose} />
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Show this QR code to Security. Your ID card number will be assigned at check-in.</p>
          <Button type="button" variant="outline" className="mt-4 print:hidden" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />Print pass
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function PassDetail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
