import { useRef, useState, useCallback, useEffect, useMemo, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { IScannerControls } from "@zxing/browser";
import { useCreateVisitor, useGetBlacklist, useGetSystemSettings, useLookupVisitorsByMobile } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, X, Scan, UserCircle, UserRound, CalendarDays, Upload, QrCode, Laptop, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

const checkInSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  email: z.string().email().optional().or(z.literal("")),
  purpose: z.string().min(2, "Purpose required"),
  personToMeet: z.string().min(2, "Host name required"),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idNumber: z.string().min(4, "ID Number required"),
  photoUrl: z.string().optional(),
});

type CheckInForm = z.infer<typeof checkInSchema>;
type GadgetForm = { name: string; makeModel: string; serialNumber: string };

function compressPhoto(source: CanvasImageSource, width: number, height: number): Promise<string> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return Promise.reject(new Error("The selected photo has invalid dimensions."));
  }

  const maxDimension = 1280;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Unable to process the selected photo."));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to process the selected photo."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Unable to read the processed photo."));
      };
      reader.onerror = () => reject(new Error("Unable to read the processed photo."));
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.8);
  });
}

export default function CheckIn() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [qrScanError, setQrScanError] = useState<string | null>(null);
  const [gadgets, setGadgets] = useState<GadgetForm[]>([]);
  const [lookupMobile, setLookupMobile] = useState("");
  const [preRegister, setPreRegister] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const now = new Date();
  const minimumVisitDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const form = useForm<CheckInForm>({
    resolver: zodResolver(checkInSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      purpose: "",
      personToMeet: "",
      idProofType: "aadhar",
      idNumber: "",
      photoUrl: "",
    }
  });

  const { data: blacklistEntries } = useGetBlacklist();
  const { data: systemSettings } = useGetSystemSettings();

  const watchedName = form.watch("name");
  const watchedMobile = form.watch("mobile");

  useEffect(() => {
    if (!/^\d{10}$/.test(watchedMobile)) {
      setLookupMobile("");
      return;
    }
    const timeout = window.setTimeout(() => setLookupMobile(watchedMobile), 350);
    return () => window.clearTimeout(timeout);
  }, [watchedMobile]);

  const {
    data: repeatVisitors,
    isLoading: repeatVisitorsLoading,
    isError: repeatVisitorsError,
  } = useLookupVisitorsByMobile(lookupMobile, {
    query: { enabled: /^\d{10}$/.test(lookupMobile) && lookupMobile === watchedMobile },
  });

  const blacklistWarning = useMemo(() => {
    if (!blacklistEntries || (!watchedName && !watchedMobile)) return null;

    const normalizedName = watchedName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedMobile = watchedMobile.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    const match = blacklistEntries.find((entry) => {
      const entryName = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const entryMobile = entry.mobile.toLowerCase().replace(/[^a-z0-9]/g, "");

      if (entryMobile && normalizedMobile && entryMobile === normalizedMobile) return true;
      if (!entryName || !normalizedName) return false;

      return entryName === normalizedName || entryName.includes(normalizedName) || normalizedName.includes(entryName);
    });

    return match ?? null;
  }, [blacklistEntries, watchedName, watchedMobile]);

  const createVisitorMutation = useCreateVisitor({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: data.status === "scheduled" ? t("Future Visit Scheduled") : t("Visitor Checked In"),
          description: t("Visitor ID: ") + data.visitorId,
        });
        setLocation(`/visitor-record/${data.id}`);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Registration Failed", description: err.error });
      }
    }
  });

  const reuseVisitorDetails = (match: NonNullable<typeof repeatVisitors>[number]) => {
    form.setValue("name", match.name, { shouldDirty: true, shouldValidate: true });
    form.setValue("email", match.email ?? "", { shouldDirty: true, shouldValidate: true });
    form.setValue("personToMeet", match.personToMeet, { shouldDirty: true, shouldValidate: true });
    form.setValue("idProofType", match.idProofType, { shouldDirty: true, shouldValidate: true });
    form.setValue("idNumber", match.idNumber, { shouldDirty: true, shouldValidate: true });
    toast({
      title: "Previous details loaded",
      description: t("Review the visitor details, enter this visit's purpose, and capture a fresh photo if required."),
    });
  };

  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setStream(mediaStream);
      setWebcamError(null);
    } catch (err: any) {
      setWebcamError(t("Webcam access denied or unavailable. Please allow camera permissions and try again."));
    }
  };

  const stopWebcam = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        setWebcamError("Camera started but the preview could not play automatically. Please try again.");
      });
    }

    return () => stopWebcam();
  }, [stream, stopWebcam]);

  useEffect(() => {
    if (!qrScanOpen || !scannerVideoRef.current) return;

    let active = true;
    void import("@zxing/browser")
      .then(({ BrowserQRCodeReader }) => {
        if (!active || !scannerVideoRef.current) return undefined;
        const reader = new BrowserQRCodeReader();
        return reader.decodeFromVideoDevice(undefined, scannerVideoRef.current, (result, _error, controls) => {
          if (!active || !result) return;

          controls.stop();
          scannerControlsRef.current = null;
          try {
            const scannedUrl = new URL(result.getText(), window.location.origin);
            const visitorRoute = scannedUrl.pathname.match(/\/visitor\/([^/]+)\/?$/);
            if (scannedUrl.origin !== window.location.origin || !visitorRoute) {
              setQrScanError(t("This QR code is not a visitor pass for this system."));
              return;
            }

            setQrScanOpen(false);
            setLocation(`/visitor-record/${encodeURIComponent(visitorRoute[1])}`);
          } catch {
            setQrScanError(t("The QR code does not contain a valid visitor pass."));
          }
        });
      })
      .then((controls) => {
        if (!controls) return;
        if (active) scannerControlsRef.current = controls;
        else controls.stop();
      })
      .catch((error: unknown) => {
        if (active) {
          setQrScanError(error instanceof Error ? t(error.message) : t("Unable to start the QR scanner."));
        }
      });

    return () => {
      active = false;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [qrScanOpen, setLocation]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        void compressPhoto(canvas, canvas.width, canvas.height).then((dataUrl) => {
          setPreviewPhoto(dataUrl);
          setCapturedPhoto(null);
          form.setValue("photoUrl", dataUrl, { shouldDirty: true, shouldValidate: true });
        }).catch((error: unknown) => {
          toast({
            title: t("Photo Processing Failed"),
            description: error instanceof Error ? t(error.message) : t("Unable to process the selected photo."),
            variant: "destructive",
          });
        });
      }
    }
  };

  const confirmPhoto = () => {
    if (previewPhoto) {
      setCapturedPhoto(previewPhoto);
      form.setValue("photoUrl", previewPhoto);
      stopWebcam();
    }
  };

  const retakePhoto = () => {
    setPreviewPhoto(null);
    form.setValue("photoUrl", "", { shouldDirty: true, shouldValidate: true });
    setWebcamError(null);
    void startWebcam();
  };

  const clearPhoto = () => {
    setCapturedPhoto(null);
    setPreviewPhoto(null);
    form.setValue("photoUrl", "");
  };

  const handlePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      void compressPhoto(image, image.naturalWidth, image.naturalHeight).then((dataUrl) => {
        setPreviewPhoto(dataUrl);
        setCapturedPhoto(null);
        form.setValue("photoUrl", dataUrl, { shouldDirty: true, shouldValidate: true });
      }).catch((error: unknown) => {
        toast({
          title: t("Photo Processing Failed"),
          description: error instanceof Error ? t(error.message) : t("Unable to process the selected photo."),
          variant: "destructive",
        });
      }).finally(() => URL.revokeObjectURL(imageUrl));
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      toast({
        title: t("Photo Upload Failed"),
        description: t("The selected file could not be opened as an image."),
        variant: "destructive",
      });
    };
    image.src = imageUrl;
    event.target.value = "";
  };

  const onSubmit = (data: CheckInForm) => {
    if (preRegister && !scheduledFor) {
      toast({ title: t("Visit date required"), description: t("Select the expected visit date."), variant: "destructive" });
      return;
    }

    if (systemSettings?.requirePhoto && !data.photoUrl) {
      form.setError("photoUrl", { type: "manual", message: t("A visitor photo is required by system settings.") });
      toast({
        title: t("Photo Required"),
        description: t("Capture or upload a visitor photo before registration."),
        variant: "destructive",
      });
      return;
    }

    const completedGadgets = gadgets.filter((gadget) =>
      gadget.name.trim() || gadget.makeModel.trim() || gadget.serialNumber.trim(),
    );
    if (completedGadgets.some((gadget) => !gadget.name.trim())) {
      toast({ title: t("Gadget name required"), description: t("Enter a name for every gadget row you have started."), variant: "destructive" });
      return;
    }

    createVisitorMutation.mutate({
      data: {
        ...data,
        ...(preRegister ? { scheduledFor } : {}),
        ...(completedGadgets.length > 0 ? {
          gadgets: completedGadgets.map((gadget) => ({
            name: gadget.name.trim(),
            makeModel: gadget.makeModel.trim() || null,
            serialNumber: gadget.serialNumber.trim() || null,
          })),
        } : {}),
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-4">
      <div className="relative isolate flex min-h-[88px] items-center overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-sky-50 via-blue-50 to-white p-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] bg-gradient-to-r from-sky-50 via-sky-50/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 sm:block" />
        <div className="relative z-10 flex max-w-[62%] items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Scan className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{preRegister ? t("Pre-register Future Visitor") : t("New Visitor Registration")}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{preRegister ? t("Save visitor details now and check them in when they arrive.") : t("Capture visitor details and check them in.")}</p>
          </div>
        </div>
        <motion.img
          src="/flexible-visitor-registration.png"
          alt={t("Flexible visitor registration")}
          className="absolute inset-y-0 right-0 h-full w-[38%] object-contain object-right"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_300px]">
          {blacklistWarning && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive lg:col-span-2">
              <div className="font-semibold">{t("Security warning")}</div>
              <div>{t("This person matches the blacklist entry for ")}<span className="font-medium">{blacklistWarning.name}</span>.</div>
              <div className="mt-1">{t("Reason")}: {blacklistWarning.reason}</div>
            </div>
          )}
          
          <div className="space-y-3 lg:col-span-1">
            {isAdmin && (
              <Card className="border-primary/10 shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <label className="flex items-start gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={preRegister}
                      onChange={(event) => {
                        setPreRegister(event.target.checked);
                        if (!event.target.checked) setScheduledFor("");
                      }}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>{t("Pre-register a future visit")}</span>
                  </label>
                  {preRegister && (
                    <div className="space-y-1">
                      <label htmlFor="scheduled-visit-date" className="text-sm font-medium">{t("Expected Visit Date")}</label>
                      <Input
                        id="scheduled-visit-date"
                        type="date"
                        min={minimumVisitDate}
                        value={scheduledFor}
                        onChange={(event) => setScheduledFor(event.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">{t("The visitor will not be marked as checked in until security checks them in.")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="space-y-2 p-4 pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground"><UserRound className="h-4 w-4" /></span>
                  {t("Personal Information")}
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-x-3 gap-y-2 p-4 pt-0 sm:grid-cols-2">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("Full Name")}</FormLabel>
                    <FormControl><Input {...field} className="h-9 bg-background text-sm border-border" placeholder={t("John Doe")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("Mobile Number")}</FormLabel>
                    <FormControl><Input {...field} type="tel" inputMode="numeric" maxLength={10} className="h-9 bg-background text-sm border-border" placeholder={t("10-digit mobile number")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                {lookupMobile === watchedMobile && /^\d{10}$/.test(watchedMobile) && (
                  <div className="space-y-2 sm:col-span-2" aria-live="polite">
                    {repeatVisitorsLoading ? (
                      <p className="text-xs text-muted-foreground">{t("Checking for previous visitors...")}</p>
                    ) : repeatVisitorsError ? (
                      <p role="alert" className="text-xs text-destructive">{t("Previous visitor lookup failed. You can continue entering details manually.")}</p>
                    ) : repeatVisitors?.length ? (
                      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                        <p className="mb-2 text-sm font-medium">{t("Previous visitor found. Select a record to reuse details:")}</p>
                        <div className="space-y-2">
                          {repeatVisitors.map((match) => (
                            <div key={match.id} className="flex flex-col gap-2 rounded-md border border-border bg-background p-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-sm font-medium">{match.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {t("Previous host:")} {match.personToMeet} · {new Date(match.createdAt).toLocaleDateString(language === "ta" ? "ta-IN" : "en-US")}
                                </div>
                              </div>
                              <Button type="button" size="sm" variant="outline" onClick={() => reuseVisitorDetails(match)}>
                                {t("Reuse Details")}
                              </Button>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{t("Purpose and photo are not reused. Review all filled details before registration.")}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("No previous visitor found for this mobile number.")}</p>
                    )}
                  </div>
                )}
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("Email Address (Optional)")}</FormLabel>
                    <FormControl><Input {...field} className="h-9 bg-background text-sm border-border" placeholder="john@example.com" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="space-y-2 p-4 pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground"><CalendarDays className="h-4 w-4" /></span>
                  {t("Visit Details")}
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-x-3 gap-y-2 p-4 pt-0 sm:grid-cols-2">
                <FormField control={form.control} name="personToMeet" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("Host / Person to Meet")}</FormLabel>
                    <FormControl><Input {...field} className="h-9 bg-background text-sm border-border" placeholder={t("Jane Smith")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="purpose" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("Purpose of Visit")}</FormLabel>
                    <FormControl><Input {...field} className="h-9 bg-background text-sm border-border" placeholder={t("Meeting, Interview...")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="space-y-2 p-4 pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground"><Scan className="h-4 w-4" /></span>
                  {t("Identity Verification")}
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-x-3 gap-y-2 p-4 pt-0 sm:grid-cols-2">
                <FormField control={form.control} name="idProofType" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("ID Type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 bg-background text-sm border-border">
                          <SelectValue placeholder={t("Select ID type")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="aadhar">{t("Aadhar")}</SelectItem>
                        <SelectItem value="pan">{t("PAN")}</SelectItem>
                        <SelectItem value="passport">{t("Passport")}</SelectItem>
                        <SelectItem value="driving_license">{t("Driving License")}</SelectItem>
                        <SelectItem value="voter_id">{t("Voter ID")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="idNumber" render={({ field }) => (
                  <FormItem className="w-full max-w-[280px] space-y-1">
                    <FormLabel className="text-[13px] leading-4">{t("ID Number")}</FormLabel>
                    <FormControl><Input {...field} className="h-9 bg-background text-sm border-border uppercase font-mono" placeholder="XXXX-XXXX" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="space-y-2 p-4 pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground"><Laptop className="h-4 w-4" /></span>
                  {t("Gadgets Carried Inside (Optional)")}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{t("List each gadget separately. Items remain pending until admin/security review.")}</p>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {gadgets.map((gadget, index) => (
                  <div key={index} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <Input
                      aria-label={`Gadget ${index + 1} name`}
                      className="h-9 text-sm"
                      placeholder={t("Gadget name (required)")}
                      maxLength={150}
                      value={gadget.name}
                      onChange={(event) => setGadgets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                    />
                    <Input
                      aria-label={`Gadget ${index + 1} make/model`}
                      className="h-9 text-sm"
                      placeholder={t("Make / model")}
                      maxLength={150}
                      value={gadget.makeModel}
                      onChange={(event) => setGadgets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, makeModel: event.target.value } : item))}
                    />
                    <Input
                      aria-label={`Gadget ${index + 1} serial number`}
                      className="h-9 text-sm"
                      placeholder={t("Serial number")}
                      maxLength={150}
                      value={gadget.serialNumber}
                      onChange={(event) => setGadgets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, serialNumber: event.target.value } : item))}
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove gadget ${index + 1}`} onClick={() => setGadgets((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {gadgets.length < 25 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setGadgets((current) => [...current, { name: "", makeModel: "", serialNumber: "" }])}>
                    <Plus className="mr-2 h-4 w-4" /> {t("Add Gadget")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 lg:col-span-1">
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="space-y-2 p-4 pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground"><Camera className="h-4 w-4" /></span>
                  {t("Photo Capture")}
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="flex flex-col space-y-3 p-4 pt-0">
                <div className="relative mx-auto flex h-[200px] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-primary/40 bg-gradient-to-br from-sky-50 to-blue-100/50 dark:from-slate-900 dark:to-slate-800">
                  {capturedPhoto ? (
                    <>
                      <img src={capturedPhoto} alt={t("Captured")} className="w-full h-full object-cover" />
                      <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 rounded-full h-8 w-8" onClick={clearPhoto}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : previewPhoto ? (
                    <>
                      <img src={previewPhoto} alt={t("Preview")} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-black/60 backdrop-blur-sm">
                        <div className="flex justify-center gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={confirmPhoto}>{t("Use This")}</Button>
                          <Button type="button" size="sm" variant="outline" className="bg-white/90 text-black hover:bg-white" onClick={retakePhoto}>{t("Retake")}</Button>
                        </div>
                      </div>
                    </>
                  ) : stream ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="flex justify-center">
                        <Button type="button" variant="secondary" size="icon" className="h-11 w-11 rounded-full border-2 border-white/80 bg-white text-black shadow-lg" onClick={capturePhoto}>
                          <Camera className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center p-4 text-center">
                      <UserCircle className="mb-2 h-12 w-12 text-primary/40" />
                      {webcamError ? (
                        <p className="text-xs text-destructive">{webcamError}</p>
                      ) : (
                        <Button type="button" onClick={startWebcam}><Camera className="mr-2 h-4 w-4" />{t("Start Webcam")}</Button>
                      )}
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
                
                <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                  {t("OR")}
                </div>
                <div className="flex w-full gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-9 flex-1 border-primary/25" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />{t("Upload Photo")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 flex-1"
                    onClick={() => {
                      setQrScanError(null);
                      setQrScanOpen(true);
                    }}
                  >
                    <QrCode className="mr-2 h-4 w-4" />{t("Scan Pass")}
                  </Button>
                  {(capturedPhoto || previewPhoto) && (
                    <Button type="button" size="sm" variant="ghost" onClick={clearPhoto}>{t("Remove")}</Button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                <p className="rounded-lg border border-primary/15 bg-primary/5 p-2.5 text-xs leading-relaxed text-muted-foreground">{t("Capture a photo, then choose Use This or Retake. If the camera is blocked, upload a photo instead.")}</p>

                <FormField control={form.control} name="photoUrl" render={({ field }) => (
                  <FormItem className="w-full space-y-1">
                    <FormLabel className="text-[13px] leading-4 text-muted-foreground">{t("Or Manual Photo URL")}</FormLabel>
                    <FormControl><Input {...field} className="h-9 bg-background text-sm" placeholder="https://..." disabled={!!capturedPhoto || !!previewPhoto || !!stream} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Button type="submit" className="h-10 w-full text-sm font-semibold tracking-wide" disabled={createVisitorMutation.isPending}>
              {createVisitorMutation.isPending
                ? t("REGISTERING...")
                : preRegister
                  ? t("SCHEDULE VISIT")
                  : blacklistWarning
                    ? t("REGISTER BLACKLISTED VISITOR")
                    : t("REGISTER VISITOR")}
            </Button>
          </div>

        </form>
      </Form>
      <Dialog open={qrScanOpen} onOpenChange={setQrScanOpen}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Scan Visitor Pass")}</DialogTitle>
          </DialogHeader>
          <video
            ref={scannerVideoRef}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full rounded-lg bg-black object-cover"
          />
          <p className="text-sm text-muted-foreground">{t("Point the camera at a visitor pass QR code to open its check-in or check-out profile.")}</p>
          {qrScanError && <p role="alert" className="text-sm text-destructive">{qrScanError}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
