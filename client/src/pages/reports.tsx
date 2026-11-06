import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { useGetReports, getGetReportsQueryKey, useGetVisitors, type Visitor } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Activity, Users, Clock, TrendingUp, CalendarDays, Download, FileSpreadsheet, FileText, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SortField = "createdAt" | "name" | "status" | "personToMeet" | "purpose";

const formatVisitorDate = (date: string) => new Date(date).toLocaleString();
const getVisitorDateKey = (date: string) => new Date(date).toISOString().slice(0, 10);

function csvCell(value: string) {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function downloadVisitorCsv(visitors: Visitor[]) {
  const headers = ["Visitor ID", "Name", "Host", "Purpose", "Registered", "Status"];
  const rows = visitors.map((visitor) => [
    visitor.visitorId,
    visitor.name,
    visitor.personToMeet,
    visitor.purpose,
    formatVisitorDate(visitor.createdAt),
    visitor.status.replace("_", " "),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `visitor-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadVisitorPdf(visitors: Visitor[], period: string, startDate: string, endDate: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const columns = [
    { title: "Visitor ID", width: 35, value: (visitor: Visitor) => visitor.visitorId },
    { title: "Name", width: 40, value: (visitor: Visitor) => visitor.name },
    { title: "Host", width: 42, value: (visitor: Visitor) => visitor.personToMeet },
    { title: "Purpose", width: 64, value: (visitor: Visitor) => visitor.purpose },
    { title: "Registered", width: 48, value: (visitor: Visitor) => formatVisitorDate(visitor.createdAt) },
    { title: "Status", width: 32, value: (visitor: Visitor) => visitor.status.replace("_", " ") },
  ];
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Visitor Report", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Chart period: ${period} | Date range: ${startDate || "Any"} to ${endDate || "Any"} | Visitors: ${visitors.length}`, margin, y);
  y += 8;

  const drawHeader = () => {
    let x = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setFillColor(232, 240, 248);
    doc.rect(margin, y - 4, columns.reduce((total, column) => total + column.width, 0), 8, "F");
    for (const column of columns) {
      doc.text(column.title, x + 1, y + 1);
      x += column.width;
    }
    doc.setFont("helvetica", "normal");
    y += 8;
  };
  drawHeader();

  if (visitors.length === 0) {
    doc.text("No visitors match the selected filters.", margin, y + 2);
  } else {
    for (const visitor of visitors) {
      const cells = columns.map((column) => doc.splitTextToSize(column.value(visitor), column.width - 2) as string[]);
      const rowHeight = Math.max(1, ...cells.map((lines) => lines.length)) * 4 + 3;
      if (y + rowHeight > 195) {
        doc.addPage();
        y = 16;
        drawHeader();
      }

      let x = margin;
      cells.forEach((lines, index) => {
        doc.text(lines, x + 1, y + 3);
        x += columns[index].width;
      });
      doc.setDrawColor(225, 230, 235);
      doc.line(margin, y + rowHeight, margin + columns.reduce((total, column) => total + column.width, 0), y + rowHeight);
      y += rowHeight;
    }
  }

  doc.save(`visitor-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function Reports() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { data: report, isLoading } = useGetReports({
    period
  }, {
    query: {
      queryKey: getGetReportsQueryKey({ period })
    }
  });

  const { data: allVisitors, isLoading: visitorsLoading } = useGetVisitors();

  const COLORS = ['#00d1ff', '#22c55e', '#eab308', '#ef4444', '#a855f7'];

  const filteredVisitors = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...(allVisitors ?? [])]
      .filter((visitor) => {
        const visitorDate = getVisitorDateKey(visitor.createdAt);
        if (startDate && visitorDate < startDate) return false;
        if (endDate && visitorDate > endDate) return false;
        if (statusFilter !== "all" && visitor.status !== statusFilter) return false;
        if (!normalizedSearch) return true;
        return [visitor.name, visitor.visitorId, visitor.personToMeet, visitor.purpose]
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => {
        const left = sortField === "createdAt" ? new Date(a.createdAt).getTime() : a[sortField].toLowerCase();
        const right = sortField === "createdAt" ? new Date(b.createdAt).getTime() : b[sortField].toLowerCase();
        const comparison = typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [allVisitors, startDate, endDate, statusFilter, search, sortField, sortDirection]);

  const visitorRecords = (
    <Card className="min-w-0 border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg">Visitor Records</CardTitle>
        <CardDescription>
          {visitorsLoading ? "Loading visitor records..." : `${filteredVisitors.length} record${filteredVisitors.length === 1 ? "" : "s"} match your filters.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[700px]">
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Visitor</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitorsLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index} className="border-border">
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : filteredVisitors.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No visitor records match the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredVisitors.map((visitor) => (
                <TableRow key={visitor.id} className="border-border">
                  <TableCell>
                    <div className="font-medium text-foreground">{visitor.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{visitor.visitorId}</div>
                  </TableCell>
                  <TableCell>{visitor.personToMeet}</TableCell>
                  <TableCell className="max-w-52 truncate" title={visitor.purpose}>{visitor.purpose}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatVisitorDate(visitor.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{visitor.status.replace("_", " ")}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 print:bg-white print:text-black">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Intelligence & Analytics</h1>
          <p className="text-sm text-muted-foreground">Historical traffic and demographic insights.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadVisitorCsv(filteredVisitors)}
            disabled={visitorsLoading}
          >
            <Download className="h-4 w-4" /> Excel (CSV)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadVisitorPdf(filteredVisitors, period, startDate, endDate)}
            disabled={visitorsLoading}
          >
            <FileText className="h-4 w-4" /> Download PDF
          </Button>
          <div className="w-48">
            <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder="Chart period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Today</SelectItem>
                <SelectItem value="weekly">Last 7 Days</SelectItem>
                <SelectItem value="monthly">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card className="no-print border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" /> Visitor Filters
          </CardTitle>
          <CardDescription>Filter the visitor records below. Exports use the same filtered results.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search visitors"
              placeholder="Search name, visitor ID, host, purpose..."
              className="bg-background pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="report-start-date" className="sr-only">Start date</label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                id="report-start-date"
                aria-label="Start date"
                type="date"
                max={endDate || undefined}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-w-0 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="report-end-date" className="sr-only">End date</label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                id="report-end-date"
                aria-label="End date"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="min-w-0 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="checked_in">Checked in</SelectItem>
              <SelectItem value="checked_out">Checked out</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
              <SelectTrigger className="min-w-0 flex-1 bg-background">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="personToMeet">Host</SelectItem>
                <SelectItem value="purpose">Purpose</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
              title={`Currently ${sortDirection === "asc" ? "ascending" : "descending"}`}
              onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading || !report ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[400px]" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Period Traffic</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{report.totalVisitors}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Avg / Day</CardTitle>
                <Activity className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-400">{report.avgDailyVisitors}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Peak Volume Day</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-400">{report.peakDay}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Period Filter</CardTitle>
                <Clock className="h-4 w-4 text-yellow-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-400 capitalize">{report.period}</div>
              </CardContent>
            </Card>
          </div>

          {visitorRecords}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">Visitor Traffic Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.timeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                        itemStyle={{ color: 'hsl(var(--primary))' }}
                      />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--background))", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">Hourly Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.hourlyDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Demographics & Outcomes</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="h-[250px] flex flex-col items-center">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-4">Purpose Breakdown</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.purposeBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="purpose"
                      >
                        {report.purposeBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-[250px] flex flex-col items-center">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-4">Status Outcomes</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.statusBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="status"
                      >
                        {report.statusBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

        </>
      )}
    </div>
  );
}
