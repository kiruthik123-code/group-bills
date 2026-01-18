import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const expenseSchema = z.object({
    title: z.string().min(1, "Title is required"),
    amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
        message: "Amount must be greater than 0",
    }),
    paidBy: z.string().min(1, "Please select who paid"),
    splitType: z.enum(["equal", "custom"], { message: "Please select a split type" }),
    description: z
        .string()
        .trim()
        .max(35, "Description must be 35 characters or less")
        .optional(),
});

type GroupMember = {
    id: string;
    name: string;
    avatar_url: string | null;
};

interface AddExpenseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groupId: string;
    groupName: string;
}

export const AddExpenseDialog = ({ open, onOpenChange, groupId, groupName }: AddExpenseDialogProps) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});

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

    // Reset form when open state or groupId changes
    useEffect(() => {
        if (open) {
            form.reset({
                title: "",
                amount: "",
                paidBy: user?.id || "",
                splitType: "equal",
                description: "",
            });
        }
    }, [open, groupId, user?.id, form]);

    // Fetch group members
    const { data: members, isLoading: isMembersLoading } = useQuery<GroupMember[]>({
        queryKey: ["group_members", groupId],
        queryFn: async () => {
            const { data: memberData, error: memberError } = await supabase
                .from("group_members")
                .select("user_id")
                .eq("group_id", groupId);

            if (memberError) throw memberError;
            const userIds = memberData?.map((m) => m.user_id) || [];
            if (userIds.length === 0) return [];

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
        enabled: !!groupId && open,
    });

    useEffect(() => {
        if (members && members.length > 0) {
            const initialSplits: Record<string, string> = {};
            members.forEach((member) => {
                initialSplits[member.id] = "";
            });
            setCustomSplits(initialSplits);
        }
    }, [members]);

    const createExpenseMutation = useMutation({
        mutationFn: async (values: z.infer<typeof expenseSchema>) => {
            if (!groupId || !user || !members) throw new Error("Missing data");
            const amount = parseFloat(values.amount);

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
                .single();

            if (!expenseData) throw new Error("Failed to create expense");
            if (expenseError) throw expenseError;

            let splits;
            if (values.splitType === "equal") {
                const splitAmount = amount / members.length;
                splits = members.map((member) => ({
                    expense_id: expenseData.id,
                    user_id: member.id,
                    share_amount: splitAmount,
                }));
            } else {
                splits = members.map((member) => {
                    const percentage = parseFloat(customSplits[member.id] || "0");
                    const shareAmount = (amount * percentage) / 100;
                    return {
                        expense_id: expenseData.id,
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
            queryClient.invalidateQueries({ queryKey: ["balances"] });
            queryClient.invalidateQueries({ queryKey: ["payables"] });
            queryClient.invalidateQueries({ queryKey: ["group-balances-list"] });
            onOpenChange(false);
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
        if (values.splitType === "custom" && members) {
            const totalPercentage = members.reduce((sum, member) => {
                const percentage = parseFloat(customSplits[member.id] || "0");
                return sum + (isNaN(percentage) ? 0 : percentage);
            }, 0);

            if (Math.abs(totalPercentage - 100) > 0.01) {
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-charcoal border-white/5 text-white">
                <DialogHeader>
                    <DialogTitle className="text-center">
                        You are adding an expense to <span className="text-brand">‘{groupName}’</span>
                    </DialogTitle>
                    <DialogDescription className="text-white/50 text-center">
                        Split a bill equally with everyone in the group.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em]">Expense Title</FormLabel>
                                    <FormControl>
                                        <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl h-12" placeholder="Dinner, Taxi..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em]">Amount (₹)</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg">₹</span>
                                            <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pl-10 h-14 text-2xl font-bold rounded-xl" placeholder="0.00" type="number" step="0.01" {...field} />
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="paidBy"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em]">Paid By</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                                                    <SelectValue placeholder="Who paid" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-charcoal border-white/10 text-white">
                                                {members?.map((member) => (
                                                    <SelectItem key={member.id} value={member.id} className="focus:bg-white/10 focus:text-white">
                                                        {member.name} {member.id === user?.id ? "(You)" : ""}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="splitType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em]">Split</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                                                    <SelectValue placeholder="Split Type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-charcoal border-white/10 text-white">
                                                <SelectItem value="equal" className="focus:bg-white/10 focus:text-white">Equal Split</SelectItem>
                                                <SelectItem value="custom" className="focus:bg-white/10 focus:text-white">Custom Split</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em]">Note (Optional)</FormLabel>
                                    <FormControl>
                                        <textarea className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 text-sm h-20 resize-none focus:outline-none focus:border-brand" placeholder="Add details..." {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        {form.watch("splitType") === "custom" && (
                            <div className="space-y-3 pt-2 bg-white/5 p-4 rounded-xl border border-white/10">
                                <FormLabel className="text-xs text-white/60">Custom Splits (%)</FormLabel>
                                {members?.map((member) => (
                                    <div key={member.id} className="flex items-center gap-2">
                                        <p className="text-sm font-medium truncate flex-1">{member.name}</p>
                                        <Input
                                            type="number"
                                            className="w-20 bg-black/20 border-white/10 h-9"
                                            value={customSplits[member.id] || ""}
                                            onChange={(e) => setCustomSplits({ ...customSplits, [member.id]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <DialogFooter className="flex-col sm:flex-row gap-3">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-white/50 hover:text-white hover:bg-white/10">
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-brand hover:bg-brand/90 text-white rounded-xl h-12 flex-1" disabled={createExpenseMutation.isPending || isMembersLoading}>
                                {createExpenseMutation.isPending ? "Saving..." : "Save Expense"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
