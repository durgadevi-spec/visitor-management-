import { useState } from "react";
import { 
  useGetBlacklist, 
  getGetBlacklistQueryKey,
  useAddToBlacklist,
  useRemoveFromBlacklist
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Trash2, Search, PlusCircle, UserRoundX } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";

const blacklistSchema = z.object({
  name: z.string().min(2, "Name required"),
  mobile: z.string().min(10, "Mobile required"),
  reason: z.string().min(5, "Reason required")
});

export default function Blacklist() {
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: blacklist, isLoading } = useGetBlacklist({
    query: {
      queryKey: getGetBlacklistQueryKey()
    }
  });

  const form = useForm<z.infer<typeof blacklistSchema>>({
    resolver: zodResolver(blacklistSchema),
    defaultValues: { name: "", mobile: "", reason: "" }
  });

  const addMutation = useAddToBlacklist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Added to Watchlist", description: "Individual successfully restricted." });
        queryClient.invalidateQueries({ queryKey: getGetBlacklistQueryKey() });
        setOpen(false);
        form.reset();
      }
    }
  });

  const removeMutation = useRemoveFromBlacklist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Removed from Watchlist", description: "Restriction lifted." });
        queryClient.invalidateQueries({ queryKey: getGetBlacklistQueryKey() });
      }
    }
  });

  const filteredList = blacklist?.filter(entry => 
    entry.name.toLowerCase().includes(search.toLowerCase()) || 
    entry.mobile.includes(search)
  );

  const onSubmit = (data: z.infer<typeof blacklistSchema>) => {
    addMutation.mutate({ data });
  };

  const handleRemove = (id: number) => {
    if (confirm("Are you sure you want to remove this restriction?")) {
      removeMutation.mutate({ id });
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        className="relative isolate flex min-h-28 flex-col justify-between gap-4 overflow-hidden rounded-xl border border-destructive/15 bg-gradient-to-r from-rose-50 via-red-50 to-white p-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 sm:flex-row sm:items-center sm:p-5"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
      >
        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            Security Watchlist
            <UserRoundX className="h-5 w-5 text-destructive" aria-hidden="true" />
          </h1>
          <p className="text-sm text-muted-foreground">Manage restricted individuals.</p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:contents">
          <motion.img
            src="/blacklist-illustration.png"
            alt="Restricted individual and security watchlist"
            className="h-24 w-28 object-contain sm:absolute sm:inset-y-0 sm:right-56 sm:h-full sm:w-40"
            initial={reduceMotion ? false : { opacity: 0, x: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -2, 0] }}
            transition={reduceMotion
              ? { duration: 0 }
              : { opacity: { duration: 0.3, delay: 0.08 }, y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } }}
          />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="bg-destructive hover:bg-destructive/90 text-white">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Restriction
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle>Add to Watchlist</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile / ID</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Restriction</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-destructive text-white hover:bg-destructive/90" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Enforce Restriction"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </motion.div>

      <Card className="border-border bg-card">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search watchlist..." 
              className="pl-9 bg-background border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Enforced By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredList?.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No active restrictions found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredList?.map((entry) => (
                  <TableRow key={entry.id} className="border-border bg-destructive/5 hover:bg-destructive/10 transition-colors">
                    <TableCell className="font-medium text-foreground">{entry.name}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.mobile}</TableCell>
                    <TableCell className="text-sm">{entry.reason}</TableCell>
                    <TableCell className="text-sm">{entry.addedBy}</TableCell>
                    <TableCell className="text-sm">{format(new Date(entry.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(entry.id)} className="text-muted-foreground hover:text-foreground">
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
