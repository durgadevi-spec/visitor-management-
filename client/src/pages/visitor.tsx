import { useLocation, useParams } from "wouter";
import { jsPDF } from "jspdf";
import { 
  useGetVisitor, 
  getGetVisitorQueryKey,
  useApproveVisitor,
  useCheckinVisitor,
  useCheckoutVisitor
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  UserCircle, Printer, CheckCircle, XCircle, LogIn, LogOut, 
  Clock, ShieldAlert, FileText, Phone, Mail, Building, ArrowLeft 
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";

export default function VisitorDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: visitor, isLoading } = useGetVisitor(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetVisitorQueryKey(id!)
    }
  });

  const approveMutation = useApproveVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status Updated", description: "Visitor approved successfully." });
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
      }
    }
  });

  const rejectMutation = useApproveVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status Updated", description: "Visitor rejected.", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
      }
    }
  });

  const checkinMutation = useCheckinVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Checked In", description: "Visitor has been checked in." });
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
      }
    }
  });

  const checkoutMutation = useCheckoutVisitor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Checked Out", description: "Visitor has been checked out." });
        queryClient.invalidateQueries({ queryKey: getGetVisitorQueryKey(id!) });
      }
    }
  });

  const handleApprove = () => approveMutation.mutate({ id: id!, data: { action: "approve" } });
  const handleReject = () => rejectMutation.mutate({ id: id!, data: { action: "reject", remarks: "Security rejection" } });
  const handleCheckin = () => checkinMutation.mutate({ id: id! });
  const handleCheckout = () => checkoutMutation.mutate({ id: id! });

  const printBadge = () => {
    window.print();
  };

  const loadImageAsDataUrl = async (src: string): Promise<{ dataUrl: string; format: "PNG" | "JPEG" }> => {
    const response = await fetch(src);

    if (!response.ok) {
      throw new Error(`Unable to fetch image: ${src}`);
    }

    const blob = await response.blob();
    const fileType = blob.type || "image/png";
    const format = fileType.includes("jpeg") ? "JPEG" : "PNG";

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, format });
      reader.onerror = () => reject(new Error(`Unable to read image: ${src}`));
      reader.readAsDataURL(blob);
    });
  };

  const downloadVisitorPassPdf = async () => {
    if (!visitor) return;

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
    doc.text("Concept Trunk Interiors", 52.5, 14, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Visitor Pass", 52.5, 20, { align: "center" });

    try {
      const logoImageUrl = new URL("/company-logo.png", window.location.origin).toString();
      const { dataUrl, format } = await loadImageAsDataUrl(logoImageUrl);
      doc.addImage(dataUrl, format, 11, 8, 12, 12);
    } catch {
      doc.setDrawColor(80, 80, 80);
      doc.roundedRect(11, 8, 12, 12, 1.2, 1.2, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("CTI", 17, 14, { align: "center" });
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
        doc.text("No Photo", photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
      }
    } else {
      doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, "S");
      doc.setFontSize(8);
      doc.text("No Photo", photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
    }

    const detailsY = 80;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const details = [
      `Visitor ID: ${visitor.visitorId}`,
      `Host: ${visitor.personToMeet}`,
      `Purpose: ${visitor.purpose}`,
      `Date: ${format(new Date(visitor.createdAt), "MMM d, yyyy")}`,
      `Mobile: ${visitor.mobile}`,
    ];

    details.forEach((line, index) => {
      const y = detailsY + index * 7;
      doc.text(line, 15, y);
    });

    doc.setFontSize(6.5);
    doc.text("Please carry this pass during your visit.", 15, 116);
    doc.text(`Issued on ${format(new Date(visitor.createdAt), "MMM d, yyyy")}`, 15, 121);

    doc.save(`visitor-pass-${visitor.visitorId}.pdf`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "checked_in": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "checked_out": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "rejected": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "approved": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!visitor) return <div>Visitor not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Visitor Profile</h1>
          <p className="text-sm text-muted-foreground">ID: <span className="font-mono">{visitor.visitorId}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
          {visitor.status === "pending" && (
            <>
              <Button variant="outline" className="border-green-500/50 text-green-500 hover:bg-green-500/10" onClick={handleApprove} disabled={approveMutation.isPending}>
                <CheckCircle className="mr-2 h-4 w-4" /> Approve
              </Button>
              <Button variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-500/10" onClick={handleReject} disabled={rejectMutation.isPending}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {visitor.status === "approved" && (
            <Button variant="default" className="bg-blue-500 hover:bg-blue-600 text-white" onClick={handleCheckin} disabled={checkinMutation.isPending}>
              <LogIn className="mr-2 h-4 w-4" /> Check In
            </Button>
          )}
          {visitor.status === "checked_in" && (
            <Button variant="default" className="bg-green-500 hover:bg-green-600 text-white" onClick={handleCheckout} disabled={checkoutMutation.isPending}>
              <LogOut className="mr-2 h-4 w-4" /> Check Out
            </Button>
          )}
          <Button variant="secondary" onClick={printBadge}>
            <Printer className="mr-2 h-4 w-4" /> Print Badge
          </Button>
          <Button variant="outline" onClick={downloadVisitorPassPdf}>
            <Printer className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {visitor.isBlacklisted && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-semibold">Security warning</div>
          <div>This visitor is currently flagged as blacklisted and should be reviewed before approval or check-in.</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Printable Badge Section */}
        <div className="lg:col-span-1 print:w-full print:h-screen print:flex print:items-center print:justify-center print:bg-white">
          <Card className="border-border bg-card overflow-hidden print:w-[300px] print:h-[450px] print:border-2 print:border-black print:bg-white print:text-black print:shadow-none">
            <div className="bg-primary/20 border-b border-primary/30 p-4 text-center print:bg-white print:text-black print:border-none">
              <h2 className="font-bold tracking-widest text-primary print:text-black">VISITOR PASS</h2>
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
                {visitor.isBlacklisted && <Badge variant="destructive" className="mt-2">BLACKLISTED</Badge>}
              </div>

              <div className="w-full space-y-2 text-sm text-left border-t border-border print:border-gray-200 pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground print:text-gray-500">Host:</span>
                  <span className="font-medium truncate max-w-[120px]">{visitor.personToMeet}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground print:text-gray-500">Date:</span>
                  <span className="font-medium">{format(new Date(visitor.createdAt), "MMM d, yyyy")}</span>
                </div>
              </div>

              {/* QR Code Placeholder Box */}
              <div className="w-24 h-24 bg-white border border-gray-200 p-2 flex items-center justify-center">
                <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-0.5">
                  {/* Fake QR pattern based on ID hash for visual effect */}
                  {Array(16).fill(0).map((_, i) => (
                    <div key={i} className={visitor.id.charCodeAt(i % visitor.id.length) % 2 === 0 ? "bg-black" : "bg-white"}></div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Details Section */}
        <div className="lg:col-span-2 space-y-6 print:hidden">
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Detailed Information</CardTitle>
              <Badge variant="outline" className={getStatusColor(visitor.status)}>
                {visitor.status.replace("_", " ")}
              </Badge>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Phone className="h-3 w-3"/> Mobile</div>
                  <div className="font-medium">{visitor.mobile}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Mail className="h-3 w-3"/> Email</div>
                  <div className="font-medium">{visitor.email || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Building className="h-3 w-3"/> Purpose</div>
                  <div className="font-medium">{visitor.purpose}</div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><FileText className="h-3 w-3"/> ID Proof ({visitor.idProofType})</div>
                  <div className="font-mono font-medium">{visitor.idNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="h-3 w-3"/> Duration</div>
                  <div className="font-medium">{visitor.duration || "In Progress"}</div>
                </div>
                {visitor.isBlacklisted && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <div className="text-xs text-destructive uppercase tracking-wider mb-1 flex items-center gap-1"><ShieldAlert className="h-3 w-3"/> Security Alert</div>
                    <div className="text-sm font-medium text-destructive">This individual is on the security blacklist.</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Access Timeline</CardTitle>
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
                      <div className="font-bold text-foreground">Registered</div>
                      <time className="font-mono text-xs text-muted-foreground">{format(new Date(visitor.createdAt), "HH:mm")}</time>
                    </div>
                    <div className="text-sm text-muted-foreground">Pre-registered into system</div>
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
                        <div className="font-bold text-foreground">Checked In</div>
                        <time className="font-mono text-xs text-muted-foreground">{format(new Date(visitor.checkIn), "HH:mm")}</time>
                      </div>
                      <div className="text-sm text-muted-foreground">Granted access to facility</div>
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
                        <div className="font-bold text-foreground">Checked Out</div>
                        <time className="font-mono text-xs text-muted-foreground">{format(new Date(visitor.checkOut), "HH:mm")}</time>
                      </div>
                      <div className="text-sm text-muted-foreground">Exited facility</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
