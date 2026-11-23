import { useState } from "react";
import { 
  useGetBlacklist, 
  getGetBlacklistQueryKey,
  useAddToBlacklist,
  useUpdateBlacklist,
  useRemoveFromBlacklist,
  useGetSubscription,
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Trash2, Search, PlusCircle, UserRoundX, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

const blacklistSchema = z.object({
  name: z.string().min(2, "Name required"),
  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  reason: z.string().min(5, "Reason required")
});

export default function Blacklist() {
  const reduceMotion = useReducedMotion();
  const { t, formatDate } = useLanguage();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{ id: number; name: string; mobile: string; reason: string } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: subscription } = useGetSubscription();
  const isReadOnly = subscription?.subscription.readOnly ?? false;

  const { data: blacklist, isLoading } = useGetBlacklist({
    query: {
      queryKey: getGetBlacklistQueryKey()
    }
  });

  const form = useForm<z.infer<typeof blacklistSchema>>({
    resolver: zodResolver(blacklistSchema),
    mode: "onBlur",
    defaultValues: { name: "", mobile: "", reason: "" }
  });

  const editForm = useForm<z.infer<typeof blacklistSchema>>({
    resolver: zodResolver(blacklistSchema),
    mode: "onBlur",
    defaultValues: { name: "", mobile: "", reason: "" }
  });

  const addMutation = useAddToBlacklist({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Added to Watchlist"), description: t("Individual successfully restricted.") });
        queryClient.invalidateQueries({ queryKey: getGetBlacklistQueryKey() });
        setOpen(false);
        form.reset();
      }
    }
  });

  const removeMutation = useRemoveFromBlacklist({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Removed from Watchlist"), description: t("Restriction lifted.") });
        queryClient.invalidateQueries({ queryKey: getGetBlacklistQueryKey() });
      }
    }
  });

  const updateMutation = useUpdateBlacklist({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Watchlist Entry Updated"), description: t("Restriction details have been saved.") });
        queryClient.invalidateQueries({ queryKey: getGetBlacklistQueryKey() });
        setEditingEntry(null);
      },
      onError: (error) => {
        toast({ title: t("Update Failed"), description: t(error.error), variant: "destructive" });
      },
    },
  });

  const filteredList = blacklist?.filter(entry => 
    entry.name.toLowerCase().includes(search.toLowerCase()) || 
    entry.mobile.includes(search)
  );

  const onSubmit = (data: z.infer<typeof blacklistSchema>) => {
    if (isReadOnly) return;
    addMutation.mutate({ data });
  };

  const openEditDialog = (entry: { id: number; name: string; mobile: string; reason: string }) => {
    setEditingEntry(entry);
    editForm.reset({ name: entry.name, mobile: entry.mobile, reason: entry.reason });
  };

  const onEditSubmit = (data: z.infer<typeof blacklistSchema>) => {
    if (editingEntry && !isReadOnly) updateMutation.mutate({ id: editingEntry.id, data });
  };

  const handleRemove = (id: number) => {
    if (isReadOnly) return;
    if (confirm(t("Are you sure you want to remove this restriction?"))) {
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
            {t("Security Watchlist")}
            <UserRoundX className="h-5 w-5 text-destructive" aria-hidden="true" />
          </h1>
          <p className="text-sm text-muted-foreground">{t("Manage restricted individuals.")}</p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:contents">
          <motion.img
            src="/blacklist-illustration.png"
            alt={t("Restricted individual and security watchlist")}
            className="h-24 w-28 object-contain sm:absolute sm:inset-y-0 sm:right-56 sm:h-full sm:w-40"
            initial={reduceMotion ? false : { opacity: 0, x: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -2, 0] }}
            transition={reduceMotion
              ? { duration: 0 }
              : { opacity: { duration: 0.3, delay: 0.08 }, y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } }}
          />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="bg-destructive hover:bg-destructive/90 text-white" disabled={isReadOnly}>
              <PlusCircle className="mr-2 h-4 w-4" /> {t("Add Restriction")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle>{t("Add to Watchlist")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Full Name")}</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Mobile / ID")}</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Reason for Restriction")}</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-destructive text-white hover:bg-destructive/90" disabled={addMutation.isPending || isReadOnly}>
                  {addMutation.isPending ? t("Adding...") : t("Enforce Restriction")}
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
              placeholder={t("Search watchlist...")}
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
                <TableHead>{t("Name")}</TableHead>
                <TableHead>{t("Identifier")}</TableHead>
                <TableHead>{t("Reason")}</TableHead>
                <TableHead>{t("Enforced By")}</TableHead>
                <TableHead>{t("Date")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
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
                    {t("No active restrictions found.")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredList?.map((entry) => (
                  <TableRow key={entry.id} className="border-border bg-destructive/5 hover:bg-destructive/10 transition-colors">
                    <TableCell className="font-medium text-foreground">{entry.name}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.mobile}</TableCell>
                    <TableCell className="text-sm">{entry.reason}</TableCell>
                    <TableCell className="text-sm">{entry.addedBy}</TableCell>
                    <TableCell className="text-sm">{formatDate(new Date(entry.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${entry.name}`} onClick={() => openEditDialog(entry)} disabled={isReadOnly} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${entry.name}`} onClick={() => handleRemove(entry.id)} disabled={isReadOnly} className="text-muted-foreground hover:text-foreground">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!editingEntry} onOpenChange={(isOpen) => { if (!isOpen) setEditingEntry(null); }}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Edit Watchlist Entry")}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Full Name")}</FormLabel>
                  <FormControl><Input {...field} className="bg-background" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="mobile" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Mobile / ID")}</FormLabel>
                  <FormControl><Input {...field} className="bg-background" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Reason for Restriction")}</FormLabel>
                  <FormControl><Input {...field} className="bg-background" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending || isReadOnly}>
                {updateMutation.isPending ? t("Saving...") : t("Save Changes")}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
