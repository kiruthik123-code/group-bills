import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    if (net > 0) return `You should receive ${currency.format(net)} across all groups`;
    if (net < 0) return `You should pay ${currency.format(Math.abs(net))} across all groups`;
    return "You're all settled up across all groups";
  }, [balances]);

  const { data: payables } = useQuery({
    queryKey: ["payables", user?.id],
    queryFn: async () => {
      if (!user) return [] as { counterpartyId: string; name: string; amount: number; upiId: string | null }[];

      const { data: expenses } = (await supabase
        .from("expenses")
        .select("id, group_id, amount, paid_by, expense_splits(user_id, share_amount)")) as any;

      const { data: settlements } = await supabase
        .from("settlements")
        .select("amount, payer_id, receiver_id, status");

      const perPerson: Record<string, number> = {};

      (expenses ?? []).forEach((exp: any) => {
        const splits = exp.expense_splits ?? [];
        splits.forEach((split: any) => {
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

      (settlements ?? []).forEach((s: any) => {
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
      (profiles ?? []).forEach((p: any) => {
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

  const [selectedPayee, setSelectedPayee] = useState<
    | { counterpartyId: string; name: string; amount: number; upiId: string | null }
    | null
  >(null);
  const [upiAmount, setUpiAmount] = useState<string>("");
  const [upiNote, setUpiNote] = useState<string>("Settling up via SplitStuff");
  const [isUpiDialogOpen, setIsUpiDialogOpen] = useState(false);

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

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent || "");
    if (!isMobile) {
      toast({
        title: "Open on your phone",
        description: "UPI apps work best on mobile. Open SplitStuff on your phone to complete the payment.",
        variant: "destructive",
      });
      return;
    }

    const amountNumber = Number(upiAmount.replace(/,/g, ""));
    const params = new URLSearchParams();
    params.set("pa", selectedPayee.upiId);
    params.set("pn", selectedPayee.name);
    params.set("cu", "INR");
    if (!Number.isNaN(amountNumber) && amountNumber > 0) {
      params.set("am", amountNumber.toFixed(2));
    }
    if (upiNote.trim()) {
      params.set("tn", upiNote.trim());
    }

    const url = `upi://pay?${params.toString()}`;

    console.log("Launching UPI payment", {
      url,
      payeeId: selectedPayee.counterpartyId,
    });

    try {
      window.location.href = url;
    } catch (error) {
      console.error("UPI launch failed", error);
      toast({
        title: "Could not open UPI app",
        description: "Make sure you have a UPI app installed and try again.",
        variant: "destructive",
      });
    }
  };

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))] font-sans">
      <main className="mx-auto flex max-w-md flex-col pb-20">
        <header className="px-4 pt-10 pb-4">
          <p className="text-sm font-semibold text-foreground">Hey there! 👋</p>
        </header>

        <section className="px-4">
          <Card className="overflow-hidden rounded-[1.75rem] border-0 bg-gradient-to-br from-[hsl(210_100%_97%)] via-[hsl(280_100%_96%)] to-[hsl(210_100%_97%)] shadow-lg">
            <div className="p-5">
              <p className="text-xs font-medium text-muted-foreground">Total balance</p>
              <p className="mt-2 text-3xl font-extrabold text-foreground">
                {currency.format(Math.max(balances?.totalOwed ?? 0, balances?.totalOwedToYou ?? 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{netSummary}</p>
            </div>
          </Card>
        </section>

        <section className="mt-6 flex-1 px-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">People to pay</h2>
          </div>
          {payables && payables.length > 0 ? (
            <div className="space-y-3">
              {payables.map((item) => (
                <Card
                  key={item.counterpartyId}
                  className="flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3 shadow-sm transition hover:bg-accent"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenPayee(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenPayee(item);
                    }
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">Pay {item.name}</p>
                    {item.upiId ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">UPI ID available</p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">UPI ID not added yet</p>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold text-destructive">{currency.format(item.amount)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">across all groups</p>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl p-4 text-sm text-muted-foreground shadow-sm">
              You don't need to pay anyone right now. 🎉
            </Card>
          )}
        </section>

        <AlertDialog open={isUpiDialogOpen} onOpenChange={setIsUpiDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pay via UPI</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedPayee ? (
                  <span>
                    You're about to pay <span className="font-semibold text-foreground">{selectedPayee.name}</span>.
                  </span>
                ) : (
                  "Select someone from the list of people to pay."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {selectedPayee && (
              <div className="space-y-3 py-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Receiver UPI ID</p>
                  <p className="text-sm font-mono text-foreground">
                    {selectedPayee.upiId ?? "No UPI ID added"}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="upi-amount">
                    Amount (optional)
                  </label>
                  <Input
                    id="upi-amount"
                    value={upiAmount}
                    onChange={(e) => setUpiAmount(e.target.value)}
                    placeholder={selectedPayee.amount ? selectedPayee.amount.toFixed(2) : "0.00"}
                    inputMode="decimal"
                    className="h-9 rounded-2xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="upi-note">
                    Note (optional)
                  </label>
                  <Input
                    id="upi-note"
                    value={upiNote}
                    onChange={(e) => setUpiNote(e.target.value)}
                    placeholder="Dinner, rent, trip..."
                    className="h-9 rounded-2xl"
                  />
                </div>
                {!selectedPayee.upiId && (
                  <p className="text-xs text-destructive">
                    This person hasn't added a UPI ID yet. Ask them to update their profile before paying.
                  </p>
                )}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              <AlertDialogAction
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handlePayViaUpi}
                disabled={!selectedPayee || !selectedPayee.upiId}
              >
                Pay via UPI
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <button
          type="button"
          onClick={handleCreateGroup}
          className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-secondary text-primary-foreground shadow-xl"
        >
          +
        </button>

        <nav className="fixed bottom-0 left-0 right-0 border-t bg-card/95 shadow-[0_-6px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-around px-8 py-3 text-[11px] font-medium">
            <button className="flex flex-col items-center gap-0.5 text-primary">
              <span>Home</span>
            </button>
            <button
              className="flex flex-col items-center gap-0.5 text-muted-foreground"
              onClick={() => navigate("/groups")}
            >
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

export default Index;
