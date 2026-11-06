import { useState } from "react";
import { useGetVisitors, getGetVisitorsQueryKey } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Search, Filter, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { motion, useReducedMotion } from "framer-motion";

export default function Visitors() {
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [status, setStatus] = useState<string>("all");

  const { data: visitors, isLoading } = useGetVisitors({
    status: status === "all" ? undefined : (status as any),
    search: debouncedSearch || undefined,
  }, {
    query: {
      queryKey: getGetVisitorsQueryKey({ status: status === "all" ? undefined : (status as any), search: debouncedSearch || undefined })
    }
  });

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

  return (
    <div className="space-y-6">
      <motion.div
        className="relative isolate flex min-h-28 flex-col justify-between gap-3 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-sky-50 via-blue-50 to-white p-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 sm:flex-row sm:items-center sm:p-5"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
      >
        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Visitor Directory</h1>
          <p className="text-sm text-muted-foreground">Comprehensive log of all facility access.</p>
        </div>
        <img
          src="/visitors-illustration.png"
          alt="Visitors checking in at a reception desk"
          className="h-24 w-full object-contain sm:absolute sm:inset-y-0 sm:right-0 sm:h-full sm:w-[48%]"
        />
      </motion.div>

      <Card className="border-border bg-card">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, ID, or host..." 
              className="pl-9 bg-background border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-background border-border">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="checked_out">Checked Out</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Visitor</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : visitors?.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No visitors found matching the criteria.
                  </TableCell>
                </TableRow>
              ) : (
                visitors?.map((visitor) => (
                  <TableRow key={visitor.id} className="border-border hover:bg-muted/20 transition-colors cursor-pointer group">
                    <TableCell>
                      <Link href={`/visitor/${visitor.id}`} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30">
                          {visitor.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                            {visitor.name}
                            {visitor.isBlacklisted && <ShieldAlert className="h-3 w-3 text-destructive" />}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{visitor.visitorId}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{visitor.personToMeet}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm truncate max-w-[150px]" title={visitor.purpose}>{visitor.purpose}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {visitor.status === "checked_in" && visitor.checkIn
                          ? `Check-in: ${format(new Date(visitor.checkIn), "MMM d, HH:mm")}`
                          : visitor.status === "checked_out" && visitor.checkOut
                            ? `Check-out: ${format(new Date(visitor.checkOut), "MMM d, HH:mm")}`
                            : format(new Date(visitor.createdAt), "MMM d, HH:mm")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(visitor.status)}>
                        {visitor.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
