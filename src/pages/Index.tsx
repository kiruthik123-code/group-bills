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
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">SplitStuff</h1>
            <p className="text-xs text-muted-foreground">Smart expense splitting and debt tracking</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Button asChild variant="outline" size="sm">
              <Link to="/profile">Profile</Link>
            </Button>
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Button size="sm" variant="outline" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Overall summary</h2>
            {balances ? (
              <>
                <p className="text-sm">{netSummary}</p>
                <div className="mt-3 flex gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">You owe</p>
                    <p className="font-semibold text-destructive">{currency.format(Math.max(balances.totalOwed, 0))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">You're owed</p>
                    <p className="font-semibold text-emerald-600">
                      {currency.format(Math.max(balances.totalOwedToYou, 0))}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Calculating balances...</p>
            )}
          </Card>

          <Card className="flex flex-col justify-between p-4">
            <div>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Quick actions</h2>
              <p className="text-sm text-muted-foreground">Create or join a group for a trip, household, or project.</p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button className="w-full" onClick={handleCreateGroup}>
                + Create group
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/join">Join a group</Link>
              </Button>
            </div>
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Your groups</h2>
          </div>
          {groups && groups.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {groups.map((group) => (
                <Card key={group.id} className="p-4">
                  <h3 className="font-medium">{group.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {new Date(group.created_at).toLocaleDateString()}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link to={`/groups/${group.id}`}>Open group</Link>
                  </Button>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-4 text-sm text-muted-foreground">
              You don't have any groups yet. Create one to start splitting expenses.
            </Card>
          )}
        </section>
      </main>
    </div>
  );
};

export default Index;
