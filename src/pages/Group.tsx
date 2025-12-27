import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR"
});
const expenseSchema = z.object({
  title: z.string().trim().nonempty("Title is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paidBy: z.string().uuid("Select who paid"),
  notes: z.string().trim().max(500).optional(),
  splitType: z.enum(["normal", "custom"], {
    required_error: "Choose a split type"
  })
});
type ExpenseFormValues = z.infer<typeof expenseSchema>;
const GroupPage = () => {
  const {
    groupId
  } = useParams<{
    groupId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    user,
    loading
  } = useAuth();
  const {
    toast
  } = useToast();
  const {
    data: group
  } = useQuery({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("groups").select("id, name, created_by, invite_code, invite_link").eq("id", groupId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!groupId && !loading && !!user
  });
  const {
    data: members
  } = useQuery({
    queryKey: ["group-members", groupId],
    queryFn: async () => {
      const {
        data: memberRows,
        error
      } = await supabase.from("group_members").select("user_id, joined_at").eq("group_id", groupId).order("joined_at", {
        ascending: true
      });
      if (error) throw error;
      const members = memberRows ?? [];
      if (members.length === 0) return [] as Array<{
        user_id: string;
        joined_at: string;
        full_name: string | null;
      }>;
      const userIds = members.map((m: any) => m.user_id);
      const {
        data: profiles,
        error: profilesError
      } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
      return members.map((m: any) => ({
        ...m,
        full_name: profileMap.get(m.user_id) ?? null
      }));
    },
    enabled: !!groupId && !loading && !!user
  });
  const {
    data: expenses
  } = useQuery({
    queryKey: ["expenses", groupId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("expenses").select("id, title, amount, expense_date, paid_by, notes, expense_splits(user_id, share_amount)").eq("group_id", groupId).order("expense_date", {
        ascending: false
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!groupId && !loading && !!user
  });
  const {
    data: settlements
  } = useQuery({
    queryKey: ["settlements", groupId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("settlements").select("id, payer_id, receiver_id, amount, status").eq("group_id", groupId).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!groupId && !loading && !!user
  });
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    (members ?? []).forEach((m: any) => {
      const baseName = m.full_name || m.user_id;
      const isYou = user && m.user_id === user.id;
      const name = isYou ? `${baseName} (You)` : baseName;
      map.set(m.user_id, name);
    });
    return map;
  }, [members, user]);
  const balances = useMemo(() => {
    const byUser: Record<string, number> = {};
    (members ?? []).forEach((m: any) => {
      byUser[m.user_id] = 0;
    });
    (expenses ?? []).forEach((exp: any) => {
      const splits = exp.expense_splits ?? [];
      splits.forEach((split: any) => {
        if (!byUser.hasOwnProperty(split.user_id)) return;
        byUser[split.user_id] -= split.share_amount;
        if (byUser.hasOwnProperty(exp.paid_by)) {
          byUser[exp.paid_by] += split.share_amount;
        }
      });
    });
    (settlements ?? []).forEach((s: any) => {
      if (s.status !== "settled") return;
      if (!byUser.hasOwnProperty(s.payer_id) || !byUser.hasOwnProperty(s.receiver_id)) return;
      byUser[s.payer_id] += s.amount;
      byUser[s.receiver_id] -= s.amount;
    });
    return byUser;
  }, [members, expenses, settlements]);
  const recommendedTransfers = useMemo(() => {
    if (!balances) return [];
    const creditors: {
      userId: string;
      amount: number;
    }[] = [];
    const debtors: {
      userId: string;
      amount: number;
    }[] = [];
    Object.entries(balances).forEach(([userId, value]) => {
      if (value > 0.01) creditors.push({
        userId,
        amount: value
      });else if (value < -0.01) debtors.push({
        userId,
        amount: -value
      });
    });
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
    const transfers: {
      from: string;
      to: string;
      amount: number;
    }[] = [];
    let i = 0,
      j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const amount = Math.min(d.amount, c.amount);
      transfers.push({
        from: d.userId,
        to: c.userId,
        amount
      });
      d.amount -= amount;
      c.amount -= amount;
      if (d.amount < 0.01) i++;
      if (c.amount < 0.01) j++;
    }
    return transfers;
  }, [balances]);
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      title: "",
      amount: 0,
      paidBy: user?.id ?? "",
      notes: "",
      splitType: "normal"
    }
  });
  const [customPercents, setCustomPercents] = useState<Record<string, string>>({});
  const addExpense = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      if (!groupId) throw new Error("Missing group id");
      const participants = members ?? [];
      if (participants.length === 0) throw new Error("No group members to split with");
      let splits: {
        expense_id: string;
        user_id: string;
        share_amount: number;
      }[] = [];
      if (values.splitType === "normal") {
        const equalShare = Number((values.amount / participants.length).toFixed(2));
        splits = participants.map((p: any) => ({
          expense_id: "",
          user_id: p.user_id,
          share_amount: equalShare
        }));
      } else {
        const percents: {
          user_id: string;
          percent: number;
        }[] = [];
        (participants as any[]).forEach(p => {
          const raw = customPercents[p.user_id];
          const num = raw ? Number(raw) : 0;
          if (num > 0) {
            percents.push({
              user_id: p.user_id,
              percent: num
            });
          }
        });
        const totalPercent = percents.reduce((sum, p) => sum + p.percent, 0);
        if (totalPercent <= 0) {
          throw new Error("Enter percentages for at least one member.");
        }
        if (Math.abs(totalPercent - 100) > 0.5) {
          throw new Error("Custom percentages must add up to 100% (allowing small rounding).");
        }
        splits = percents.map(p => ({
          expense_id: "",
          user_id: p.user_id,
          share_amount: Number((values.amount * p.percent / 100).toFixed(2))
        }));
      }
      const {
        data: expense,
        error
      } = await supabase.from("expenses").insert({
        group_id: groupId,
        title: values.title,
        amount: values.amount,
        paid_by: values.paidBy,
        notes: values.notes || null
      }).select("id").single();
      if (error) throw error;
      const splitsWithExpenseId = splits.map(s => ({
        ...s,
        expense_id: expense.id
      }));
      const {
        error: splitError
      } = await supabase.from("expense_splits").insert(splitsWithExpenseId);
      if (splitError) throw splitError;
    },
    onSuccess: () => {
      form.reset();
      queryClient.invalidateQueries({
        queryKey: ["expenses", groupId]
      });
      queryClient.invalidateQueries({
        queryKey: ["balances", groupId]
      });
      toast({
        title: "Expense added",
        description: "Balances updated for this group."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not add expense",
        description: error.message ?? "Please try again.",
        variant: "destructive"
      });
    }
  });
  const settleMutation = useMutation({
    mutationFn: async ({
      from,
      to,
      amount
    }: {
      from: string;
      to: string;
      amount: number;
    }) => {
      if (!groupId) throw new Error("Missing group id");
      const {
        error
      } = await supabase.from("settlements").insert({
        group_id: groupId,
        payer_id: from,
        receiver_id: to,
        amount,
        status: "settled"
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["settlements", groupId]
      });
      queryClient.invalidateQueries({
        queryKey: ["expenses", groupId]
      });
      toast({
        title: "Settlement recorded",
        description: "Balances updated."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not record settlement",
        description: error.message ?? "Please try again.",
        variant: "destructive"
      });
    }
  });
  if (!groupId) {
    navigate("/");
    return null;
  }
  const isCreator = user && group && group.created_by === user.id;
  const inviteUrl = group?.invite_code ? group.invite_link || `https://splitstuff.app/join/${group.invite_code}` : null;

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!groupId || !user) throw new Error("Missing context");
      if (!isCreator) throw new Error("Only the group creator can generate an invite.");
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      const link = `https://splitstuff.app/join/${code}`;
      const { error } = await supabase
        .from("groups")
        .update({ invite_code: code, invite_link: link })
        .eq("id", groupId)
        .eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      toast({
        title: "Invite created",
        description: "You can now share this link or code."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not generate invite",
        description: error.message ?? "Please try again.",
        variant: "destructive"
      });
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberUserId: string) => {
      if (!groupId || !user) throw new Error("Missing context");
      if (!isCreator) throw new Error("Only the group creator can remove members.");

      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", memberUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
      queryClient.invalidateQueries({ queryKey: ["balances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["settlements", groupId] });
      toast({
        title: "Member removed",
        description: "The member has been removed from this group."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not remove member",
        description: error.message ?? "Please try again.",
        variant: "destructive"
      });
    }
  });
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard.`
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access.",
        variant: "destructive"
      });
    }
  };
  const handleShare = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: group?.name ?? "SplitStuff group",
          text: "Join my SplitStuff group",
          url: inviteUrl
        });
      } catch {
        // ignore cancel
      }
    } else {
      handleCopy(inviteUrl, "Invite link");
    }
  };
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))] font-sans">
      <header className="relative bg-transparent px-4 pt-6 pb-3 flex items-center justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="absolute left-4"
        >
          {"<-"} Back
        </Button>
        <h1 className="text-base font-extrabold text-foreground text-center max-w-[70%] truncate">
          {group?.name ?? "Group"}
        </h1>
      </header>

      <main className="mx-auto max-w-md md:max-w-4xl space-y-4 px-4 pb-20">
        <section className="grid gap-3 md:gap-4 md:grid-cols-2">
          <Card className="p-3 md:p-4 rounded-2xl border-0 shadow-md">
            <h2 className="mb-2 text-xs md:text-sm font-medium text-muted-foreground">Balances</h2>
            {balances && Object.keys(balances).length > 0 ? (
              <ul className="space-y-1 text-xs md:text-sm">
                {Object.entries(balances).map(([userId, value]) => (
                  <li
                    key={userId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate max-w-[55%]">
                      {memberMap.get(userId) ?? userId}
                    </span>
                    <span
                      className={
                        value > 0
                          ? "font-semibold text-success"
                          : value < 0
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {value > 0 && "+"}
                      {currency.format(value)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs md:text-sm text-muted-foreground">
                No balances yet. Add an expense to get started.
              </p>
            )}
          </Card>

          <Card className="p-3 md:p-4 space-y-2 md:space-y-3 rounded-2xl border-0 shadow-md">
            <h2 className="text-xs md:text-sm font-medium text-muted-foreground">Invite people</h2>
            {inviteUrl && group?.invite_code ? (
              <div className="space-y-2 text-xs md:text-sm">
                <div>
                  <p className="text-[10px] md:text-xs text-muted-foreground">Share this link</p>
                  <div className="mt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Input readOnly value={inviteUrl} className="text-[10px] md:text-xs" />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(inviteUrl, "Invite link")}
                      >
                        Copy
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleShare}>
                        Share
                      </Button>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mt-2 text-[10px] md:text-xs text-muted-foreground">
                    Or share this code
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-1 text-[10px] md:text-xs font-mono tracking-widest">
                      {group.invite_code}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(group.invite_code!, "Invite code")}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            ) : isCreator ? (
              <div className="space-y-2 text-xs md:text-sm">
                <p className="text-muted-foreground">
                  Generate an invite link and code you can share with others to join this group.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate()}
                >
                  Generate invite
                </Button>
              </div>
            ) : (
              <p className="text-xs md:text-sm text-muted-foreground">
                The group creator can generate an invite link to share.
              </p>
            )}
          </Card>
        </section>

        <section>
          <Card className="p-4 rounded-2xl border-0 shadow-md">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Members</h2>
            {members && members.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {[...(members as any[])].map((m) => {
                  const baseName = m.full_name || m.user_id;
                  const isYou = user && m.user_id === user.id;
                  const displayName = isYou ? `${baseName} (You)` : baseName;
                  const initials = String(baseName || "?")
                    .split(" ")
                    .filter(Boolean)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase();
                  const joinedAt = m.joined_at
                    ? new Date(m.joined_at).toLocaleDateString()
                    : undefined;

                  return (
                    <li
                      key={m.user_id}
                      className="flex items-center justify-between gap-3"
                   >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{initials || "?"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium leading-none text-foreground">
                            {displayName}
                          </p>
                          {joinedAt && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Joined {joinedAt}
                            </p>
                          )}
                        </div>
                      </div>

                      {isCreator && !isYou && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={removeMemberMutation.isPending}
                          onClick={() => removeMemberMutation.mutate(m.user_id)}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            )}
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Expenses</h2>
            {expenses && expenses.length > 0 ? <ul className="space-y-3 text-sm">
                {expenses.map((exp: any) => <li key={exp.id} className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0">
                    <div>
                      <p className="font-medium">{exp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {currency.format(exp.amount)} • {new Date(exp.expense_date).toLocaleDateString()} • Paid by{" "}
                        {memberMap.get(exp.paid_by) ?? exp.paid_by}
                      </p>
                      {exp.notes && <p className="mt-1 text-xs text-muted-foreground">{exp.notes}</p>}
                    </div>
                  </li>)}
              </ul> : <p className="text-sm text-muted-foreground">No expenses yet.</p>}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Add expense</h2>
            <Form {...form}>
              <form className="space-y-3" onSubmit={form.handleSubmit(values => {
              addExpense.mutate(values);
            })}>
                <FormField control={form.control} name="title" render={({
                field
              }) => <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Dinner, Taxi, Groceries" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="amount" render={({
                field
              }) => <FormItem>
                      <FormLabel>Amount (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="paidBy" render={({
                field
              }) => <FormItem>
                      <FormLabel>Paid by</FormLabel>
                      <FormControl>
                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" {...field}>
                          <option value="">Select member</option>
                          {(members ?? []).map((m: any) => <option key={m.user_id} value={m.user_id}>
                              {memberMap.get(m.user_id) ?? (user && m.user_id === user.id ? "You" : m.user_id)}
                            </option>)}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="splitType" render={({
                field
              }) => <FormItem>
                      <FormLabel>Split type</FormLabel>
                      <div className="flex gap-2">
                        <Button type="button" variant={field.value === "normal" ? "default" : "outline"} size="sm" onClick={() => field.onChange("normal")}>
                          Normal split
                        </Button>
                        <Button type="button" variant={field.value === "custom" ? "default" : "outline"} size="sm" onClick={() => field.onChange("custom")}>
                          Custom split
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>} />

                {form.watch("splitType") === "custom" && <div className="space-y-2 rounded-md border border-dashed border-input p-3">
                    <p className="text-xs text-muted-foreground">
                      Enter the percentage each person should pay. Total should be 100%.
                    </p>
                    <div className="space-y-1 text-xs">
                      {(members ?? []).map((m: any) => {
                    const name = memberMap.get(m.user_id) ?? (user && m.user_id === user.id ? "You" : m.user_id);
                    return <div key={m.user_id} className="flex items-center gap-2">
                            <span className="w-32 truncate" title={name}>
                              {name}
                            </span>
                            <Input type="number" min={0} max={100} step={0.01} className="h-8 w-24 text-xs" value={customPercents[m.user_id] ?? ""} onChange={e => setCustomPercents(prev => ({
                        ...prev,
                        [m.user_id]: e.target.value
                      }))} />
                            <span>%</span>
                          </div>;
                  })}
                    </div>
                  </div>}

                <FormField control={form.control} name="notes" render={({
                field
              }) => <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Included drinks" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <Button type="submit" className="w-full" disabled={addExpense.isPending}>
                  Add expense
                </Button>
              </form>
            </Form>
          </Card>
        </section>
      </main>
    </div>;
};
export default GroupPage;