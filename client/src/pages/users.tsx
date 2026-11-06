import { 
  useGetUsers, 
  getGetUsersQueryKey,
  useCreateUser,
  useDeleteUser
} from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Trash2, PlusCircle, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { motion, useReducedMotion } from "framer-motion";

const userSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 chars"),
  role: z.enum(["admin", "security", "employee"])
});

export default function Users() {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  if (currentUser?.role !== "admin") {
    return <Redirect to="/" />;
  }

  const { data: users, isLoading } = useGetUsers({
    query: {
      queryKey: getGetUsersQueryKey()
    }
  });

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", password: "", role: "employee" }
  });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User Created", description: "Operator access provisioned." });
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error });
      }
    }
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User Removed", description: "Operator access revoked." });
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
      }
    }
  });

  const onSubmit = (data: z.infer<typeof userSchema>) => {
    createMutation.mutate({ data });
  };

  const handleDelete = (id: number) => {
    if (confirm("Revoke access for this operator?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-primary/20 text-primary border-primary/30";
      case "security": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-gradient-to-r from-sky-50 via-blue-50 to-white p-4 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 sm:min-h-28 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Access Management
          </h1>
          <p className="text-sm text-muted-foreground">Manage operators and clearance levels.</p>
        </div>
        <motion.img
          src="/users-team-illustration.png"
          alt="Team of facility operators"
          className="h-24 w-full object-contain sm:h-20 sm:w-56"
          initial={reduceMotion ? false : { opacity: 0, x: 8 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -2, 0] }}
          transition={reduceMotion
            ? { duration: 0 }
            : { opacity: { duration: 0.3, delay: 0.08 }, y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } }}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-4 w-4" /> Provision Operator
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle>Provision New Operator</DialogTitle>
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
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl><Input {...field} type="email" className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial Password</FormLabel>
                    <FormControl><Input {...field} type="password" className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clearance Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="security">Security Officer</SelectItem>
                        <SelectItem value="employee">Employee / Host</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Provisioning..." : "Create Operator"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </motion.div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Operator</TableHead>
                <TableHead>Clearance</TableHead>
                <TableHead>Provisioned On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                users?.map((u) => (
                  <TableRow key={u.id} className="border-border hover:bg-muted/20 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border border-border">
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`uppercase tracking-wider text-[10px] ${getRoleColor(u.role)}`}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {format(new Date(u.createdAt), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id !== currentUser?.id && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
