import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Users } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

type ExpenseWithSplits = Pick<Database['public']['Tables']['expenses']['Row'], 'id' | 'group_id' | 'amount' | 'paid_by'> & {
  expense_splits: Pick<Database['public']['Tables']['expense_splits']['Row'], 'user_id' | 'share_amount'>[]
};

type Settlement = Pick<Database['public']['Tables']['settlements']['Row'], 'amount' | 'payer_id' | 'receiver_id' | 'status'>;


const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const { data: balances } = useQuery({
    queryKey: ["balances"],
    queryFn: async () => {
      if (!user) return { totalOwed: 0, totalOwedToYou: 0 };

      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)")
        .returns<ExpenseWithSplits[]>();

      const { data: settlements } = await supabase
        .from("settlements")
        .select("amount, payer_id, receiver_id, status")
        .returns<Settlement[]>();

      let totalOwed = 0;
      let totalOwedToYou = 0;

      (expenses ?? []).forEach((exp) => {
        const splits = exp.expense_splits ?? [];
        splits.forEach((split) => {
          if (split.user_id === user.id && exp.paid_by !== user.id) {
            totalOwed += split.share_amount;
          }
          if (exp.paid_by === user.id && split.user_id !== user.id) {
            totalOwedToYou += split.share_amount;
          }
        });
      });

      (settlements ?? []).forEach((s) => {
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
    if (net > 0) return `You should receive ${currency.format(net)} across all groups`;
    if (net < 0) return `You should pay ${currency.format(Math.abs(net))} across all groups`;
    return "You're all settled up across all groups";
  }, [balances]);

  const { data: payables } = useQuery({
    queryKey: ["payables", user?.id],
    queryFn: async () => {
      if (!user)
        return [] as { counterpartyId: string; name: string; amount: number; upiId: string | null }[];

      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)")
        .returns<ExpenseWithSplits[]>();

      const { data: settlements } = await supabase
        .from("settlements")
        .select("amount, payer_id, receiver_id, status");

      const perPerson: Record<string, number> = {};

      (expenses ?? []).forEach((exp) => {
        const splits = exp.expense_splits ?? [];
        splits.forEach((split) => {
          if (split.user_id === user.id && exp.paid_by !== user.id) {
            // You owe the payer
            perPerson[exp.paid_by] = (perPerson[exp.paid_by] ?? 0) - split.share_amount;
          }
          if (exp.paid_by === user.id && split.user_id !== user.id) {
            // Others owe you
            perPerson[split.user_id] = (perPerson[split.user_id] ?? 0) + split.share_amount;
          }
        });
      });

      (settlements ?? []).forEach((s) => {
        if (s.status !== "settled") return;
        if (s.payer_id === user.id) {
          // You paid them back
          perPerson[s.receiver_id] = (perPerson[s.receiver_id] ?? 0) + s.amount;
        }
        if (s.receiver_id === user.id) {
          // They paid you back
          perPerson[s.payer_id] = (perPerson[s.payer_id] ?? 0) - s.amount;
        }
      });

      const oweIds = Object.entries(perPerson)
        .filter(([, amount]) => amount < -0.01)
        .map(([id]) => id);

      if (oweIds.length === 0)
        return [] as { counterpartyId: string; name: string; amount: number; upiId: string | null }[];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, upi_id")
        .in("id", oweIds);
      if (profilesError) throw profilesError;

      const infoMap = new Map<string, { name: string; upiId: string | null }>();
      (profiles ?? []).forEach((p) => {
        infoMap.set(p.id, { name: p.full_name || "Friend", upiId: p.upi_id ?? null });
      });

      return oweIds
        .map((id) => {
          const info = infoMap.get(id);
          return {
            counterpartyId: id,
            name: info?.name ?? "Friend",
            upiId: info?.upiId ?? null,
            amount: Math.abs(perPerson[id]),
          };
        })
        .sort((a, b) => b.amount - a.amount);
    },
    enabled: !!user,
  });

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
  });

  const [selectedPayee, setSelectedPayee] = useState<
    | { counterpartyId: string; name: string; amount: number; upiId: string | null }
    | null
  >(null);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  const [upiAmount, setUpiAmount] = useState<string>("");
  const [upiNote, setUpiNote] = useState<string>("Settling up via SplitStuff");
  const [isUpiDialogOpen, setIsUpiDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const handleOpenPayee = (
    item: { counterpartyId: string; name: string; amount: number; upiId: string | null }
  ) => {
    setSelectedPayee(item);
    setUpiAmount(item.amount ? item.amount.toFixed(2) : "");
    setIsUpiDialogOpen(true);
  };

  const handlePayViaUpi = () => {
    if (!selectedPayee) return;
    if (!selectedPayee.upiId) {
      toast({
        title: "UPI ID missing",
        description: "This person hasn't added a UPI ID yet. Ask them to update their profile.",
        variant: "destructive",
      });
      return;
    }

    // Navigate to the new UPI payment page with payment details in URL parameters
    const params = new URLSearchParams();
    params.set("name", selectedPayee.name);
    params.set("upi", selectedPayee.upiId);
    params.set("amount", upiAmount);
    params.set("note", upiNote.trim() || "Settling up via SplitStuff");

    navigate(`/upi-payment?${params.toString()}`);
  };

  const generateInviteCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const array = new Uint8Array(8);

    crypto.getRandomValues(array);

    let result = "";
    for (let i = 0; i < array.length; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  };

  const handleCreateGroup = async () => {
    if (!user) return;
    const name = newGroupName.trim();
    if (!name) {
      toast({
        title: "Group name required",
        description: "Please enter a name for your group.",
        variant: "destructive",
      });
      return;
    }

    if (name.length > 15) {
      toast({
        title: "Group name too long",
        description: "Group name must be 15 characters or less.",
        variant: "destructive",
      });
      return;
    }

    try {
      const inviteCode = generateInviteCode();
      const origin = window.location.origin;
      const inviteLink = `${origin}/join/${inviteCode}`;

      const { data, error } = await supabase
        .from("groups")
        .insert({ name, created_by: user.id, invite_code: inviteCode, invite_link: inviteLink })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id });
      toast({ title: "Group created", description: `Group "${name}" was created.` });
      setIsCreateDialogOpen(false);
      setNewGroupName("");
      navigate(`/groups/${data.id}`);
    } catch (error) {
      const message = (error as Error)?.message ?? "Please try again.";
      toast({
        title: "Could not create group",
        description: message,
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="relative w-full max-w-md min-h-screen bg-fintech-bg overflow-hidden flex flex-col mx-auto font-sans text-white selection:bg-fintech-orange/30">
      <div className="absolute top-0 left-0 right-0 h-[500px] z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top left, rgba(255, 90, 44, 0.08) 0%, transparent 70%)' }}></div>

      {/* Header */}
      <header className="sticky top-0 z-40 px-6 py-6 flex items-center justify-between bg-fintech-bg/80 backdrop-blur-md">
        <div className="w-10 h-10 rounded-full bg-fintech-card border border-fintech-border flex items-center justify-center overflow-hidden">
          {/* Using Initials Avatar */}
          <div className="font-bold text-fintech-orange text-sm">{getInitials(profile?.full_name || "User")}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">Splitster</span>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-6 pb-32">
        {/* Greeting */}
        <div className="mb-8 animate-in slide-in-from-bottom-2 fade-in duration-500">
          <h1 className="text-2xl font-semibold tracking-tight">Hello, <span className="text-fintech-orange">{profile?.full_name?.split(' ')[0] || "Friend"}</span></h1>
          <p className="text-fintech-muted text-[13px] mt-1 font-medium">Welcome back!</p>
        </div>

        {/* Balance Card */}
        {(() => {
          const net = (balances?.totalOwedToYou || 0) - (balances?.totalOwed || 0);
          const isNetPositive = net > 0.01;
          const isNetNegative = net < -0.01;
          const cardBgColor = isNetPositive ? "bg-emerald-600" : isNetNegative ? "bg-rose-600" : "bg-fintech-orange";
          const cardShadowColor = isNetPositive ? "shadow-emerald-900/10" : isNetNegative ? "shadow-rose-900/10" : "shadow-orange-900/10";

          return (
            <div className={`w-full h-auto rounded-[24px] px-7 py-8 flex flex-col justify-between relative overflow-hidden mb-10 group transition-all hover:scale-[1.01] shadow-xl ${cardShadowColor} animate-in zoom-in-95 duration-500 delay-100`}>
              <div className={`absolute inset-0 ${cardBgColor} opacity-100`}></div>
              <div className="relative z-10 mb-8 px-1">
                <p className="text-white/80 font-medium text-[13px] tracking-wide uppercase">Total Net Balance</p>
                <h2 className="text-[42px] font-bold mt-2 text-white leading-tight">
                  {currency.format(Math.abs(net))}
                </h2>
                <div className="mt-4 text-white/90 text-[11px] font-bold bg-black/20 inline-block px-4 py-1.5 rounded-full backdrop-blur-md uppercase tracking-wider">
                  {netSummary}
                </div>
              </div>

              <div className="relative z-10 flex gap-4">
                <div className="bg-black/15 rounded-[18px] px-5 py-4 flex-1 backdrop-blur-sm border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-[14px] text-white/60">arrow_outward</span>
                    <p className="text-[9px] uppercase font-bold text-white/60 tracking-widest">You Owe</p>
                  </div>
                  <p className="text-[19px] font-bold text-white">{currency.format(balances?.totalOwed || 0)}</p>
                </div>
                <div className="bg-black/15 rounded-[18px] px-5 py-4 flex-1 backdrop-blur-sm border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="material-symbols-outlined text-[14px] text-white/60">call_received</span>
                    <p className="text-[9px] uppercase font-bold text-white/60 tracking-widest">You Get</p>
                  </div>
                  <p className="text-[19px] font-bold text-white">{currency.format(balances?.totalOwedToYou || 0)}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Quick Actions */}
        <div className="flex gap-3 mb-8 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex-1 whitespace-nowrap bg-fintech-orange text-white rounded-full py-3 px-6 flex items-center justify-center gap-2 hover:bg-fintech-orange/90 transition-all active:scale-95 font-bold text-sm shadow-lg shadow-fintech-orange/10"
          >
            <span className="material-symbols-outlined text-xl">add</span>
            Create Group
          </button>
          <button
            onClick={() => navigate('/join')}
            className="flex-1 whitespace-nowrap bg-fintech-card text-white border border-fintech-border rounded-full py-3 px-6 flex items-center justify-center gap-2 hover:bg-fintech-border transition-all active:scale-95 font-bold text-sm"
          >
            <span className="material-symbols-outlined text-xl text-fintech-orange">group_add</span>
            Join Group
          </button>
        </div>

        {/* People to Pay (Payables) */}
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="font-bold text-[10px] text-fintech-muted uppercase tracking-[0.2em]">Settlements</h3>
        </div>

        {payables && payables.length > 0 ? (
          <div className="flex flex-col gap-3">
            {payables.map((item) => (
              <div
                key={item.counterpartyId}
                className="bg-fintech-card p-4 rounded-[16px] flex items-center justify-between border border-fintech-border cursor-pointer active:scale-[0.98] transition-all hover:border-fintech-orange/30"
                onClick={() => handleOpenPayee(item)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-fintech-border flex items-center justify-center text-fintech-orange font-bold text-sm">
                    {getInitials(item.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-[15px] text-white">{item.name}</p>
                    <p className="text-[11px] text-fintech-muted mt-0.5">{item.upiId ? "UPI ID Available" : "Payment ID needed"}</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <div className="px-3 py-1 rounded-full bg-fintech-orange/10">
                    <p className="text-[10px] text-fintech-orange uppercase font-bold tracking-wider leading-none">You Owe</p>
                  </div>
                  <p className="font-bold text-white text-lg leading-none">{currency.format(item.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-fintech-card border border-fintech-border rounded-[24px] py-16 px-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-fintech-border flex items-center justify-center text-fintech-orange mb-6">
              <span className="material-symbols-outlined text-3xl">check</span>
            </div>
            <p className="text-white font-semibold text-lg">You're all settled up!</p>
            <p className="text-fintech-muted text-sm mt-2 max-w-[180px]">No pending payments at the moment.</p>
          </div>
        )}
      </main>

      <MobileBottomNav />

      {/* UPI Payment Dialog */}
      <AlertDialog open={isUpiDialogOpen} onOpenChange={setIsUpiDialogOpen}>
        <AlertDialogContent className="bg-charcoal border-white/10 text-white rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Pay {selectedPayee?.name}</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {selectedPayee?.upiId ? "Pay securely via UPI app." : "This user has not set a UPI ID."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedPayee && (
            <div className="space-y-4 py-2">
              <div className="bg-white/5 p-4 rounded-[20px] flex justify-between items-center">
                <span className="text-sm text-white/60">Amount to Pay</span>
                <span className="text-xl font-bold text-white">{currency.format(selectedPayee.amount)}</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider pl-1">Amount</label>
                <Input
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/5 border-white/10 text-white h-12 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider pl-1">Note</label>
                <Input
                  value={upiNote}
                  onChange={(e) => setUpiNote(e.target.value)}
                  placeholder="Payment note..."
                  className="bg-white/5 border-white/10 text-white h-12 rounded-xl"
                />
              </div>
            </div>
          )}

          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogAction
              className="bg-brand text-white hover:bg-brand/90 w-full rounded-xl h-12"
              onClick={handlePayViaUpi}
              disabled={!selectedPayee || !selectedPayee.upiId}
            >
              Pay via UPI
            </AlertDialogAction>
            {selectedPayee?.upiId && (
              <Button
                variant="outline"
                className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white rounded-xl h-12"
                onClick={() => setShowPaymentQR(!showPaymentQR)}
              >
                {showPaymentQR ? 'Hide QR' : 'Show UPI QR Code'}
              </Button>
            )}
            <AlertDialogCancel className="bg-transparent border-none text-white/40 hover:text-white hover:bg-transparent mt-0">Close</AlertDialogCancel>
          </AlertDialogFooter>

          {showPaymentQR && selectedPayee?.upiId && (
            <div className="p-4 border-t border-white/10 pt-4 mt-2 flex flex-col items-center animate-in zoom-in-95">
              <div className="p-3 bg-white rounded-[20px]">
                <QRCodeSVG
                  value={`upi://pay?pa=${selectedPayee.upiId}&pn=${encodeURIComponent(selectedPayee.name)}&am=${Number(upiAmount || selectedPayee.amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(upiNote || 'Settling up via SplitStuff')}`}
                  size={160}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-xs text-brand mt-4 font-bold uppercase tracking-wider">Scan to Pay</p>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Group Dialog */}
      <AlertDialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) setNewGroupName("");
        }}
      >
        <AlertDialogContent className="bg-charcoal border-white/10 text-white rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Group</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              Give your group a name (e.g., "Goa Trip", "Roommates").
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider pl-1">Group Name</label>
              <Input
                id="group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter name..."
                className="bg-white/5 border-white/10 text-white h-12 rounded-xl placeholder:text-white/20"
                maxLength={15}
                autoFocus
              />
              <p className="text-[10px] text-white/30 text-right">{newGroupName.length}/15</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-brand text-white hover:bg-brand/90 rounded-xl"
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
            >
              Create Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
