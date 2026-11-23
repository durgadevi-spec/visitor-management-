import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "wouter";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Camera, CheckCircle2, Upload, UserCircle, X } from "lucide-react";
import { useGetPublicAppointment, submitPublicAppointmentRegistration } from "@/lib/api-client";
import { compressPhoto } from "@/lib/photo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

const registrationSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(150),
  mobile: z.string().regex(/^\d{10}$/, "Enter the 10-digit mobile number that received the link"),
  email: z.string().email("Enter a valid email address"),
  company: z.string().trim().min(1, "Enter your company").max(150),
  fullAddress: z.string().trim().min(5, "Enter your address").max(500),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idProofNumber: z.string().trim().min(2, "Enter your ID proof number").max(100),
  additionalInformation: z.string().trim().max(2000),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function AppointmentRegistration() {
  const { token = "" } = useParams<{ token: string }>();
  const { data: appointment, isLoading, isError, error } = useGetPublicAppointment(token, {
    query: { enabled: !!token },
  });
  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      fullName: "",
      mobile: "",
      email: "",
      company: "",
      fullAddress: "",
      idProofType: "aadhar",
      idProofNumber: "",
      additionalInformation: "",
    },
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!appointment) return;
    form.reset({
      fullName: appointment.visitorName,
      mobile: appointment.mobile,
      email: appointment.email,
      company: appointment.company,
      fullAddress: "",
      idProofType: "aadhar",
      idProofNumber: "",
      additionalInformation: "",
    });
  }, [appointment, form]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  const setPhotoFromImage = async (image: HTMLImageElement) => {
    try {
      const compressed = await compressPhoto(image, image.naturalWidth, image.naturalHeight);
      setPhotoUrl(compressed);
      setPhotoError("");
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to process the selected photo.");
    }
  };

  const onPhotoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setPhotoError("Choose a JPEG, PNG, or WebP photo under 10 MB.");
      event.target.value = "";
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      void setPhotoFromImage(image).finally(() => URL.revokeObjectURL(objectUrl));
    };
    image.onerror = () => {
      setPhotoError("Unable to open the selected photo.");
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setStream(mediaStream);
      setCameraOpen(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Unable to start the camera.");
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError("The camera is not ready yet.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Unable to process the captured photo.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    void compressPhoto(canvas, canvas.width, canvas.height)
      .then((compressed) => {
        setPhotoUrl(compressed);
        setPhotoError("");
        stopCamera();
      })
      .catch((error: unknown) => setCameraError(error instanceof Error ? error.message : "Unable to process the captured photo."));
  };

  const onSubmit = async (values: RegistrationForm) => {
    if (!photoUrl) {
      setPhotoError("A visitor photo is required to submit registration.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await submitPublicAppointmentRegistration(token, { ...values, photoUrl });
      setSubmitted(result.appointmentNumber);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to submit appointment registration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedSchedule = appointment
    ? new Intl.DateTimeFormat("en-IN", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: appointment.timezone,
    }).format(new Date(appointment.scheduledAt))
    : "";

  if (isLoading) {
    return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-2xl"><CardContent className="space-y-4 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-5 w-full" /><Skeleton className="h-64 w-full" /></CardContent></Card></main>;
  }

  if (isError || !appointment) {
    return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="p-8 text-center"><h1 className="text-xl font-semibold">Registration link unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error?.error ?? "Ask the organization that invited you for a new appointment link."}</p></CardContent></Card></main>;
  }

  if (submitted) {
    return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-xl font-semibold">Registration submitted</h1><p className="mt-2 text-sm text-muted-foreground">Your details for appointment <span className="font-medium text-foreground">{submitted}</span> are awaiting administrator review.</p></CardContent></Card></main>;
  }

  if (appointment.status !== "pending") {
    return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="p-8 text-center"><h1 className="text-xl font-semibold">Appointment update</h1><p className="mt-2 text-sm text-muted-foreground">This appointment is currently <span className="font-medium text-foreground">{appointment.status.replace(/_/g, " ")}</span>. Contact {appointment.organizationName} if you need help.</p></CardContent></Card></main>;
  }

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-8">
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <p className="text-sm font-medium text-primary">{appointment.organizationName}</p>
          <CardTitle>Visitor registration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Appointment {appointment.appointmentNumber} · {formattedSchedule}
          </p>
          <p className="text-sm text-muted-foreground">
            Meeting {appointment.meetingPerson} · {appointment.department} · {appointment.purpose}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name" error={form.formState.errors.fullName?.message}><Input {...form.register("fullName")} /></FormField>
              <FormField label="Mobile number" error={form.formState.errors.mobile?.message}><Input {...form.register("mobile")} readOnly /></FormField>
              <FormField label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register("email")} /></FormField>
              <FormField label="Company" error={form.formState.errors.company?.message}><Input {...form.register("company")} /></FormField>
            </div>
            <FormField label="Full address" error={form.formState.errors.fullAddress?.message}><Textarea {...form.register("fullAddress")} rows={2} /></FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="ID proof type" error={form.formState.errors.idProofType?.message}>
                <Select value={form.watch("idProofType")} onValueChange={(value) => form.setValue("idProofType", value as RegistrationForm["idProofType"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aadhar">Aadhaar</SelectItem><SelectItem value="pan">PAN</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem><SelectItem value="driving_license">Driving licence</SelectItem>
                    <SelectItem value="voter_id">Voter ID</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="ID proof number" error={form.formState.errors.idProofNumber?.message}><Input {...form.register("idProofNumber")} /></FormField>
            </div>
            <FormField label="Additional information" error={form.formState.errors.additionalInformation?.message}><Textarea {...form.register("additionalInformation")} rows={3} /></FormField>
            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h2 className="text-sm font-semibold">Visitor photo</h2>
                <p className="text-xs text-muted-foreground">Capture a photo or upload a JPEG, PNG, or WebP image. It is resized before submission.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={startCamera}><Camera className="mr-2 h-4 w-4" />Use camera</Button>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Upload photo</Button>
                {photoUrl && <Button type="button" variant="ghost" onClick={() => setPhotoUrl("")}><X className="mr-2 h-4 w-4" />Remove</Button>}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhotoSelect} />
              {cameraOpen && <div className="space-y-2"><video ref={videoRef} autoPlay playsInline muted className="max-h-72 w-full rounded-md bg-black object-contain" /><div className="flex gap-2"><Button type="button" onClick={capturePhoto}>Capture photo</Button><Button type="button" variant="outline" onClick={stopCamera}>Cancel camera</Button></div></div>}
              <canvas ref={canvasRef} className="hidden" />
              {photoUrl ? <img src={photoUrl} alt="Visitor preview" className="h-36 w-36 rounded-md border object-cover" /> : <div className="flex h-24 items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground"><UserCircle className="h-6 w-6" />Photo required</div>}
              {(photoError || cameraError) && <p role="alert" className="text-sm text-destructive">{photoError || cameraError}</p>}
            </section>
            <Button className="w-full" type="submit" disabled={isSubmitting || !photoUrl}>
              {isSubmitting ? "Submitting…" : "Submit registration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}{error && <span className="block text-xs text-destructive">{error}</span>}</label>;
}
