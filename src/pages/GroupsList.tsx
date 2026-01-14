import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

type Group = Pick<Database['public']['Tables']['groups']['Row'], 'id' | 'name' | 'created_at'>;

type ExpenseWithSplits = Pick<Database['public']['Tables']['expenses']['Row'], 'id' | 'group_id' | 'amount' | 'paid_by'> & {
  expense_splits: Pick<Database['public']['Tables']['expense_splits']['Row'], 'user_id' | 'share_amount'>[]
};

type Settlement = Pick<Database['public']['Tables']['settlements']['Row'], 'amount' | 'payer_id' | 'receiver_id' | 'status' | 'group_id'>;


const GroupsListPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const { data: groups } = useQuery({
    queryKey: ["groups", user?.id],
    queryFn: async () => {
      if (!user) return [] as Group[];

      // Groups where the user is a member
      const { data: memberships, error: membershipsError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      if (membershipsError) throw membershipsError;

      const memberGroupIds = (memberships ?? []).map((m) => m.group_id);

      // Groups created by the user
      const { data: createdGroups, error: createdGroupsError } = await supabase
        .from("groups")
        .select("id, name, created_at, created_by")
        .eq("created_by", user.id);
      if (createdGroupsError) throw createdGroupsError;

      const allGroupIds = Array.from(new Set([...memberGroupIds, ...(createdGroups ?? []).map((g) => g.id)]));
      if (allGroupIds.length === 0) return [] as Group[];

      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("id, name, created_at")
        .in("id", allGroupIds)
        .order("created_at", { ascending: false })
        .returns<Group[]>();
      if (groupsError) throw groupsError;

      return groupsData ?? [];
    },
    enabled: !!user,
  });

  const { data: perGroupNet } = useQuery({
    queryKey: ["group-balances-list"],
    queryFn: async () => {
      if (!user) return {} as Record<string, number>;

      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)")
        .returns<ExpenseWithSplits[]>();

      const { data: settlements } = await supabase
        .from("settlements")
        .select("amount, payer_id, receiver_id, status, group_id")
        .returns<Settlement[]>();

      const map: Record<string, number> = {};

      (expenses ?? []).forEach((exp) => {
        if (!map[exp.group_id]) map[exp.group_id] = 0;
        const splits = exp.expense_splits ?? [];
        splits.forEach((split) => {
          if (split.user_id === user.id && exp.paid_by !== user.id) {
            map[exp.group_id] -= split.share_amount;
          }
          if (exp.paid_by === user.id && split.user_id !== user.id) {
            map[exp.group_id] += split.share_amount;
          }
        });
      });

      (settlements ?? []).forEach((s) => {
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
        <header className="px-4 pt-10 pb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">All Groups</h1>
          </div>
          <Button
            size="sm"
            className="rounded-full px-4 transition-all duration-200 hover:scale-105"
            onClick={() => navigate("/join")}
          >
            Join group
          </Button>
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
                    className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
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
            <Card className="rounded-2xl p-4 text-sm text-muted-foreground shadow-sm transition-all duration-200 hover:scale-[1.02]">
              No groups yet. Create one from Home.
            </Card>
          )}
        </section>

        <MobileBottomNav />
      </main>
    </div>
  );
};

export default GroupsListPage;
