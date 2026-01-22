import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AddExpenseDialog } from "@/components/groups/AddExpenseDialog";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

type Group = Pick<Database['public']['Tables']['groups']['Row'], 'id' | 'name' | 'created_at'>;

type ExpenseWithSplits = Pick<Database['public']['Tables']['expenses']['Row'], 'id' | 'group_id' | 'amount' | 'paid_by'> & {
  expense_splits: Pick<Database['public']['Tables']['expense_splits']['Row'], 'user_id' | 'share_amount'>[]
};

type Settlement = Pick<Database['public']['Tables']['settlements']['Row'], 'amount' | 'payer_id' | 'receiver_id' | 'status' | 'group_id'>;


const GroupsListPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupForExpense, setSelectedGroupForExpense] = useState<{ id: string; name: string } | null>(null);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

  const handleOpenAddExpense = (id: string, name: string) => {
    setSelectedGroupForExpense({ id, name });
    setIsAddExpenseOpen(true);
  };

  const handleSettle = (balance: number) => {
    if (Math.abs(balance) < 0.01) {
      toast("Nothing to settle 🎉", {
        duration: 2000,
        style: {
          background: "#1C1C1E",
          color: "white",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
        },
      });
    } else {
      // Logic for non-zero balance could be navigation to settlement
      // For now, let's keep it simple as requested or just show the toast if 0
      if (balance < 0) {
        // You owe, maybe navigate to home or payment
        toast.error("Please settle your dues from the home screen");
      } else {
        toast.info("Remind friends to pay you back!");
      }
    }
  };

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
    <div className="relative w-full max-w-md min-h-screen bg-fintech-bg overflow-hidden flex flex-col mx-auto font-sans text-white selection:bg-fintech-orange/30">
      <div className="absolute top-0 left-0 right-0 h-[400px] z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top right, rgba(255, 90, 44, 0.08) 0%, transparent 60%)' }}></div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-fintech-bg/80 backdrop-blur-md px-6 py-6 flex items-center justify-between border-b border-fintech-border">
        <div className="w-10 h-10 rounded-full bg-fintech-card border border-fintech-border flex items-center justify-center overflow-hidden">
          <div className="font-bold text-fintech-orange text-sm uppercase">{(user?.email || "U").charAt(0)}</div>
        </div>
        <div className="flex flex-col items-center">
          <h1 className="text-lg font-bold tracking-tight">Groups</h1>
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-fintech-orange"></span>
            <p className="text-[10px] uppercase tracking-[0.2em] text-fintech-muted font-bold">Activity</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/join')}
            className="w-10 h-10 rounded-full bg-fintech-card flex items-center justify-center active:scale-95 transition-all hover:bg-fintech-border border border-fintech-border"
          >
            <span className="material-symbols-outlined text-[20px] text-fintech-orange">group_add</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-6 pb-32 pt-6">
        {/* Search Input Integrated in Main */}
        <div className="relative mb-6">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-fintech-muted text-lg">search</span>
          <input
            type="text"
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-fintech-card border border-fintech-border rounded-[16px] h-12 pl-12 pr-4 text-sm text-white placeholder:text-fintech-muted focus:outline-none focus:border-fintech-orange/30 transition-all"
          />
        </div>
        {groups && groups.length > 0 ? (
          <div className="flex flex-col gap-3">
            {(() => {
              const filteredGroups = groups.filter((group) =>
                group.name.toLowerCase().includes(searchQuery.toLowerCase())
              );

              if (filteredGroups.length === 0 && searchQuery.trim() !== "") {
                return (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-fintech-card border border-fintech-border flex items-center justify-center text-fintech-muted mb-4">
                      <span className="material-symbols-outlined text-2xl">search_off</span>
                    </div>
                    <h3 className="text-white font-bold">No groups found</h3>
                    <p className="text-fintech-muted text-sm mt-1">
                      Check your spelling or try another name.
                    </p>
                  </div>
                );
              }

              return filteredGroups.map((group) => {
                const net = perGroupNet?.[group.id] ?? 0;
                const isPositive = net > 0.01;
                const isNegative = net < -0.01;
                const isSettled = !isPositive && !isNegative;
                const label = isPositive ? "you get" : isNegative ? "you owe" : "settled";
                const amountText = currency.format(Math.abs(net));

                return (
                  <SwipeableGroupCard
                    key={group.id}
                    group={group}
                    net={net}
                    label={label}
                    amountText={amountText}
                    isSettled={isSettled}
                    onNavigate={() => navigate(`/groups/${group.id}`)}
                    onAddExpense={() => handleOpenAddExpense(group.id, group.name)}
                    onSettle={() => handleSettle(net)}
                  />
                );
              });
            })()}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 opacity-50">
            <span className="material-symbols-outlined text-4xl mb-4">groups</span>
            <p>No groups found</p>
          </div>
        )}
      </main>

      <MobileBottomNav />

      {selectedGroupForExpense && (
        <AddExpenseDialog
          open={isAddExpenseOpen}
          onOpenChange={setIsAddExpenseOpen}
          groupId={selectedGroupForExpense.id}
          groupName={selectedGroupForExpense.name}
        />
      )}
    </div>
  );
};

interface SwipeableGroupCardProps {
  group: Group;
  net: number;
  label: string;
  amountText: string;
  isSettled: boolean;
  onNavigate: () => void;
  onAddExpense: () => void;
  onSettle: () => void;
}

const SwipeableGroupCard = ({
  group,
  label,
  amountText,
  isSettled,
  onNavigate,
  onAddExpense,
  onSettle,
}: SwipeableGroupCardProps) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, -50, 0, 50, 100], [0, 1, 1, 1, 0]);
  const addOpacity = useTransform(x, [0, 60], [0, 1]);
  const settleOpacity = useTransform(x, [-60, 0], [1, 0]);

  const onDragEnd = (event: any, info: any) => {
    if (info.offset.x > 100) {
      onAddExpense();
    } else if (info.offset.x < -100) {
      onSettle();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[16px]">
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
        <motion.div style={{ opacity: addOpacity }} className="flex items-center gap-2 text-emerald-500 font-bold">
          <span className="material-symbols-outlined">add_circle</span>
          <span className="text-xs uppercase tracking-wider">Add Expense</span>
        </motion.div>
        <motion.div style={{ opacity: settleOpacity }} className="flex items-center gap-2 text-fintech-orange font-bold">
          <span className="text-xs uppercase tracking-wider">Settle</span>
          <span className="material-symbols-outlined">payments</span>
        </motion.div>
      </div>

      <motion.button
        drag="x"
        dragConstraints={{ left: -100, right: 100 }}
        dragElastic={0.2}
        onDragEnd={onDragEnd}
        style={{ x }}
        onClick={onNavigate}
        className="relative w-full bg-fintech-card p-5 flex items-center justify-between border border-fintech-border active:scale-[0.98] transition-all group z-10"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-fintech-border flex items-center justify-center text-fintech-orange font-bold text-lg">
            {group.name.charAt(0).toUpperCase()}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-[15px] text-white truncate max-w-[120px]">{group.name}</h3>
            <p className="text-[11px] font-medium text-fintech-muted mt-0.5">
              {new Date(group.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 min-w-[100px]">
          {isSettled ? (
            <div className="flex flex-col items-end">
              <p className="text-sm font-semibold text-fintech-settled">{amountText}</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-fintech-settled/60">Settled</p>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className="px-3 py-1 rounded-full bg-fintech-orange/12">
                <p className="text-sm font-bold leading-none text-fintech-orange">{amountText}</p>
              </div>
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-fintech-orange/70">{label}</p>
            </div>
          )}
        </div>
      </motion.button>
    </div>
  );
};

export default GroupsListPage;
