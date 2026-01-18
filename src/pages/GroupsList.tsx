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
    <div className="relative w-full max-w-md min-h-screen bg-deep-black overflow-hidden flex flex-col mx-auto font-sans text-white selection:bg-brand/30">
      <div className="absolute top-0 left-0 right-0 h-[300px] z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top right, rgba(255, 77, 45, 0.1) 0%, transparent 60%)' }}></div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[rgba(28,28,30,0.8)] backdrop-blur-[20px] px-6 pt-8 pb-6 flex flex-col gap-6 border-b border-white/5">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white">Your Groups</h1>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/join')}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:scale-95 transition-all hover:bg-white/10"
              title="Join Group"
            >
              <span className="material-symbols-outlined text-[24px]">group_add</span>
            </button>
            {/* Note: Create Group is usually on Home, but useful here too */}
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-white/70 group-focus-within:text-white transition-colors">search</span>
          <input
            type="text"
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-brand border-none rounded-[20px] h-12 pl-12 pr-4 text-sm text-white placeholder:text-white/70 focus:outline-none shadow-lg shadow-brand/20 transition-all font-medium"
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-6 pb-32 pt-4">
        {groups && groups.length > 0 ? (
          <div className="flex flex-col gap-3">
            {(() => {
              const filteredGroups = groups.filter((group) =>
                group.name.toLowerCase().includes(searchQuery.toLowerCase())
              );

              if (filteredGroups.length === 0 && searchQuery.trim() !== "") {
                return (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-4">
                      <span className="material-symbols-outlined text-4xl">search_off</span>
                    </div>
                    <h3 className="text-white font-bold text-lg">No groups found</h3>
                    <p className="text-white/40 text-sm mt-1 max-w-[200px] mx-auto">
                      Try different keywords or check for typos.
                    </p>
                  </div>
                );
              }

              return filteredGroups.map((group) => {
                const net = perGroupNet?.[group.id] ?? 0;
                const isPositive = net > 0.01;
                const isNegative = net < -0.01;
                const label = isPositive ? "you get" : isNegative ? "you owe" : "settled";
                const amountText = currency.format(Math.abs(net));

                const statusStyles = isPositive
                  ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
                  : isNegative
                    ? "text-rose-600 bg-rose-500/10 border-rose-500/20"
                    : "text-gray-500 bg-gray-500/10 border-gray-500/20";

                return (
                  <SwipeableGroupCard
                    key={group.id}
                    group={group}
                    net={net}
                    label={label}
                    amountText={amountText}
                    statusStyles={statusStyles}
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
  statusStyles: string;
  onNavigate: () => void;
  onAddExpense: () => void;
  onSettle: () => void;
}

const SwipeableGroupCard = ({
  group,
  label,
  amountText,
  statusStyles,
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
    <div className="relative overflow-hidden rounded-[24px]">
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
        <motion.div style={{ opacity: addOpacity }} className="flex items-center gap-2 text-emerald-500 font-bold">
          <span className="material-symbols-outlined">add_circle</span>
          <span className="text-xs uppercase tracking-wider">Add Expense</span>
        </motion.div>
        <motion.div style={{ opacity: settleOpacity }} className="flex items-center gap-2 text-brand font-bold">
          <span className="text-xs uppercase tracking-wider">Settle Up</span>
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
        className="relative w-full bg-floral-white p-4 flex items-center justify-between border border-white/10 hover:border-white/20 active:scale-[0.98] transition-all group shadow-sm z-10"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[18px] bg-charcoal/5 flex items-center justify-center text-charcoal font-bold text-lg group-hover:bg-brand/10 group-hover:text-brand transition-colors">
            {group.name.charAt(0).toUpperCase()}
          </div>
          <div className="text-left">
            <h3 className="font-bold text-[15px] text-charcoal group-hover:text-brand transition-colors">{group.name}</h3>
            <p className="text-[11px] font-medium text-charcoal/40 mt-0.5">
              Created {new Date(group.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
          <div className={`px-3 py-1.5 rounded-full border flex items-center justify-center ${statusStyles}`}>
            <p className="text-sm font-bold leading-none">{amountText}</p>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-charcoal/30">{label}</p>
        </div>
      </motion.button>
    </div>
  );
};

export default GroupsListPage;
