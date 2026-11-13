import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save, Upload, X, RotateCcw, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  getGetSystemSettingsQueryKey,
  useGetSystemSettings,
  useUpdateSystemSettings,
  type SystemSettings,
} from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";

const settingsSchema = z.object({
  facilityName: z.string().trim().min(1, "Facility name is required"),
  companyLogo: z.string()
    .max(350_000, "Company logo is too large")
    .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/, "Upload a valid company logo")
    .nullable(),
  contactEmail: z.string().trim().min(1, "Contact email is required"),
  autoCheckoutEnabled: z.boolean(),
  autoCheckoutTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  requirePhoto: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;
type CropPosition = { x: number; y: number };

function drawLogoCrop(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  width: number,
  zoom: number,
  rotation: number,
  position: CropPosition,
) {
  const height = width / 3;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.clearRect(0, 0, width, height);
  const radians = (rotation * Math.PI) / 180;
  const rotatedWidth = Math.abs(image.naturalWidth * Math.cos(radians)) + Math.abs(image.naturalHeight * Math.sin(radians));
  const rotatedHeight = Math.abs(image.naturalWidth * Math.sin(radians)) + Math.abs(image.naturalHeight * Math.cos(radians));
  const scale = Math.max(width / rotatedWidth, height / rotatedHeight) * zoom;

  context.save();
  context.translate(width / 2 + position.x * (width / 600), height / 2 + position.y * (width / 600));
  context.rotate(radians);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  return true;
}

const defaultSettings: SettingsForm = {
  facilityName: "Concept Trunk Interiors",
  companyLogo: null,
  contactEmail: "www.ctint.in",
  autoCheckoutEnabled: true,
  autoCheckoutTime: "23:59",
  timezone: "Asia/Kolkata",
  requirePhoto: false,
};

export default function Settings() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"branding" | "system">("branding");
  const { data: settings, isLoading, isError } = useGetSystemSettings();
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; position: CropPosition } | null>(null);
  const [logoSource, setLogoSource] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropRotation, setCropRotation] = useState(0);
  const [cropPosition, setCropPosition] = useState<CropPosition>({ x: 0, y: 0 });
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultSettings,
  });

  useEffect(() => {
    if (!settings) return;
    form.reset({
      facilityName: settings.facilityName,
      companyLogo: settings.companyLogo ?? null,
      contactEmail: settings.contactEmail,
      autoCheckoutEnabled: settings.autoCheckoutEnabled,
      autoCheckoutTime: settings.autoCheckoutTime,
      timezone: settings.timezone,
      requirePhoto: settings.requirePhoto,
    });
  }, [settings, form]);

  const updateMutation = useUpdateSystemSettings({
    mutation: {
      onSuccess: (updatedSettings: SystemSettings) => {
        queryClient.setQueryData(getGetSystemSettingsQueryKey(), updatedSettings);
        toast({ title: t("Settings Saved"), description: t("System preferences have been updated.") });
      },
      onError: (error) => {
        toast({ title: t("Save Failed"), description: t(error.error), variant: "destructive" });
      },
    },
  });

  const onSubmit = (values: SettingsForm) => updateMutation.mutate(values);
  const companyLogo = form.watch("companyLogo");

  useEffect(() => {
    if (logoSource) return () => URL.revokeObjectURL(logoSource);
  }, [logoSource]);

  useEffect(() => {
    if (!logoImage || !cropDialogOpen || !cropCanvasRef.current) return;
    drawLogoCrop(logoImage, cropCanvasRef.current, 600, cropZoom, cropRotation, cropPosition);
  }, [logoImage, cropDialogOpen, cropZoom, cropRotation, cropPosition]);

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("Invalid logo"), description: t("Choose an image file for the company logo."), variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("Logo too large"), description: t("Choose an image smaller than 5 MB."), variant: "destructive" });
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setLogoSource(imageUrl);
      setLogoImage(image);
      setCropZoom(1);
      setCropRotation(0);
      setCropPosition({ x: 0, y: 0 });
      setCropDialogOpen(true);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      toast({ title: t("Logo upload failed"), description: t("The selected file could not be opened as an image."), variant: "destructive" });
    };
    image.src = imageUrl;
  };

  const closeCropDialog = () => {
    setCropDialogOpen(false);
    setLogoImage(null);
    setLogoSource(null);
  };

  const saveLogoCrop = () => {
    if (!logoImage) return;
    const output = document.createElement("canvas");
    if (!drawLogoCrop(logoImage, output, 1200, cropZoom, cropRotation, cropPosition)) {
      toast({ title: t("Logo processing failed"), description: t("Unable to crop this image. Please try again."), variant: "destructive" });
      return;
    }
    const dataUrl = output.toDataURL("image/png");
    if (dataUrl.length > 350_000) {
      toast({ title: t("Logo too large"), description: t("Choose a simpler or smaller image."), variant: "destructive" });
      return;
    }
    form.setValue("companyLogo", dataUrl, { shouldDirty: true, shouldValidate: true });
    closeCropDialog();
  };

  const moveCropImage = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = 600 / rect.width;
    setCropPosition({
      x: dragStartRef.current.position.x + (event.clientX - dragStartRef.current.x) * scale,
      y: dragStartRef.current.position.y + (event.clientY - dragStartRef.current.y) * scale,
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <SettingsIcon className="h-6 w-6 text-primary" />
          {t("System Preferences")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("Global configuration for the VMS environment.")}</p>
      </div>

      {isError ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t("Unable to load system settings. Refresh the page and try again.")}
        </p>
      ) : isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
          <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label="Settings sections">
            <Button type="button" variant={activeTab === "branding" ? "default" : "ghost"} role="tab" aria-selected={activeTab === "branding"} onClick={() => setActiveTab("branding")}>
              {t("Company Branding")}
            </Button>
            <Button type="button" variant={activeTab === "system" ? "default" : "ghost"} role="tab" aria-selected={activeTab === "system"} onClick={() => setActiveTab("system")}>
              {t("System Settings")}
            </Button>
          </div>

          {activeTab === "branding" ? (
            <Card className="border-border bg-card" role="tabpanel">
              <CardHeader>
                <CardTitle>{t("Company Branding")}</CardTitle>
                <CardDescription>{t("Company name and logo shown on visitor passes.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="facilityName">{t("Company Name")}</Label>
                    <Input id="facilityName" {...form.register("facilityName")} className="bg-background" />
                    {form.formState.errors.facilityName && (
                      <p className="text-sm text-destructive">{t(form.formState.errors.facilityName.message ?? "")}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("Company Logo")}</Label>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-28 w-40 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-2">
                      {companyLogo
                        ? <img src={companyLogo} alt="Company logo preview" className="max-h-full max-w-full object-contain" />
                        : <span className="text-sm text-muted-foreground">{t("No logo uploaded")}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4" /> {t("Upload Logo")}
                      </Button>
                      {companyLogo && (
                        <Button type="button" variant="ghost" onClick={() => form.setValue("companyLogo", null, { shouldDirty: true })}>
                          <X className="mr-2 h-4 w-4" /> {t("Remove Logo")}
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("Image files up to 5 MB can be cropped, resized, and rotated before saving.")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
            <Card className="border-border bg-card" role="tabpanel">
              <CardHeader>
                <CardTitle>{t("Organization Contact")}</CardTitle>
                <CardDescription>{t("Contact details displayed on visitor badges and communications.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-md space-y-2">
                  <Label htmlFor="contactEmail">{t("Contact Email")}</Label>
                  <Input id="contactEmail" {...form.register("contactEmail")} className="bg-background" />
                  {form.formState.errors.contactEmail && (
                    <p className="text-sm text-destructive">{t(form.formState.errors.contactEmail.message ?? "")}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>{t("Security Defaults")}</CardTitle>
                <CardDescription>{t("Automated rules for visitor handling.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoCheckoutEnabled">{t("Auto-Checkout")}</Label>
                  <p className="text-sm text-muted-foreground">{t("Automatically check out visitors at the selected time and timezone.")}</p>
                </div>
                <Controller
                  control={form.control}
                  name="autoCheckoutEnabled"
                  render={({ field }) => (
                    <Switch id="autoCheckoutEnabled" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="autoCheckoutTime">{t("Automatic Checkout Time")}</Label>
                  <Input
                    id="autoCheckoutTime"
                    type="time"
                    {...form.register("autoCheckoutTime")}
                    disabled={!form.watch("autoCheckoutEnabled")}
                    className="bg-background"
                  />
                  {form.formState.errors.autoCheckoutTime && (
                    <p className="text-sm text-destructive">{t(form.formState.errors.autoCheckoutTime.message ?? "")}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">{t("Timezone (IANA)")}</Label>
                  <Input id="timezone" {...form.register("timezone")} placeholder="Asia/Kolkata" className="bg-background" />
                  {form.formState.errors.timezone && (
                    <p className="text-sm text-destructive">{t(form.formState.errors.timezone.message ?? "")}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="space-y-0.5">
                  <Label>{t("Require Host Approval")}</Label>
                  <p className="text-sm text-muted-foreground">{t("Approval is disabled; visitors are checked in when registered.")}</p>
                </div>
                <Switch checked={false} disabled aria-label={t("Host approval is disabled")} />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="space-y-0.5">
                  <Label htmlFor="requirePhoto">{t("Photo Capture Enforced")}</Label>
                  <p className="text-sm text-muted-foreground">{t("Require a photo before visitor check-in can be completed.")}</p>
                </div>
                <Controller
                  control={form.control}
                  name="requirePhoto"
                  render={({ field }) => (
                    <Switch id="requirePhoto" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
              </CardContent>
            </Card>
            </>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending || !settings}>
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? t("Saving...") : t("Save Configuration")}
            </Button>
          </div>
        </form>
      )}
      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCropDialog();
          else setCropDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Adjust Company Logo")}</DialogTitle>
            <DialogDescription>{t("Drag to position, zoom, or rotate. The 3:1 preview matches the logo space on visitor passes.")}</DialogDescription>
          </DialogHeader>
          <div
            className="overflow-hidden rounded-md border border-border"
            style={{ backgroundImage: "linear-gradient(45deg, #d8d8d8 25%, transparent 25%), linear-gradient(-45deg, #d8d8d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d8d8d8 75%), linear-gradient(-45deg, transparent 75%, #d8d8d8 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0" }}
          >
            <canvas
              ref={cropCanvasRef}
              aria-label={t("Company logo crop preview")}
              className="block aspect-[3/1] w-full touch-none cursor-move"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragStartRef.current = { x: event.clientX, y: event.clientY, position: cropPosition };
              }}
              onPointerMove={moveCropImage}
              onPointerUp={() => { dragStartRef.current = null; }}
              onPointerCancel={() => { dragStartRef.current = null; }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="logo-zoom">{t("Zoom")}</Label>
              <input
                id="logo-zoom"
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" aria-label={t("Rotate logo left")} onClick={() => setCropRotation((value) => (value + 270) % 360)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" aria-label={t("Rotate logo right")} onClick={() => setCropRotation((value) => (value + 90) % 360)}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCropDialog}>{t("Cancel")}</Button>
            <Button type="button" onClick={saveLogoCrop}>{t("Use Crop")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
