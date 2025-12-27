import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const GroupsListPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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
        .select("id, name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: perGroupNet } = useQuery({
    queryKey: ["group-balances-list"],
    queryFn: async () => {
      if (!user) return {} as Record<string, number>;

      const { data: expenses } = (await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)")) as any;

      const { data: settlements } = await supabase
        .from("settlements")
        .select("amount, payer_id, receiver_id, status, group_id");

      const map: Record<string, number> = {};

      (expenses ?? []).forEach((exp: any) => {
        if (!map[exp.group_id]) map[exp.group_id] = 0;
        const splits = exp.expense_splits ?? [];
        splits.forEach((split: any) => {
          if (split.user_id === user.id && exp.paid_by !== user.id) {
            map[exp.group_id] -= split.share_amount;
          }
          if (exp.paid_by === user.id && split.user_id !== user.id) {
            map[exp.group_id] += split.share_amount;
          }
        });
      });

      (settlements ?? []).forEach((s: any) => {
        if (s.status !== "settled") return;
        if (!map[s.group_id]) map[s.group_id] = 0;
        if (s.payer_id === user.id) map[s.group_id] += s.amount;
        if (s.receiver_id === user.id) map[s.group_id] -= s.amount;
      });

      return map;
    },
    enabled: !!user,
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading groups...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))] font-sans">
      <main className="mx-auto flex max-w-md flex-col pb-20">
        <header className="px-4 pt-10 pb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">All Groups</h1>
        </header>

        <section className="flex-1 px-4">
          {groups && groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map((group) => {
                const net = perGroupNet?.[group.id] ?? 0;
                const isPositive = net > 0.01;
                const isNegative = net < -0.01;
                const label = isPositive ? "you get" : isNegative ? "you owe" : "settled";
                const amountText = currency.format(Math.abs(net));

                return (
                  <button
                    key={group.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-left shadow-sm transition hover:shadow-md"
                    onClick={() => navigate(`/groups/${group.id}`)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{group.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Created {new Date(group.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p
                        className={
                          isPositive
                            ? "text-success font-semibold"
                            : isNegative
                            ? "text-destructive font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {amountText}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-2xl p-4 text-sm text-muted-foreground shadow-sm">
              No groups yet. Create one from Home.
            </Card>
          )}
        </section>

        <nav className="fixed bottom-0 left-0 right-0 border-t bg-card/95 shadow-[0_-6px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-around px-8 py-3 text-[11px] font-medium">
            <button
              className="flex flex-col items-center gap-0.5 text-muted-foreground"
              onClick={() => navigate("/")}
            >
              <span>Home</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 text-primary">
              <span>Groups</span>
            </button>
            <button
              className="flex flex-col items-center gap-0.5 text-muted-foreground"
              onClick={() => navigate("/profile")}
            >
              <span>Profile</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
};

export default GroupsListPage;
