import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save } from "lucide-react";
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

const settingsSchema = z.object({
  facilityName: z.string().trim().min(1, "Facility name is required"),
  contactEmail: z.string().trim().min(1, "Contact email is required"),
  autoCheckoutEnabled: z.boolean(),
  autoCheckoutTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  requirePhoto: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const defaultSettings: SettingsForm = {
  facilityName: "Concept Trunk Interiors",
  contactEmail: "www.ctint.in",
  autoCheckoutEnabled: true,
  autoCheckoutTime: "23:59",
  timezone: "Asia/Kolkata",
  requirePhoto: false,
};

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading, isError } = useGetSystemSettings();
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultSettings,
  });

  useEffect(() => {
    if (!settings) return;
    form.reset({
      facilityName: settings.facilityName,
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
        toast({ title: "Settings Saved", description: "System preferences have been updated." });
      },
      onError: (error) => {
        toast({ title: "Save Failed", description: error.error, variant: "destructive" });
      },
    },
  });

  const onSubmit = (values: SettingsForm) => updateMutation.mutate(values);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <SettingsIcon className="h-6 w-6 text-primary" />
          System Preferences
        </h1>
        <p className="text-sm text-muted-foreground">Global configuration for the VMS environment.</p>
      </div>

      {isError ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load system settings. Refresh the page and try again.
        </p>
      ) : isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Organization Identity</CardTitle>
              <CardDescription>Details displayed on visitor badges and communications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="facilityName">Facility Name</Label>
                  <Input id="facilityName" {...form.register("facilityName")} className="bg-background" />
                  {form.formState.errors.facilityName && (
                    <p className="text-sm text-destructive">{form.formState.errors.facilityName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input id="contactEmail" {...form.register("contactEmail")} className="bg-background" />
                  {form.formState.errors.contactEmail && (
                    <p className="text-sm text-destructive">{form.formState.errors.contactEmail.message}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Security Defaults</CardTitle>
              <CardDescription>Automated rules for visitor handling.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoCheckoutEnabled">Auto-Checkout</Label>
                  <p className="text-sm text-muted-foreground">Automatically check out visitors at the selected time and timezone.</p>
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
                  <Label htmlFor="autoCheckoutTime">Automatic Checkout Time</Label>
                  <Input
                    id="autoCheckoutTime"
                    type="time"
                    {...form.register("autoCheckoutTime")}
                    disabled={!form.watch("autoCheckoutEnabled")}
                    className="bg-background"
                  />
                  {form.formState.errors.autoCheckoutTime && (
                    <p className="text-sm text-destructive">{form.formState.errors.autoCheckoutTime.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone (IANA)</Label>
                  <Input id="timezone" {...form.register("timezone")} placeholder="Asia/Kolkata" className="bg-background" />
                  {form.formState.errors.timezone && (
                    <p className="text-sm text-destructive">{form.formState.errors.timezone.message}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="space-y-0.5">
                  <Label>Require Host Approval</Label>
                  <p className="text-sm text-muted-foreground">Approval is disabled; visitors are checked in when registered.</p>
                </div>
                <Switch checked={false} disabled aria-label="Host approval is disabled" />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="space-y-0.5">
                  <Label htmlFor="requirePhoto">Photo Capture Enforced</Label>
                  <p className="text-sm text-muted-foreground">Require a photo before visitor check-in can be completed.</p>
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

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending || !settings}>
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
