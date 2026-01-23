import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { AddPersonalExpenseSheet } from "@/components/expenses/AddPersonalExpenseSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
});

const CATEGORY_ICONS: Record<string, { material: string; emoji: string }> = {
    Food: { material: "local_cafe", emoji: "🍔" },
    Transport: { material: "directions_subway", emoji: "🚗" },
    Shop: { material: "shopping_cart", emoji: "🛍️" },
    Bills: { material: "description", emoji: "🧾" },
    Work: { material: "work", emoji: "💼" },
    Health: { material: "fitness_center", emoji: "💊" },
    Travel: { material: "flight", emoji: "✈️" },
    Fun: { material: "movie", emoji: "🍿" },
    Misc: { material: "chat", emoji: "💬" },
    Other: { material: "category", emoji: "❓" },
};

const PersonalTracking = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

    const { data: expenses, isLoading } = useQuery({
        queryKey: ["individual-expenses", user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from("individual_expenses")
                .select("*")
                .eq("user_id", user.id)
                .order("date", { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const deleteExpenseMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("individual_expenses")
                .delete()
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["individual-expenses"] });
            queryClient.invalidateQueries({ queryKey: ["personal-insights"] });
            toast({ title: "Deleted", description: "Expense removed successfully." });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    const totalSpent = useMemo(() => {
        if (!expenses) return 0;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        return expenses
            .filter((e: any) => {
                const d = new Date(e.date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
    }, [expenses]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#0b0b0e]">
                <p className="text-white/50 text-sm font-bold uppercase tracking-[0.2em] animate-pulse">SplitStuff</p>
            </div>
        );
    }

    if (!user) {
        navigate("/auth");
        return null;
    }

    return (
        <div className="relative flex h-screen max-w-md mx-auto flex-col bg-background-light dark:bg-background-dark overflow-hidden border-x border-white/5 font-display text-white selection:bg-primary/30 transition-colors duration-300">
            {/* Header */}
            <header className="flex items-center px-6 pt-8 pb-4 justify-between bg-background-light dark:bg-background-dark">
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Personal Tracking</h2>
                    <p className="text-slate-500 dark:text-[#c89f93] text-sm font-light">Manage your own wallet</p>
                </div>
                <div onClick={() => navigate("/profile")} className="size-10 rounded-full bg-card-dark border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-transform">
                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}')` }}></div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-24 no-scrollbar">
                {/* Summary Card */}
                <div className="mt-4 @container">
                    <div className="flex flex-col items-center justify-center rounded-xl p-8 bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-white/5 summary-card-glow relative overflow-hidden shadow-sm">
                        <div className="absolute -top-12 -right-12 size-32 bg-primary/10 rounded-full blur-3xl"></div>
                        <p className="text-slate-500 dark:text-[#c89f93] text-sm font-medium mb-2 uppercase tracking-widest">Total Spent</p>
                        <p className="text-slate-900 dark:text-primary text-5xl font-black tracking-tight mb-6">
                            {currency.format(totalSpent)}
                        </p>
                        <button
                            onClick={() => navigate("/insights")}
                            className="flex min-w-[140px] cursor-pointer items-center justify-center rounded-full border-2 border-primary/40 hover:border-primary transition-colors h-10 px-6 bg-transparent text-primary text-sm font-bold tracking-wide active:scale-95"
                        >
                            <span className="truncate uppercase font-black tracking-tighter">VIEW INSIGHTS</span>
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="mt-8 mb-6">
                    <div className="relative group">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                        <input
                            className="w-full bg-slate-100 dark:bg-card-dark border-transparent focus:border-primary/50 focus:ring-0 rounded-xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 text-sm transition-all"
                            placeholder="Search expenses..."
                            type="text"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-900 dark:text-white text-lg font-bold">Recent Expenses</h3>
                    <span className="text-xs text-primary font-bold px-2 py-1 bg-primary/10 rounded">THIS MONTH</span>
                </div>

                {/* Expense List */}
                <div className="flex flex-col gap-3">
                    {isLoading ? (
                        Array(4).fill(0).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 bg-slate-50 dark:bg-card-dark/60 border border-slate-100 dark:border-white/5 p-4 rounded-xl">
                                <Skeleton className="size-12 rounded-lg bg-slate-200 dark:bg-white/5" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-32 bg-slate-200 dark:bg-white/5" />
                                    <Skeleton className="h-3 w-24 bg-slate-200 dark:bg-white/5" />
                                </div>
                                <Skeleton className="h-5 w-16 bg-slate-200 dark:bg-white/5" />
                            </div>
                        ))
                    ) : expenses && expenses.length > 0 ? (
                        expenses.slice(0, 5).map((expense: any) => (
                            <div
                                key={expense.id}
                                className="flex items-center gap-4 bg-slate-50 dark:bg-card-dark/60 border border-slate-100 dark:border-white/5 p-4 rounded-xl hover:bg-slate-100 dark:hover:bg-card-dark transition-colors group relative"
                            >
                                <div className="bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center rounded-lg shrink-0 size-12 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined">
                                        {CATEGORY_ICONS[expense.category]?.material || "shopping_cart"}
                                    </span>
                                </div>
                                <div className="flex flex-col justify-center flex-1">
                                    <p className="text-slate-900 dark:text-white text-base font-bold leading-none mb-1 truncate max-w-[150px]">
                                        {expense.title || expense.category}
                                    </p>
                                    <p className="text-slate-500 dark:text-[#c89f93] text-xs font-normal">
                                        {new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="text-right flex items-center gap-3">
                                    <p className="text-slate-900 dark:text-white text-base font-black">
                                        {currency.format(expense.amount)}
                                    </p>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteExpenseMutation.mutate(expense.id);
                                        }}
                                        className="size-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="size-16 bg-slate-100 dark:bg-card-dark rounded-full flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-slate-300 dark:text-white/10 text-3xl">receipt_long</span>
                            </div>
                            <p className="text-slate-500 text-sm">No expenses recorded yet.</p>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => navigate("/tracking/history")}
                    className="w-full mt-6 py-4 flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-white/5 hover:border-primary/50 transition-colors group active:scale-[0.98]"
                >
                    <span className="text-slate-600 dark:text-[#c89f93] text-sm font-bold tracking-wide uppercase">View All Expenses</span>
                    <span className="material-symbols-outlined text-sm text-primary group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
            </main>

            {/* Floating Action Button */}
            <button
                onClick={() => setIsAddSheetOpen(true)}
                className="absolute bottom-32 right-6 size-14 bg-primary text-white rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform z-40"
            >
                <span className="material-symbols-outlined scale-125">add</span>
            </button>

            <MobileBottomNav />
            <AddPersonalExpenseSheet open={isAddSheetOpen} onOpenChange={setIsAddSheetOpen} />
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-900 dark:bg-white/20 rounded-full z-[60]"></div>
        </div>
    );
};

export default PersonalTracking;
