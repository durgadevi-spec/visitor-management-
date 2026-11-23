import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { updatePublicVisitorLocation, useGetPublicVisitorPass } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { distanceInMeters } from "../../../shared/location";

type LocationSharingState = "idle" | "starting" | "sharing" | "outside" | "stopped" | "error";
const GEOFENCE_RADIUS_METERS = 500;
const MAX_LOCATION_ACCURACY_METERS = 100;
const LOCATION_UPDATE_INTERVAL_MS = 15_000;

export default function VisitorPass() {
  const { id } = useParams<{ id: string }>();
  const { t, formatDate } = useLanguage();
  const [sharingState, setSharingState] = useState<LocationSharingState>("idle");
  const [locationError, setLocationError] = useState("");
  const watchId = useRef<number | null>(null);
  const tracking = useRef(false);
  const lastUpdateAt = useRef(0);
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const { data: pass, isLoading, isError } = useGetPublicVisitorPass(id ?? "", {
    query: { enabled: !!id },
  });

  const clearWatch = () => {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    tracking.current = false;
  };

  const sendUpdate = (update: Parameters<typeof updatePublicVisitorLocation>[1]) => {
    if (!id) return;
    updateQueue.current = updateQueue.current
      .then(async () => {
        const result = await updatePublicVisitorLocation(id, update);
        if (update.action === "update" && !result.stored) {
          clearWatch();
          setSharingState(result.reason === "outside_geofence" ? "outside" : "error");
          if (result.reason === "poor_accuracy") setLocationError(t("Location accuracy is too low to share safely."));
        }
      })
      .catch((error: unknown) => {
        clearWatch();
        setSharingState("error");
        setLocationError(error instanceof Error ? error.message : t("Unable to update visitor location."));
      });
  };

  const stopSharing = (state: "outside" | "stopped" = "stopped") => {
    clearWatch();
    setSharingState(state);
    sendUpdate({ action: "stop" });
  };

  const startSharing = () => {
    if (!id || !pass?.trackingAvailable || !pass.receptionCoordinates) return;
    if (!navigator.geolocation) {
      setSharingState("error");
      setLocationError(t("This device does not support location access."));
      return;
    }

    setSharingState("starting");
    setLocationError("");
    lastUpdateAt.current = 0;
    tracking.current = true;
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!tracking.current) return;
        const { latitude, longitude, accuracy } = position.coords;
        const distance = distanceInMeters(
          pass.receptionCoordinates!.latitude,
          pass.receptionCoordinates!.longitude,
          latitude,
          longitude,
        );
        if (distance > GEOFENCE_RADIUS_METERS) {
          stopSharing("outside");
          return;
        }
        if (accuracy > MAX_LOCATION_ACCURACY_METERS) {
          clearWatch();
          setSharingState("error");
          setLocationError(t("Location accuracy is too low to share safely."));
          sendUpdate({ action: "stop" });
          return;
        }

        setSharingState("sharing");
        const now = Date.now();
        if (now - lastUpdateAt.current < LOCATION_UPDATE_INTERVAL_MS) return;
        lastUpdateAt.current = now;
        sendUpdate({ action: "update", latitude, longitude, accuracyMeters: accuracy });
      },
      (error) => {
        clearWatch();
        setSharingState("error");
        setLocationError(error.code === error.PERMISSION_DENIED
          ? t("Location permission was denied. Allow it in your browser to share your location.")
          : t("Unable to determine your location. Please try again."));
        sendUpdate({ action: "stop" });
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
  };

  useEffect(() => {
    const clearOnExit = () => {
      if (!tracking.current || !id) return;
      clearWatch();
      const body = new Blob([JSON.stringify({ action: "stop" })], { type: "application/json" });
      navigator.sendBeacon(`/api/public/visitor-pass/${encodeURIComponent(id)}/location`, body);
    };
    window.addEventListener("pagehide", clearOnExit);
    return () => {
      window.removeEventListener("pagehide", clearOnExit);
      clearOnExit();
    };
  }, [id]);

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
          {pass.trackingAvailable && (
            <section className="mt-5 w-full rounded-lg border bg-background p-4 text-left">
              <h3 className="text-sm font-semibold">{t("Visitor location sharing")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Optional: share your current location with reception while within 500 m. Only your latest in-bound location is saved. Sharing stops when you leave the area or close this pass.")}
              </p>
              {sharingState === "sharing" ? (
                <div className="mt-3 space-y-2">
                  <p role="status" className="text-xs font-medium text-emerald-700">{t("Location sharing is on.")}</p>
                  <Button type="button" variant="outline" className="w-full" onClick={() => stopSharing()}>
                    {t("Stop sharing location")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={startSharing}
                  disabled={sharingState === "starting"}
                >
                  {sharingState === "starting" ? t("Getting location...") : t("Start sharing location")}
                </Button>
              )}
              {sharingState === "outside" && (
                <p role="status" className="mt-2 text-xs text-muted-foreground">{t("You are outside the 500 m area. Your location is not being shared.")}</p>
              )}
              {sharingState === "stopped" && (
                <p role="status" className="mt-2 text-xs text-muted-foreground">{t("Location sharing is off.")}</p>
              )}
              {locationError && <p role="alert" className="mt-2 text-xs text-destructive">{locationError}</p>}
            </section>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
