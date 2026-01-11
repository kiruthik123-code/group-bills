import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Share2, Receipt, Calendar, User, Loader2, MoreHorizontal, LogOut } from "lucide-react";
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

const expenseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Amount must be greater than 0",
  }),
  paidBy: z.string().min(1, "Please select who paid"),
  splitType: z.enum(["equal", "custom"], { message: "Please select a split type" }),
  description: z.string().max(100, "Description must be 100 characters or less").optional(),
});

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

type GroupMember = {
  id: string;
  name: string;
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
  const [showMembers, setShowMembers] = useState(false); // Start with members hidden by default

  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      title: "",
      amount: "",
      paidBy: user?.id || "",
      splitType: "equal",
      description: "",
    },
  });
  
  // State for custom split percentages
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});

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

      const profileMap = new Map(profilesData?.map((p: { id: string; full_name: string }) => [p.id, p]));

      return userIds.map(userId => {
        const profile = profileMap.get(userId);
        return {
          id: userId,
          name: profile?.full_name || "Unknown Member",
        } as GroupMember;
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
  
  // Initialize custom splits when members change
  useEffect(() => {
    if (members && members.length > 0) {
      const initialSplits: Record<string, string> = {};
      members.forEach(member => {
        initialSplits[member.id] = "";
      });
      setCustomSplits(initialSplits);
    }
  }, [members]);

  // Need to correct the profiles relationship in the query above if it fails,
  // but looking at types.ts, `paid_by` is a foreign key to `profiles` (implicitly via user_id uuid matching, but not explicitly defined as FK to profiles table in types definition shown). 
  // Actually types.ts shows NO foreign key from expenses.paid_by to profiles.
  // It only shows foreign keys to groups. 
  // So we need to manually fetch profile names or use a different strategy.

  // Refined member fetching (already done). Using `members` map for names is safer.

  const createExpenseMutation = useMutation({
    mutationFn: async (values: z.infer<typeof expenseSchema>) => {
      if (!groupId || !user || !members) throw new Error("Missing data");

      const amount = parseFloat(values.amount);
      
      // 1. Create expense
      // Note: created_by_user_id column may not exist in remote DB yet
      // The migration needs to be applied to the remote database
      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .insert({
          group_id: groupId,
          title: values.title,
          amount: amount,
          paid_by: values.paidBy,
          notes: values.description?.trim() || null,
        })
        .select("id")
        .single() as { data: { id: string } | null; error: any; };

      if (!expenseData) throw new Error('Failed to create expense');

      if (expenseError) throw expenseError;

      // 2. Create splits based on split type
      let splits;
      if (values.splitType === "equal") {
        const splitAmount = amount / members.length;
        splits = members.map((member) => ({
          expense_id: expenseData!.id,
          user_id: member.id,
          share_amount: splitAmount,
        }));
      } else { // custom split
        splits = members.map((member) => {
          const percentage = parseFloat(customSplits[member.id] || "0");
          const shareAmount = (amount * percentage) / 100;
          return {
            expense_id: expenseData!.id,
            user_id: member.id,
            share_amount: shareAmount,
          };
        });
      }

      const { error: splitError } = await supabase.from("expense_splits").insert(splits);
      if (splitError) throw splitError;

      return expenseData;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["group_expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["balances"] }); // Update home balances
      queryClient.invalidateQueries({ queryKey: ["payables"] });
      setIsAddExpenseOpen(false);
      form.reset();
      
      const splitTypeText = variables.splitType === "equal" ? "equally" : "with custom percentages";
      toast({ title: "Expense added", description: `Split ${splitTypeText} among all members.` });
    },
    onError: (error: Error) => {
      console.error("Expense creation error:", error);
      toast({
        title: "Error adding expense",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof expenseSchema>) => {
    // Validate custom split percentages if custom split is selected
    if (values.splitType === "custom" && members) {
      const totalPercentage = members.reduce((sum, member) => {
        const percentage = parseFloat(customSplits[member.id] || "0");
        return sum + (isNaN(percentage) ? 0 : percentage);
      }, 0);
      
      if (Math.abs(totalPercentage - 100) > 0.01) { // Allow small floating point differences
        toast({
          title: "Invalid split percentages",
          description: `Custom split percentages must add up to 100%. Current total: ${totalPercentage}%`,
          variant: "destructive",
        });
        return;
      }
    }
    
    createExpenseMutation.mutate(values);
  };

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))]">
      <div className="mx-auto flex max-w-md flex-col pb-20">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between bg-white/50 px-4 py-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 h-9 w-9 rounded-full"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold text-foreground leading-tight">{group.name}</h1>
              <span className="text-xs text-muted-foreground">
                {members?.length} members
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-full"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setShowInviteDialog(true)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Invite
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowMembers(!showMembers)}
                >
                  <User className="h-4 w-4 mr-2" />
                  {showMembers ? 'Hide Members' : 'Show Members'}
                </DropdownMenuItem>
                {group?.created_by === user?.id && (
                  <DropdownMenuItem
                    onClick={() => setIsDissolveDialogOpen(true)}
                    className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Dissolve Group
                  </DropdownMenuItem>
                )}
                {user?.id !== group?.created_by && (
                  <DropdownMenuItem
                    onClick={() => setIsLeaveDialogOpen(true)}
                    className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave Group
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Dissolve Group Dialog */}
        <AlertDialog open={isDissolveDialogOpen} onOpenChange={setIsDissolveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to dissolve this group?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will permanently delete the group and all its expenses. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDissolveGroup}
              >
                Dissolve Group
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Leave Group Dialog */}
        <AlertDialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to leave this group?</AlertDialogTitle>
              <AlertDialogDescription>
                You will no longer have access to this group and its expenses.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleLeaveGroup}
              >
                Leave Group
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Remove Member Dialog */}
        <AlertDialog 
          open={!!memberToRemove} 
          onOpenChange={(open) => !open && setMemberToRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to remove this member?</AlertDialogTitle>
              <AlertDialogDescription>
                This member will no longer have access to this group and its expenses.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={confirmRemoveMember}
                disabled={!memberToRemove}
              >
                Remove Member
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Members List */}
        {showMembers && (
          <div className="p-4 border-b bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Group Members ({members?.length || 0})
            </h2>
            <div className="space-y-2">
              {members && members.length > 0 ? (
                members.map((member) => (
                  <div 
                    key={member.id} 
                    className={`flex items-center justify-between p-3 rounded-lg ${member.id === group?.created_by ? 'bg-primary/10 border border-primary/20' : 'bg-white/80'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <span className="text-sm font-medium">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{member.name}</p>
                        {member.id === group?.created_by && (
                          <p className="text-xs text-primary font-medium">Group Creator</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.id === user?.id && (
                        <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                          You
                        </span>
                      )}
                      {group?.created_by === user?.id && member.id !== user?.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <span className="sr-only">Remove member</span>
                          ×
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No members in this group</p>
              )}
            </div>
          </div>
        )}

        {/* Expenses List */}
        <div className="p-4 space-y-4">
          {isExpensesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : expenses && expenses.length > 0 ? (
            expenses.map((expense) => {
              const description = expense.notes?.trim() || "";
              const maxPreviewLength = 80;
              const isLongDescription = description.length > maxPreviewLength;
              const previewText = isLongDescription
                ? description.slice(0, maxPreviewLength) + "…"
                : description;

              return (
                <Card key={expense.id} className="p-4 rounded-2xl border-0 shadow-sm bg-white/80 backdrop-blur transition-all hover:scale-[1.01]">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{expense.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{getMemberName(expense.paid_by)}</span> paid {currency.format(expense.amount)}
                        </p>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(expense.created_at), "MMM d, yyyy")}</span>
                        </div>
                        {description && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                   <p className="cursor-default w-full max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                                     {previewText}
                                   </p>
                                 </TooltipTrigger>
                                {isLongDescription && (
                                  <TooltipContent className="max-w-xs text-xs">
                                    <p className="whitespace-pre-wrap break-words">{description}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {expense.paid_by === user?.id ? (
                        <>
                          <p className="font-medium text-emerald-600">
                            You get
                          </p>
                          <p className="font-bold text-emerald-600">
                            {currency.format(expense.expense_splits?.reduce((total, split) => {
                              if (split.user_id !== user?.id) {
                                return total + split.share_amount;
                              }
                              return total;
                            }, 0) || 0)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-destructive">
                            You owe
                          </p>
                          <p className="font-bold text-destructive">
                            {currency.format(expense.expense_splits?.find(split => split.user_id === user?.id)?.share_amount || 0)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <Receipt className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No expenses yet</h3>
              <p className="text-sm text-muted-foreground max-w-[200px]">
                Add an expense to start splitting bills with your group.
              </p>
            </div>
          )}
        </div>

        {/* FAB */}
        <div className="fixed bottom-6 right-6 z-20">
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-xl shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
            onClick={() => setIsAddExpenseOpen(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>

        {/* Add Expense Dialog */}
        <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Expense</DialogTitle>
              <DialogDescription>
                Split a bill equally with everyone in the group.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Dinner, Taxi, Groceries..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => {
                    const currentLength = field.value?.length ?? 0;
                    const maxLength = 100;

                    return (
                      <FormItem>
                        <FormLabel className="flex items-center justify-between">
                          <span>Description</span>
                          <span className="text-xs font-normal text-muted-foreground">Optional</span>
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-1">
                            <textarea
                              className="flex min-h-[60px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder="Add a note about this expense (optional)"
                              maxLength={maxLength}
                              {...field}
                            />
                            <div className="flex justify-end text-xs text-muted-foreground">
                              {currentLength}/{maxLength}
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
                          <Input className="pl-7" placeholder="0.00" type="number" step="0.01" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paidBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paid By</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select who paid" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {!members || members.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              No members found.
                            </div>
                          ) : (
                            members.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.name} {member.id === user?.id ? "(You)" : ""}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="splitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Split Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select split type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="equal">Equal Split</SelectItem>
                          <SelectItem value="custom">Custom Split</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Custom Split Inputs - only show when custom split is selected */}
                {form.watch("splitType") === "custom" && (
                  <div className="space-y-3 pt-2">
                    <FormLabel>Custom Split Percentages</FormLabel>
                    {members?.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                        </div>
                        <div className="relative w-20">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0"
                            value={customSplits[member.id] || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setCustomSplits(prev => ({
                                ...prev,
                                [member.id]: value
                              }));
                            }}
                            className="pl-6 pr-2 py-1.5 text-sm"
                          />
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddExpenseOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createExpenseMutation.isPending}>
                    {createExpenseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Expense
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Invite Members Dialog */}
        <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Invite Members to {group?.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Share this invite code with others to join your group.
              </AlertDialogDescription>
              <div className="flex items-center space-x-2">
                <Input 
                  value={group?.invite_code || ""} 
                  readOnly 
                  className="font-mono text-center"
                />
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(group?.invite_code || "");
                    toast({
                      title: "Copied to clipboard",
                      description: "Invite code copied to clipboard!"
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  Copy
                </Button>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default GroupPage;