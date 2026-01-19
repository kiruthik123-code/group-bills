import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Share2, Receipt, Calendar, User, Loader2, MoreHorizontal, LogOut, X } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

import { Skeleton } from "@/components/ui/skeleton";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AddExpenseDialog } from "@/components/groups/AddExpenseDialog";

// Expense schema moved to shared component

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

type GroupMember = {
  id: string;
  name: string;
  avatar_url: string | null;
};

type Expense = Database['public']['Tables']['expenses']['Row'] & {
  created_by_user_id?: string; // This field may not exist in remote DB yet
  expense_splits: {
    user_id: string;
    share_amount: number;
  }[];
};
type Profile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name'>;


const GroupPage = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [isDissolveDialogOpen, setIsDissolveDialogOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showMembers, setShowMembers] = useState(false); // Start with members hidden by default

  // State for custom split percentages moved to dialog

  // Fetch group details
  const { data: group, isLoading: isGroupLoading } = useQuery<Database['public']['Tables']['groups']['Row']>({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId as string)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });

  // Fetch group members
  const { data: members, isLoading: isMembersLoading } = useQuery<GroupMember[]>({
    queryKey: ["group_members", groupId],
    queryFn: async () => {
      // 1. Get member IDs
      const { data: memberData, error: memberError } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId as string);

      if (memberError) throw memberError;

      const userIds = memberData?.map((m: { user_id: string }) => m.user_id) || [];

      if (userIds.length === 0) return [];

      // 2. Get profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      return userIds.map((id) => {
        const profile = profilesData?.find((p) => p.id === id);
        return {
          id,
          name: profile?.full_name || "Unknown Member",
          avatar_url: null,
        };
      });
    },
    enabled: !!groupId,
  });

  // Fetch expenses with splits
  const { data: expenses, isLoading: isExpensesLoading } = useQuery({
    queryKey: ["group_expenses", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, expense_splits(user_id, share_amount)")
        .eq("group_id", groupId as string)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!groupId,
  });

  // Custom splits initialization moved to dialog

  // Need to correct the profiles relationship in the query above if it fails,
  // but looking at types.ts, `paid_by` is a foreign key to `profiles` (implicitly via user_id uuid matching, but not explicitly defined as FK to profiles table in types definition shown). 
  // Actually types.ts shows NO foreign key from expenses.paid_by to profiles.
  // It only shows foreign keys to groups. 
  // So we need to manually fetch profile names or use a different strategy.

  // Refined member fetching (already done). Using `members` map for names is safer.

  // Expense mutations moved to dialog component

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!groupId || !user) throw new Error("Missing data");

      // Delete the expense directly; related splits are handled in the backend
      const { error: expenseError } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId);
      if (expenseError) throw expenseError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group_expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["payables"] });
      toast({ title: "Expense deleted" });
    },
    onError: (error: Error) => {
      console.error("Expense delete error:", error);
      toast({
        title: "Error deleting expense",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });
  // onSubmit logic moved to dialog component

  const handleShare = async () => {
    if (!group?.invite_code) return;
    const text = `Join my group "${group.name}" on SplitStuff! Use code: ${group.invite_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join Group", text });
      } catch (err) {
        // ignore
      }
    } else {
      navigator.clipboard.writeText(group.invite_code);
      toast({ title: "Copied to clipboard", description: "Invite code copied!" });
    }
  };

  const handleDissolveGroup = async () => {
    if (!group || group.created_by !== user?.id) return;

    try {
      // Delete all expenses in the group first (due to foreign key constraints)
      const { error: expensesError } = await supabase
        .from('expenses')
        .delete()
        .eq('group_id', group.id);

      if (expensesError) throw expensesError;

      // Delete all group members
      const { error: membersError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id);

      if (membersError) throw membersError;

      // Finally delete the group
      const { error: groupError } = await supabase
        .from('groups')
        .delete()
        .eq('id', group.id);

      if (groupError) throw groupError;

      toast({
        title: "Group dissolved",
        description: `The group "${group.name}" has been dissolved successfully.`
      });

      // Navigate back to home
      navigate('/');

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['groups'] });

    } catch (error) {
      console.error('Error dissolving group:', error);
      toast({
        title: "Error dissolving group",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const handleRemoveMember = (memberId: string) => {
    if (!group || group.created_by !== user?.id || memberId === group.created_by) return;

    // Only set the member to remove so the confirmation dialog can show
    setMemberToRemove(memberId);
  };

  const confirmRemoveMember = async () => {
    if (!group || !memberToRemove || group.created_by !== user?.id || memberToRemove === group.created_by) return;

    try {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", memberToRemove);

      if (error) throw error;

      toast({
        title: "Member removed",
        description: "Member has been removed from the group successfully.",
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["group_members", groupId] });

      // Close the dialog
      setMemberToRemove(null);
    } catch (error: any) {
      console.error("Error removing member:", error);
      toast({
        title: "Error removing member",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleLeaveGroup = async () => {
    if (!group || !user) return;

    try {
      // If the user is the group creator, they cannot leave - they must dissolve the group
      if (group.created_by === user.id) {
        toast({
          title: "Cannot leave group",
          description: "As the group creator, you must dissolve the group instead of leaving it.",
          variant: "destructive"
        });
        return;
      }

      // Delete the user from the group
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Left group",
        description: "You have left the group successfully."
      });

      // Navigate back to home
      navigate('/');

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['groups'] });

    } catch (error) {
      console.error('Error leaving group:', error);
      toast({
        title: "Error leaving group",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const getMemberName = (id: string) => {
    return members?.find((m) => m.id === id)?.name || "Unknown";
  };

  if (isGroupLoading || isMembersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">Group not found</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md min-h-screen bg-deep-black overflow-hidden flex flex-col mx-auto font-sans text-white selection:bg-brand/30">
      <div className="absolute top-0 left-0 right-0 h-[400px] z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top center, rgba(255, 77, 45, 0.15) 0%, transparent 70%)' }}></div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[rgba(28,28,30,0.7)] backdrop-blur-[20px] px-6 py-4 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => navigate("/")}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 active:scale-90 transition-transform hover:bg-white/10"
        >
          <span className="material-symbols-outlined text-white text-[20px]">arrow_back_ios_new</span>
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-lg font-bold tracking-tight">{group.name}</h1>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse"></span>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Group Details</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 active:scale-90 transition-transform hover:bg-white/10">
              <span className="material-symbols-outlined text-white text-[24px]">more_horiz</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-charcoal border-white/10 text-white">
            <DropdownMenuItem
              onClick={() => setShowInviteDialog(true)}
              className="focus:bg-white/10 focus:text-white"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Invite Member
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowMembers(!showMembers)}
              className="focus:bg-white/10 focus:text-white"
            >
              <User className="h-4 w-4 mr-2" />
              {showMembers ? 'Hide Members' : 'Show Members'}
            </DropdownMenuItem>
            {group?.created_by === user?.id && (
              <DropdownMenuItem
                onClick={() => setIsDissolveDialogOpen(true)}
                className="text-red-400 focus:bg-white/5 focus:text-red-400"
              >
                <X className="h-4 w-4 mr-2" />
                Dissolve Group
              </DropdownMenuItem>
            )}
            {user?.id !== group?.created_by && (
              <DropdownMenuItem
                onClick={() => setIsLeaveDialogOpen(true)}
                className="text-red-400 focus:bg-white/5 focus:text-red-400"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Leave Group
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative z-10 pb-32">
        <section className="px-6 py-6">
          <div className="bg-charcoal/50 border border-white/5 rounded-[28px] p-4 flex items-center gap-4 backdrop-blur-sm">
            <div className="flex -space-x-3 overflow-hidden pl-1">
              {members && members.length > 0 ? (
                members.slice(0, 5).map((member) => (
                  <div key={member.id} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border-2 border-deep-black text-[11px] font-bold text-white relative">
                    {member.avatar_url ? (
                      <AvatarImage src={member.avatar_url} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className={`w-full h-full rounded-full flex items-center justify-center ${['bg-indigo-500/20 text-indigo-400', 'bg-rose-500/20 text-rose-400', 'bg-emerald-500/20 text-emerald-400'][Math.abs(member.name.length) % 3]}`}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))
              ) : null}
              <button onClick={() => setShowInviteDialog(true)} className="w-10 h-10 rounded-full bg-brand flex items-center justify-center border-2 border-deep-black text-white hover:bg-brand/90 transition-colors z-10">
                <span className="material-symbols-outlined text-[16px] font-bold">add</span>
              </button>
            </div>
            <div className="h-8 w-px bg-white/10"></div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Group Size</span>
              <span className="text-sm font-bold text-white">{members?.length || 0} Members</span>
            </div>
          </div>
        </section>

        {showMembers && (
          <div className="px-6 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-charcoal p-4 rounded-[20px] border border-white/5 grid grid-cols-4 gap-4">
              {members?.map(member => (
                <div key={member.id} className="flex flex-col items-center gap-2 relative">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold relative">
                    {member.name.charAt(0)}
                    {member.id === group.created_by && <span className="absolute -top-1 -right-1 w-3 h-3 bg-brand rounded-full border-2 border-charcoal"></span>}
                  </div>
                  <span className="text-[9px] text-white/60 truncate w-full text-center">{member.name.split(' ')[0]}</span>
                  {group.created_by === user?.id && member.id !== user?.id && (
                    <button onClick={() => handleRemoveMember(member.id)} className="absolute -top-1 -right-1 bg-red-500/20 text-red-500 rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-6 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-[11px] font-bold text-white/30 uppercase tracking-[0.2em]">Recent Activity</h2>
            <button className="text-[11px] font-bold text-brand uppercase tracking-wider">Filter</button>
          </div>

          {isExpensesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-[24px] bg-charcoal" />)}
            </div>
          ) : expenses && expenses.length > 0 ? (
            expenses.map((expense) => {
              // Calculate logic
              const userSplit = expense.expense_splits?.find(s => s.user_id === user?.id);
              const isPayer = expense.paid_by === user?.id;

              const statusStyles = isPayer
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-rose-400 bg-rose-400/10 border-rose-400/20";

              // Determine icon based on title (simple heuristic)
              const title = expense.title.toLowerCase();
              let icon = "receipt";
              if (title.includes("food") || title.includes("lunch") || title.includes("dinner")) icon = "restaurant";
              else if (title.includes("transport") || title.includes("taxi") || title.includes("uber")) icon = "local_taxi";
              else if (title.includes("shopping") || title.includes("grocery")) icon = "shopping_bag";
              else if (title.includes("movie") || title.includes("entertainment")) icon = "movie";

              let amountDisplay = "";
              let labelDisplay = "";

              if (isPayer) {
                const lentAmount = expense.expense_splits?.reduce((acc, split) => split.user_id !== user?.id ? acc + split.share_amount : acc, 0) || 0;
                amountDisplay = currency.format(lentAmount);
                labelDisplay = "You get";
              } else {
                amountDisplay = currency.format(userSplit?.share_amount || 0);
                labelDisplay = "You owe";
              }

              return (
                <div
                  key={expense.id}
                  className="bg-charcoal p-5 rounded-[24px] flex items-center gap-4 border border-white/5 active:scale-[0.98] transition-all cursor-pointer hover:border-white/10"
                  onClick={() => setSelectedExpense(expense)}
                >
                  <div className="w-14 h-14 bg-white/5 rounded-[20px] flex items-center justify-center text-white/70">
                    <span className="material-symbols-outlined text-2xl">{icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[15px] text-white truncate">{expense.title}</h3>
                    <p className="text-xs text-white/40 mt-0.5">Paid by <span className="text-white/70">{expense.paid_by === user?.id ? "You" : getMemberName(expense.paid_by)}</span></p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className={`px-2 py-0.5 rounded-md border ${statusStyles}`}>
                      <p className="text-[10px] font-bold uppercase tracking-tighter leading-none">{labelDisplay}</p>
                    </div>
                    <p className="text-lg font-bold text-white leading-none">{amountDisplay}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 opacity-50">
              <p className="text-sm">No expenses yet.</p>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-28 right-6 z-50">
        <button
          onClick={() => setIsAddExpenseOpen(true)}
          className="bg-brand w-16 h-16 rounded-full shadow-2xl shadow-brand/40 flex items-center justify-center active:scale-90 transition-transform hover:bg-brand/90"
        >
          <span className="material-symbols-outlined text-white text-[32px] font-bold">add</span>
        </button>
      </div>



      {/* Keeping existing Dialogs functionality with updated styles where possible or just hiding styling details for now */}
      <AddExpenseDialog
        open={isAddExpenseOpen}
        onOpenChange={setIsAddExpenseOpen}
        groupId={groupId || ""}
        groupName={group?.name || ""}
      />

      {/* Invite Dialog */}
      <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <AlertDialogContent className="bg-charcoal border-white/10 text-white rounded-[24px]">
          {/* Styled Invite Content */}
          <div className="flex flex-col items-center gap-4 text-center py-4">
            <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center text-brand mb-2">
              <Share2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold">Invite Friends</h3>
            <p className="text-sm text-white/50">Share this code with your friends to join <strong>{group.name}</strong></p>
            <div className="w-full bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col items-center gap-2 mt-2">
              <p className="text-[10px] font-bold text-brand uppercase tracking-widest">Group Code</p>
              <p className="text-3xl font-mono font-bold tracking-widest">{group.invite_code}</p>
            </div>
            <Button onClick={() => { navigator.clipboard.writeText(group.invite_code); toast({ title: "Copied!" }); }} className="w-full bg-brand hover:bg-brand/90 rounded-xl h-12 mt-2">
              Copy Invite Code
            </Button>
          </div>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel className="bg-transparent border-none text-white/40 hover:text-white hover:bg-transparent">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Other Utils Dialogs (Leave, Dissolve, Delete) - Kept basic styled */}
      <AlertDialog open={isDissolveDialogOpen} onOpenChange={setIsDissolveDialogOpen}>
        <AlertDialogContent className="bg-charcoal border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Dissolve Group?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Action cannot be undone. All data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDissolveGroup}>Dissolve</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <AlertDialogContent className="bg-charcoal border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Group?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              You will lose access to this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleLeaveGroup}>Leave</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!expenseToDelete} onOpenChange={(open) => !open && setExpenseToDelete(null)}>
        <AlertDialogContent className="bg-charcoal border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => { if (expenseToDelete) deleteExpenseMutation.mutate(expenseToDelete); }}>Delete</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expense Detail View */}
      <Dialog open={!!selectedExpense} onOpenChange={(open) => !open && setSelectedExpense(null)}>
        <DialogContent className="bg-charcoal border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedExpense?.title}</DialogTitle>
            <DialogDescription className="text-white/50">{format(new Date(selectedExpense?.created_at || new Date()), "PPP")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl">
              <span className="text-white/60">Amount</span>
              <span className="text-2xl font-bold text-white">{currency.format(selectedExpense?.amount || 0)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Paid by</span>
              <span className="font-bold">{getMemberName(selectedExpense?.paid_by || "")}</span>
            </div>
            {selectedExpense?.paid_by === user?.id && (
              <Button variant="destructive" className="w-full" onClick={() => { setExpenseToDelete(selectedExpense?.id || null); setSelectedExpense(null); }}>
                Delete Expense
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>


    </div >
  );
};

export default GroupPage;