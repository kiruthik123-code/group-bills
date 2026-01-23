import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface AddPersonalExpenseSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
    { id: "Food", label: "FOOD", materialIcon: "restaurant" },
    { id: "Transport", label: "TRANSPORT", materialIcon: "directions_car" },
    { id: "Shop", label: "SHOP", materialIcon: "shopping_bag" },
    { id: "Bills", label: "BILLS", materialIcon: "receipt" },
    { id: "Fun", label: "FUN", materialIcon: "movie" },
    { id: "Health", label: "HEALTH", materialIcon: "monitor_heart" },
    { id: "Grocery", label: "GROCERY", materialIcon: "shopping_cart" },
    { id: "Travel", label: "TRAVEL", materialIcon: "flight" },
    { id: "Other", label: "OTHER", materialIcon: "more_horiz" },
];

export const AddPersonalExpenseSheet = ({ open, onOpenChange }: AddPersonalExpenseSheetProps) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [amount, setAmount] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("Food");
    const [note, setNote] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

    const addExpenseMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("User not authenticated");
            if (!amount || isNaN(parseFloat(amount))) throw new Error("Please enter a valid amount");

            const expenseData = {
                user_id: user.id,
                amount: parseFloat(amount),
                category: selectedCategory,
                title: note || selectedCategory,
                description: note || null,
                date: date,
            };

            console.log("Adding expense:", expenseData);

            // Get the session token
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No active session");

            // Use direct REST API to bypass schema cache completely
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/individual_expenses`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                        'Authorization': `Bearer ${session.access_token}`,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(expenseData)
                }
            );

            if (!response.ok) {
                const error = await response.json();
                console.error("REST API Error:", error);
                throw new Error(error.message || 'Failed to add expense');
            }

            const data = await response.json();
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["individual-expenses"] });
            queryClient.invalidateQueries({ queryKey: ["personal-insights"] });

            // Show custom success toast like in attachment
            toast({
                title: "🎉 Expense added successfully!",
                className: "bg-surface-dark border-primary/20 text-white rounded-full mx-auto w-fit",
            });

            onOpenChange(false);
            resetForm();
        },
        onError: (error: any) => {
            console.error("Supabase Insertion Error Full Object:", error);
            const errorMsg = error.message || (error as any).error_description || "Unknown database error";
            toast({
                title: "Error adding expense",
                description: `${errorMsg}. Please ensure the 'individual_expenses' table exists in your Supabase project.`,
                variant: "destructive",
            });
        },
    });

    const resetForm = () => {
        setAmount("");
        setSelectedCategory("Food");
        setNote("");
        setDate(new Date().toISOString().split("T")[0]);
    };

    const handleAddExpense = () => {
        if (!amount) return;
        addExpenseMutation.mutate();
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="p-0 bg-[#1A1C1F] border-t border-white/5 rounded-t-[3rem] h-[92vh] overflow-hidden flex flex-col outline-none shadow-[0_-20px_60px_rgba(0,0,0,0.6)] max-w-md mx-auto left-0 right-0"
            >
                {/* Mobile Handle */}
                <div className="flex justify-center pt-4 pb-1 shrink-0">
                    <div className="h-1.5 w-12 rounded-full bg-white/10"></div>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-4 shrink-0">
                    <button
                        onClick={() => onOpenChange(false)}
                        className="text-white/30 hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                    <div className="text-center">
                        <h4 className="text-white text-[14px] font-black uppercase tracking-[0.3em]">Just Expense</h4>
                        <p className="text-white/20 text-[10px] font-bold mt-0.5">Quickly log a personal expense</p>
                    </div>
                    <button
                        onClick={handleAddExpense}
                        disabled={addExpenseMutation.isPending || !amount}
                        className="text-[#E8552C] font-black text-sm uppercase tracking-widest hover:opacity-80 transition-opacity disabled:opacity-20"
                    >
                        {addExpenseMutation.isPending ? '...' : 'Save'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-8 pb-32 no-scrollbar">
                    {/* Amount Input */}
                    <div className="flex flex-col items-center py-10 relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-40 bg-primary/5 rounded-full blur-3xl -z-10"></div>
                        <p className="text-[#E8552C]/60 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Amount</p>
                        <div className="flex items-center gap-2">
                            <span className="text-[#E8552C] text-3xl font-black mb-2">₹</span>
                            <input
                                autoFocus
                                type="number"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-transparent border-none p-0 text-white text-7xl font-black tracking-tighter focus:ring-0 w-56 text-center placeholder:text-white/5"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Category Grid - 3x3 as in image */}
                    <div className="grid grid-cols-3 gap-4 mb-10">
                        {CATEGORIES.map((cat) => (
                            <div
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex flex-col gap-3 rounded-[1.5rem] py-6 items-center cursor-pointer transition-all border-2 ${selectedCategory === cat.id
                                    ? "bg-transparent border-[#E8552C] shadow-[0_0_20px_rgba(232,85,44,0.1)] active-ring"
                                    : "bg-white/[0.02] border-transparent grayscale opacity-30 hover:opacity-100 hover:grayscale-0"
                                    }`}
                            >
                                <div className={selectedCategory === cat.id ? "text-[#E8552C]" : "text-white"}>
                                    <span className="material-symbols-outlined text-[32px]">{cat.materialIcon}</span>
                                </div>
                                <h2 className={`text-[9px] font-black uppercase tracking-widest ${selectedCategory === cat.id ? "text-[#E8552C]" : "text-white/60"}`}>
                                    {cat.label}
                                </h2>
                            </div>
                        ))}
                    </div>

                    {/* Date/Account Row */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-white/[0.03] p-5 rounded-[1.5rem] border border-white/5 flex flex-col gap-3">
                            <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">Date</p>
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-[#E8552C]/10 flex items-center justify-center text-[#E8552C]">
                                    <span className="material-symbols-outlined text-xl">calendar_today</span>
                                </div>
                                <div className="flex flex-col">
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="bg-transparent border-none p-0 text-[13px] font-black text-white focus:ring-0 w-full [color-scheme:dark]"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white/[0.03] p-5 rounded-[1.5rem] border border-white/5 flex flex-col gap-3 opacity-50 cursor-not-allowed">
                            <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">Account</p>
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40">
                                    <span className="material-symbols-outlined text-xl">payments</span>
                                </div>
                                <span className="text-[13px] font-black text-white/40">Cash</span>
                            </div>
                        </div>
                    </div>

                    {/* Note input */}
                    <div className="bg-white/[0.03] px-6 py-5 rounded-[1.5rem] border border-white/5 mb-20 flex items-center gap-4 transition-colors focus-within:border-primary/30">
                        <span className="material-symbols-outlined text-white/20">edit_note</span>
                        <input
                            className="bg-transparent border-none p-0 text-sm font-medium focus:ring-0 placeholder-white/20 w-full text-white"
                            placeholder="Add a simple note..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </div>

                {/* Action Section */}
                <div className="absolute bottom-0 left-0 right-0 p-8 pt-4 bg-gradient-to-t from-[#1A1C1F] via-[#1A1C1F] to-transparent">
                    <button
                        onClick={handleAddExpense}
                        disabled={addExpenseMutation.isPending || !amount}
                        className="w-full bg-[#E8552C] hover:bg-[#D4441F] text-white font-black py-5 rounded-[1.5rem] shadow-[0_20px_40px_rgba(232,85,44,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        <span className="text-lg uppercase tracking-wider">Add Expense</span>
                        <span className="material-symbols-outlined text-2xl">arrow_forward</span>
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
