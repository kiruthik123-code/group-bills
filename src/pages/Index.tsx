import { useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, created_at, invite_code")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: balances } = useQuery({
    queryKey: ["balances"],
    queryFn: async () => {
      if (!user) return { totalOwed: 0, totalOwedToYou: 0 };

      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)") as any;

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

  const netSummary = useMemo(() => {
    if (!balances) return null;
    const net = balances.totalOwedToYou - balances.totalOwed;
    if (net > 0) return `You are owed ${currency.format(net)} across all groups`;
    if (net < 0) return `You owe ${currency.format(Math.abs(net))} across all groups`;
    return "You're all settled up across all groups";
  }, [balances]);

  const generateInviteCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };

  const handleCreateGroup = async () => {
    if (!user) return;
    const name = window.prompt("Group name (e.g., Goa Trip, Roommates)");
    if (!name) return;

    try {
      const inviteCode = generateInviteCode();
      const inviteLink = `https://splitstuff.app/join/${inviteCode}`;

      const { data, error } = await supabase
        .from("groups")
        .insert({ name, created_by: user.id, invite_code: inviteCode, invite_link: inviteLink })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id });
      toast({ title: "Group created", description: `Group "${name}" was created.` });
      navigate(`/groups/${data.id}`);
    } catch (error: any) {
      toast({
        title: "Could not create group",
        description: error.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading SplitStuff...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex max-w-md flex-col pb-20">
        <header className="px-4 pt-6 pb-4">
          <p className="text-xs font-medium text-muted-foreground">Hey there! 👋</p>
          <h1 className="text-2xl font-extrabold tracking-tight">SplitStuff</h1>
        </header>

        <section className="px-4">
          <Card className="overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-primary/10 via-accent/40 to-primary/5 shadow-md">
            <div className="p-5">
              <p className="text-xs font-medium text-muted-foreground">Total balance</p>
              <p className="mt-2 text-3xl font-extrabold text-primary">
                {currency.format(Math.max(balances?.totalOwed ?? 0, balances?.totalOwedToYou ?? 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{netSummary}</p>
            </div>
          </Card>
        </section>

        <section className="mt-6 flex-1 px-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your groups</h2>
          </div>
          {groups && groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-left shadow-sm transition hover:shadow-md"
                  onClick={() => navigate(`/groups/${group.id}`)}
                >
                  <div>
                    <p className="text-sm font-semibold">{group.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Created {new Date(group.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Card className="p-4 text-sm text-muted-foreground">
              You don't have any groups yet. Create one to start splitting expenses.
            </Card>
          )}
        </section>

        <button
          type="button"
          onClick={handleCreateGroup}
          className="fixed bottom-24 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-accent text-primary-foreground shadow-lg"
        >
          +
        </button>

        <nav className="fixed bottom-0 left-0 right-0 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-around px-6 py-2 text-xs">
            <button className="flex flex-col items-center gap-0.5 text-primary">
              <span>Home</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 text-muted-foreground" onClick={() => navigate("/")}>
              <span>Groups</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 text-muted-foreground" onClick={() => navigate("/profile")}>
              <span>Profile</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
};

export default Index;
