import { useRef, useState, useCallback, useEffect, useMemo, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateVisitor, useGetBlacklist } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, X, Scan, UserCircle, UserRound, CalendarDays, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

const checkInSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().min(10, "Valid mobile required"),
  email: z.string().email().optional().or(z.literal("")),
  purpose: z.string().min(2, "Purpose required"),
  personToMeet: z.string().min(2, "Host name required"),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idNumber: z.string().min(4, "ID Number required"),
  photoUrl: z.string().optional(),
});

type CheckInForm = z.infer<typeof checkInSchema>;

export default function CheckIn() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const form = useForm<CheckInForm>({
    resolver: zodResolver(checkInSchema),
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

  const watchedName = form.watch("name");
  const watchedMobile = form.watch("mobile");

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
        toast({ title: "Registration Successful", description: "Visitor ID: " + data.visitorId });
        setLocation(`/visitor/${data.id}`);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Registration Failed", description: err.error });
      }
    }
  });

  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setStream(mediaStream);
      setWebcamError(null);
    } catch (err: any) {
      setWebcamError("Webcam access denied or unavailable. Please allow camera permissions and try again.");
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
        const dataUrl = canvas.toDataURL("image/jpeg");
        setPreviewPhoto(dataUrl);
        setCapturedPhoto(null);
        form.setValue("photoUrl", "");
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

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewPhoto(dataUrl);
      setCapturedPhoto(null);
      form.setValue("photoUrl", "");
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = (data: CheckInForm) => {
    createVisitorMutation.mutate({ data });
  };

  return (
    <div className="w-full space-y-5">
      <div className="relative isolate flex min-h-28 flex-col justify-between gap-4 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-sky-50 via-blue-50 to-white p-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 md:min-h-28 md:flex-row md:items-center">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] bg-gradient-to-r from-sky-50 via-sky-50/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 md:block" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Scan className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">New Visitor Registration</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">Capture details and issue security clearance.</p>
          </div>
        </div>
        <motion.img
          src="/check-in-illustration.png"
          alt="A visitor checking in at a reception desk"
          className="h-28 w-full rounded-lg object-contain object-center md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[38%] md:px-2 md:py-1 md:rounded-none"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {blacklistWarning && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive lg:col-span-12">
              <div className="font-semibold">Security warning</div>
              <div>This person matches the blacklist entry for <span className="font-medium">{blacklistWarning.name}</span>.</div>
              <div className="mt-1">Reason: {blacklistWarning.reason}</div>
            </div>
          )}
          
          <div className="space-y-5 lg:col-span-8">
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><UserRound className="h-5 w-5" /></span>
                  Personal Information
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} className="bg-background border-border" placeholder="John Doe" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Mobile Number</FormLabel>
                    <FormControl><Input {...field} className="bg-background border-border" placeholder="+1..." /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Email Address (Optional)</FormLabel>
                    <FormControl><Input {...field} className="bg-background border-border" placeholder="john@example.com" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><CalendarDays className="h-5 w-5" /></span>
                  Visit Details
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="personToMeet" render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Host / Person to Meet</FormLabel>
                    <FormControl><Input {...field} className="bg-background border-border" placeholder="Jane Smith" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="purpose" render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Purpose of Visit</FormLabel>
                    <FormControl><Input {...field} className="bg-background border-border" placeholder="Meeting, Interview..." /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Scan className="h-5 w-5" /></span>
                  Identity Verification
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="idProofType" render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>ID Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background border-border">
                          <SelectValue placeholder="Select ID type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="aadhar">Aadhar</SelectItem>
                        <SelectItem value="pan">PAN</SelectItem>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="driving_license">Driving License</SelectItem>
                        <SelectItem value="voter_id">Voter ID</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="idNumber" render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>ID Number</FormLabel>
                    <FormControl><Input {...field} className="bg-background border-border uppercase font-mono" placeholder="XXXX-XXXX" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5 lg:col-span-4">
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Camera className="h-5 w-5" /></span>
                  Photo Capture
                </CardTitle>
                <div className="h-px bg-gradient-to-r from-primary/60 to-primary/10" />
              </CardHeader>
              <CardContent className="flex flex-col space-y-4">
                <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-primary/40 bg-gradient-to-br from-sky-50 to-blue-100/50 dark:from-slate-900 dark:to-slate-800">
                  {capturedPhoto ? (
                    <>
                      <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
                      <Button variant="destructive" size="icon" className="absolute top-2 right-2 rounded-full h-8 w-8" onClick={clearPhoto}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : previewPhoto ? (
                    <>
                      <img src={previewPhoto} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-black/60 backdrop-blur-sm">
                        <div className="flex justify-center gap-2">
                          <Button variant="secondary" onClick={confirmPhoto}>Use This</Button>
                          <Button variant="outline" className="bg-white/90 text-black hover:bg-white" onClick={retakePhoto}>Retake</Button>
                        </div>
                      </div>
                    </>
                  ) : stream ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="flex justify-center">
                          <Button variant="secondary" size="icon" className="h-14 w-14 rounded-full border-4 border-white/80 bg-white text-black shadow-lg" onClick={capturePhoto}>
                            <Camera className="h-6 w-6" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center p-4 text-center">
                      <UserCircle className="mb-3 h-16 w-16 text-primary/40" />
                      {webcamError ? (
                        <p className="text-xs text-destructive">{webcamError}</p>
                      ) : (
                        <Button type="button" onClick={startWebcam}><Camera className="mr-2 h-4 w-4" />Start Webcam</Button>
                      )}
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
                
                <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                  OR
                </div>
                <div className="flex w-full gap-2">
                  <Button type="button" variant="outline" className="flex-1 border-primary/25" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />Upload Photo
                  </Button>
                  {(capturedPhoto || previewPhoto) && (
                    <Button type="button" variant="ghost" onClick={clearPhoto}>Remove</Button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                <p className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">Capture a photo, then choose Use This or Retake. If the camera is blocked, upload a photo instead.</p>

                <FormField control={form.control} name="photoUrl" render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="text-xs text-muted-foreground">Or Manual Photo URL</FormLabel>
                    <FormControl><Input {...field} className="bg-background text-xs" placeholder="https://..." disabled={!!capturedPhoto || !!previewPhoto || !!stream} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Button type="submit" className="w-full h-12 text-lg font-bold tracking-wider" disabled={createVisitorMutation.isPending}>
              {createVisitorMutation.isPending ? "REGISTERING..." : blacklistWarning ? "REGISTER BLACKLISTED VISITOR" : "REGISTER VISITOR"}
            </Button>
          </div>

        </form>
      </Form>
    </div>
  );
}
