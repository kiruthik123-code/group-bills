import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const ProfilePage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: balances } = useQuery({
    queryKey: ["balances", user?.id],
    queryFn: async () => {
      if (!user) return { totalOwed: 0, totalOwedToYou: 0 };

      const { data: expenses } = (await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)")) as any;

      const { data: settlements } = await supabase
        .from("settlements")
        .select("amount, payer_id, receiver_id, status");

      let totalOwed = 0;
      let totalOwedToYou = 0;

      (expenses ?? []).forEach((exp: any) => {
        const splits = exp.expense_splits ?? [];
        splits.forEach((split: any) => {
          if (split.user_id === user.id && exp.paid_by !== user.id) {
            totalOwed += split.share_amount;
          }
          if (exp.paid_by === user.id && split.user_id !== user.id) {
            totalOwedToYou += split.share_amount;
          }
        });
      });

      (settlements ?? []).forEach((s: any) => {
        if (s.status !== "settled") return;
        if (s.payer_id === user.id) totalOwed -= s.amount;
        if (s.receiver_id === user.id) totalOwedToYou -= s.amount;
      });

      return { totalOwed, totalOwedToYou };
    },
    enabled: !!user,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.full_name || "",
    },
    values: {
      fullName: profile?.full_name || "",
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: values.fullName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast({ title: "Profile updated", description: "Your name has been saved." });
    },
    onError: (error: any) => {
      toast({
        title: "Could not update profile",
        description: error.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Your profile</h1>
            <p className="text-xs text-muted-foreground">Manage your name and see your overall balances.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to dashboard</Link>
            </Button>
            <span>{user.email}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile details</CardTitle>
              <CardDescription>Update how your name appears to others in groups.</CardDescription>
            </CardHeader>
            <CardContent>
              {profileLoading ? (
                <p className="text-sm text-muted-foreground">Loading profile...</p>
              ) : (
                <Form {...form}>
                  <form
                    className="space-y-4"
                    onSubmit={form.handleSubmit((values) => updateProfile.mutate(values))}
                  >
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your name" autoComplete="name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" size="sm" disabled={updateProfile.isPending}>
                      Save changes
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaction summary</CardTitle>
              <CardDescription>Your overall balances across all groups.</CardDescription>
            </CardHeader>
            <CardContent>
              {balances ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You owe</span>
                    <span className="font-semibold text-destructive">
                      {currency.format(Math.max(balances.totalOwed, 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You're owed</span>
                    <span className="font-semibold text-success">
                      {currency.format(Math.max(balances.totalOwedToYou, 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Calculating balances...</p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default ProfilePage;
