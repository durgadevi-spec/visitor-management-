import { useLocation, useParams } from "wouter";
import { jsPDF } from "jspdf";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useGetVisitor, 
  useGetVisitorAudit,
  useGetVisitorGadgets,
  getGetVisitorQueryKey,
  getGetVisitorAuditQueryKey,
  getGetVisitorGadgetsQueryKey,
  getGetVisitorsQueryKey,
  useCheckinVisitor,
  useCheckoutVisitor,
  useReviewVisitorGadget,
  useReturnVisitorGadget,
  useUpdateVisitor,
  useGetSystemSettings,
  type UpdateVisitorInput,
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  UserCircle, Printer, LogIn, LogOut, 
  Clock, ShieldAlert, FileText, Phone, Mail, Building, ArrowLeft, Pencil, History
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

const editVisitorSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  email: z.string().email().optional().or(z.literal("")),
  purpose: z.string().min(2, "Purpose required"),
  personToMeet: z.string().min(2, "Host name required"),
  idProofType: z.enum(["aadhar", "pan", "passport", "driving_license", "voter_id"]),
  idNumber: z.string().min(4, "ID Number required"),
});

export default function VisitorDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, formatDate, language } = useLanguage();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const editForm = useForm<UpdateVisitorInput>({
    resolver: zodResolver(editVisitorSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      purpose: "",
      personToMeet: "",
      idProofType: "aadhar",
      idNumber: "",
    },
  });
  
  const { data: visitor, isLoading } = useGetVisitor(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetVisitorQueryKey(id!)
    }
  });
  const { data: systemSettings } = useGetSystemSettings();
  const { data: auditEntries, isLoading: auditLoading, isError: auditError } = useGetVisitorAudit(id!, {
    query: { enabled: !!id },
  });
  const { data: gadgets, isLoading: gadgetsLoading, isError: gadgetsError } = useGetVisitorGadgets(id!, {
    query: { enabled: !!id },
  });
  const canReviewGadgets = user?.role === "admin" || user?.role === "security";
  const gadgetsPendingCheckout = gadgets?.some((gadget) =>
    gadget.approvalStatus === "approved" && !gadget.returnedAt,
  ) ?? false;

  const refreshGadgets = () => {
    queryClient.invalidateQueries({ queryKey: getGetVisitorGadgetsQueryKey(id!) });
    queryClient.invalidateQueries({ queryKey: getGetVisitorAuditQueryKey(id!) });
  };

  useEffect(() => {
    if (!visitor) return;

    let active = true;
    setQrCodeImage(null);
    const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    const visitorUrl = new URL(`${appBasePath}/visitor/${visitor.id}`, window.location.origin).toString();
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(visitorUrl, { width: 256, margin: 1, errorCorrectionLevel: "M" }))
      .then((image) => {
        if (active) setQrCodeImage(image);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast({
          title: t("QR Code Generation Failed"),
          description: error instanceof Error ? t(error.message) : t("Unable to generate the visitor pass QR code."),
          variant: "destructive",
        });
      });

    return () => {
      active = false;
    };
  }, [visitor?.id, toast, t]);

  const checkinMutation = useCheckinVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Checked In"), description: t("Visitor has been checked in.") });
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVisitorAuditQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVisitorsQueryKey() });
      }
    }
  });

  const checkoutMutation = useCheckoutVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Checked Out"), description: t("Visitor has been checked out.") });
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVisitorAuditQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVisitorsQueryKey() });
      },
      onError: (error) => toast({ title: t("Check Out Failed"), description: t(error.error), variant: "destructive" }),
    }
  });

  const reviewGadgetMutation = useReviewVisitorGadget({
    mutation: {
      onSuccess: refreshGadgets,
      onError: (error) => toast({ title: t("Gadget Review Failed"), description: t(error.error), variant: "destructive" }),
    },
  });
  const returnGadgetMutation = useReturnVisitorGadget({
    mutation: {
      onSuccess: refreshGadgets,
      onError: (error) => toast({ title: t("Return Verification Failed"), description: t(error.error), variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Visitor Updated"), description: t("Visitor details have been saved.") });
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVisitorAuditQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVisitorsQueryKey() });
      },
      onError: (error) => {
        toast({ title: t("Update Failed"), description: t(error.error), variant: "destructive" });
      },
    },
  });

  useEffect(() => {
    if (!visitor || !editOpen) return;
    editForm.reset({
      name: visitor.name,
      mobile: visitor.mobile,
      email: visitor.email ?? "",
      purpose: visitor.purpose,
      personToMeet: visitor.personToMeet,
      idProofType: visitor.idProofType,
      idNumber: visitor.idNumber,
    });
  }, [visitor, editOpen, editForm]);

  const handleCheckin = () => checkinMutation.mutate({ id: id! });
  const handleCheckout = () => checkoutMutation.mutate({ id: id! });
  const handleGadgetReview = (gadgetId: number, action: "approve" | "reject") =>
    reviewGadgetMutation.mutate({ visitorId: id!, gadgetId, action });
  const handleGadgetReturn = (gadgetId: number) =>
    returnGadgetMutation.mutate({ visitorId: id!, gadgetId });
  const handleUpdate = (data: UpdateVisitorInput) => updateMutation.mutate({ id: id!, data });

  const printBadge = () => {
    window.print();
  };

  const downloadVisitorPassPdf = async () => {
    if (!visitor) return;
    if (!qrCodeImage) {
      toast({ title: t("QR Code Not Ready"), description: t("Please wait for the visitor pass QR code to load."), variant: "destructive" });
      return;
    }
    const pdfText = language === "ta" ? (text: string) => text : t;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
    const pageWidth = 105;
    const pageHeight = 148;
    const cardX = 7;
    const cardY = 7;
    const cardW = 91;
    const cardH = 134;

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, "F");
    doc.setDrawColor(20, 20, 20);
    doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(systemSettings?.facilityName ?? pdfText("Visitor Management"), 52.5, 14, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(pdfText("Visitor Pass"), 52.5, 20, { align: "center" });
    doc.setFontSize(6);
    doc.text(systemSettings?.contactEmail ?? "", 52.5, 25, { align: "center" });

    if (systemSettings?.companyLogo) {
      doc.addImage(systemSettings.companyLogo, systemSettings.companyLogo.startsWith("data:image/png") ? "PNG" : "JPEG", 10, 10, 21, 7);
    } else {
      doc.setDrawColor(80, 80, 80);
      doc.roundedRect(11, 8, 12, 12, 1.2, 1.2, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text((systemSettings?.facilityName ?? "VMS").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "VMS", 17, 14, { align: "center" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(visitor.name.toUpperCase(), 52.5, 36, { align: "center" });

    const photoY = 42;
    const photoW = 26;
    const photoH = 30;
    const photoX = 39.5;
    if (visitor.photoUrl) {
      try {
        doc.addImage(visitor.photoUrl, "JPEG", photoX, photoY, photoW, photoH);
      } catch {
        doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, "S");
        doc.setFontSize(8);
        doc.text(pdfText("No Photo"), photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
      }
    } else {
      doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, "S");
      doc.setFontSize(8);
      doc.text(pdfText("No Photo"), photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
    }

    const detailsY = 80;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const details = [
      `Visitor ID: ${visitor.visitorId}`,
      `Host: ${visitor.personToMeet}`,
      `Purpose: ${visitor.purpose}`,
      `${visitor.scheduledFor ? "Expected Visit Date" : "Date"}: ${visitor.scheduledFor
        ? new Date(`${visitor.scheduledFor}T00:00:00`).toLocaleDateString("en-US")
        : new Date(visitor.createdAt).toLocaleDateString("en-US")}`,
      `Mobile: ${visitor.mobile}`,
    ];

    details.forEach((line, index) => {
      const y = detailsY + index * 7;
      doc.text(line, 15, y);
    });

    doc.addImage(qrCodeImage, "PNG", 40, 110, 25, 25);
    doc.setFontSize(6.5);
    doc.text("Scan this code to view the visitor pass.", 52.5, 138, { align: "center" });

    doc.save(`visitor-pass-${visitor.visitorId}.pdf`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "checked_in": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "checked_out": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "rejected": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "approved": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "scheduled": return "bg-amber-500/20 text-amber-500 border-amber-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!visitor) return <div>{t("Visitor not found")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("Visitor Profile")}</h1>
          <p className="text-sm text-muted-foreground">{t("ID:")} <span className="font-mono">{visitor.visitorId}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("Back to Dashboard")}
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> {t("Edit Visitor")}
          </Button>
          {(visitor.status === "scheduled" || visitor.status === "pending" || visitor.status === "approved") && (
            <Button variant="default" className="bg-blue-500 hover:bg-blue-600 text-white" onClick={handleCheckin} disabled={checkinMutation.isPending}>
              <LogIn className="mr-2 h-4 w-4" /> {t("Check In")}
            </Button>
          )}
          {visitor.status === "checked_in" && (
            <Button
              variant="default"
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || gadgetsLoading || gadgetsError || gadgetsPendingCheckout}
            >
              <LogOut className="mr-2 h-4 w-4" /> {gadgetsPendingCheckout ? t("Verify Gadget Returns") : t("Check Out")}
            </Button>
          )}
          <Button variant="secondary" onClick={printBadge}>
            <Printer className="mr-2 h-4 w-4" /> {t("Print Badge")}
          </Button>
          <Button variant="outline" onClick={downloadVisitorPassPdf}>
            <Printer className="mr-2 h-4 w-4" /> {t("Download PDF")}
          </Button>
        </div>
      </div>
      {visitor.status === "checked_in" && gadgetsError && (
        <p role="alert" className="text-sm text-destructive print:hidden">{t("Gadget status could not be verified, so checkout is temporarily unavailable. Refresh and try again.")}</p>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Edit Visitor Details")}</DialogTitle>
            <CardDescription>{t("Update the visitor's registration information.")}</CardDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdate)} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Full Name")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="mobile" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Mobile Number")}</FormLabel>
                  <FormControl><Input {...field} type="tel" inputMode="numeric" maxLength={10} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Email Address (Optional)")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="personToMeet" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Host / Person to Meet")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="purpose" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Purpose of Visit")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="idProofType" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ID Type")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder={t("Select ID type")} /></SelectTrigger>
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
              <FormField control={editForm.control} name="idNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ID Number")}</FormLabel>
                  <FormControl><Input {...field} className="font-mono uppercase" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>{t("Cancel")}</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t("Saving...") : t("Save Changes")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {visitor.isBlacklisted && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-semibold">{t("Security warning")}</div>
          <div>{t("This visitor is currently flagged as blacklisted and should be reviewed before approval or check-in.")}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Printable Badge Section */}
        <div className="lg:col-span-1 print:w-full print:h-screen print:flex print:items-center print:justify-center print:bg-white">
          <Card className="border-border bg-card overflow-hidden print:w-[300px] print:h-[450px] print:border-2 print:border-black print:bg-white print:text-black print:shadow-none">
            <div className="bg-primary/20 border-b border-primary/30 p-4 text-center print:bg-white print:text-black print:border-none">
              {systemSettings?.companyLogo && (
                <img src={systemSettings.companyLogo} alt={`${systemSettings.facilityName} logo`} className="mx-auto mb-2 h-12 max-w-36 object-contain" />
              )}
              <h2 className="font-bold tracking-widest text-primary print:text-black">{systemSettings?.facilityName ?? t("VISITOR PASS")}</h2>
              {systemSettings?.contactEmail && (
                <p className="mt-1 text-[10px] text-muted-foreground print:text-gray-600">{systemSettings.contactEmail}</p>
              )}
            </div>
            <CardContent className="p-6 space-y-6 flex flex-col items-center text-center">
              <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-border print:border-gray-300">
                {visitor.photoUrl ? (
                  <img src={visitor.photoUrl} alt={visitor.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <UserCircle className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>
              
              <div className="space-y-1">
                <h3 className="text-xl font-bold uppercase tracking-wide">{visitor.name}</h3>
                <p className="text-sm text-muted-foreground print:text-gray-600 font-mono">{visitor.visitorId}</p>
                {visitor.isBlacklisted && <Badge variant="destructive" className="mt-2">{t("BLACKLISTED")}</Badge>}
              </div>

              <div className="w-full space-y-2 text-sm text-left border-t border-border print:border-gray-200 pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground print:text-gray-500">{t("Host:")}</span>
                  <span className="font-medium truncate max-w-[120px]">{visitor.personToMeet}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground print:text-gray-500">{visitor.scheduledFor ? t("Expected Visit Date") : t("Date:")}</span>
                  <span className="font-medium">{visitor.scheduledFor
                    ? formatDate(new Date(`${visitor.scheduledFor}T00:00:00`), "MMM d, yyyy")
                    : formatDate(new Date(visitor.createdAt), "MMM d, yyyy")}</span>
                </div>
              </div>

              <div className="w-24 h-24 bg-white border border-gray-200 p-2 flex items-center justify-center">
                {qrCodeImage
                  ? <img src={qrCodeImage} alt="Scannable visitor pass QR code" className="h-full w-full" />
                  : <span className="text-xs text-muted-foreground" role="status">{t("Generating QR...")}</span>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Details Section */}
        <div className="lg:col-span-2 space-y-6 print:hidden">
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t("Detailed Information")}</CardTitle>
              <Badge variant="outline" className={getStatusColor(visitor.status)}>
                {t(visitor.status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))}
              </Badge>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {visitor.scheduledFor && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="h-3 w-3"/> {t("Expected Visit Date")}</div>
                    <div className="font-medium">{formatDate(new Date(`${visitor.scheduledFor}T00:00:00`), "MMM d, yyyy")}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Phone className="h-3 w-3"/> {t("Mobile")}</div>
                  <div className="font-medium">{visitor.mobile}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Mail className="h-3 w-3"/> {t("Email")}</div>
                  <div className="font-medium">{visitor.email || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Building className="h-3 w-3"/> {t("Purpose")}</div>
                  <div className="font-medium">{visitor.purpose}</div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><FileText className="h-3 w-3"/> {t("ID Proof")} ({t(visitor.idProofType.replace("_", " "))})</div>
                  <div className="font-mono font-medium">{visitor.idNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="h-3 w-3"/> {t("Duration")}</div>
                  <div className="font-medium">{visitor.duration || (visitor.checkIn ? t("In Progress") : t("Not checked in"))}</div>
                </div>
                {visitor.isBlacklisted && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <div className="text-xs text-destructive uppercase tracking-wider mb-1 flex items-center gap-1"><ShieldAlert className="h-3 w-3"/> {t("Security Alert")}</div>
                    <div className="text-sm font-medium text-destructive">{t("This individual is on the security blacklist.")}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">{t("Access Timeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {/* Registration */}
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-primary">
                    <UserCircle className="h-4 w-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border bg-card shadow">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-foreground">{t("Registered")}</div>
                      <time className="font-mono text-xs text-muted-foreground">{formatDate(new Date(visitor.createdAt), "HH:mm")}</time>
                    </div>
                    <div className="text-sm text-muted-foreground">{t("Registered into system")}</div>
                  </div>
                </div>

                {/* Check In */}
                {visitor.checkIn && (
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-blue-400">
                      <LogIn className="h-4 w-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border bg-card shadow">
                      <div className="flex items-center justify-between space-x-2 mb-1">
                        <div className="font-bold text-foreground">{t("Checked In")}</div>
                        <time className="font-mono text-xs text-muted-foreground">{formatDate(new Date(visitor.checkIn), "HH:mm")}</time>
                      </div>
                      <div className="text-sm text-muted-foreground">{t("Granted access to facility")}</div>
                    </div>
                  </div>
                )}

                {/* Check Out */}
                {visitor.checkOut && (
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-green-400">
                      <LogOut className="h-4 w-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border bg-card shadow">
                      <div className="flex items-center justify-between space-x-2 mb-1">
                        <div className="font-bold text-foreground">{t("Checked Out")}</div>
                        <time className="font-mono text-xs text-muted-foreground">{formatDate(new Date(visitor.checkOut), "HH:mm")}</time>
                      </div>
                      <div className="text-sm text-muted-foreground">{t("Exited facility")}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">{t("Gadgets Carried Inside")}</CardTitle>
              <CardDescription>{t("Optional items recorded at registration. Gadget approval is separate from visitor check-in.")}</CardDescription>
            </CardHeader>
            <CardContent>
              {gadgetsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : gadgetsError ? (
                <p role="alert" className="text-sm text-destructive">{t("Unable to load visitor gadgets. Please refresh and try again.")}</p>
              ) : gadgets?.length ? (
                <div className="space-y-3">
                  {gadgets.map((gadget) => (
                    <div key={gadget.id} className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium">{gadget.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {[gadget.makeModel, gadget.serialNumber ? `${t("Serial")}: ${gadget.serialNumber}` : null].filter(Boolean).join(" · ") || t("No make/model or serial number provided")}
                        </div>
                        {gadget.returnedAt && <div className="mt-1 text-xs text-muted-foreground">{t("Return verified")} {formatDate(new Date(gadget.returnedAt), "PPpp")}</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={
                          gadget.approvalStatus === "approved" ? "border-green-500/30 bg-green-500/10 text-green-600" :
                          gadget.approvalStatus === "rejected" ? "border-destructive/30 bg-destructive/10 text-destructive" :
                          "border-yellow-500/30 bg-yellow-500/10 text-yellow-600"
                        }>
                          {t(gadget.approvalStatus)}
                        </Badge>
                        {gadget.approvalStatus === "pending" && canReviewGadgets && visitor.status === "checked_in" && (
                          <>
                            <Button size="sm" onClick={() => handleGadgetReview(gadget.id, "approve")} disabled={reviewGadgetMutation.isPending || returnGadgetMutation.isPending}>{t("Approve")}</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleGadgetReview(gadget.id, "reject")} disabled={reviewGadgetMutation.isPending || returnGadgetMutation.isPending}>{t("Reject")}</Button>
                          </>
                        )}
                        {gadget.approvalStatus === "approved" && !gadget.returnedAt && canReviewGadgets && visitor.status === "checked_in" && (
                          <Button size="sm" variant="outline" onClick={() => handleGadgetReturn(gadget.id)} disabled={returnGadgetMutation.isPending || reviewGadgetMutation.isPending}>{t("Verify Returned")}</Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {gadgets.some((gadget) => gadget.approvalStatus === "approved" && !gadget.returnedAt) && (
                    <p className="text-sm text-amber-600">{t("All approved gadgets must be verified as returned before the visitor can be checked out.")}</p>
                  )}
                  {!canReviewGadgets && gadgets.some((gadget) => gadget.approvalStatus === "approved" && !gadget.returnedAt) && (
                    <p className="text-sm text-muted-foreground">{t("Ask security or an administrator to verify the gadget return before checkout.")}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("No gadgets were recorded for this visit.")}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-4 w-4 text-primary" />
                {t("Activity Audit")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : auditError ? (
                <p role="alert" className="text-sm text-destructive">{t("Unable to load visitor activity history.")}</p>
              ) : auditEntries?.length ? (
                <ol className="space-y-3">
                  {auditEntries.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start">
                        <div>
                          <div className="text-sm font-semibold capitalize">{t(entry.action.replace(/_/g, " "))}</div>
                          <p className="text-sm text-muted-foreground">{t(entry.details)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t("By")} {entry.actorEmail}</p>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatDate(new Date(entry.createdAt), "MMM d, yyyy HH:mm:ss")}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t("No recorded activity yet.")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
