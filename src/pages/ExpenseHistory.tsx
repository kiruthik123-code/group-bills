import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

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

const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
});

const ExpenseHistory = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");

    const { data: expenses, isLoading } = useQuery({
        queryKey: ["individual-expenses-history", user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await (supabase as any)
                .from("individual_expenses")
                .select("*")
                .eq("user_id", user.id)
                .order("date", { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const filteredExpenses = useMemo(() => {
        if (!expenses) return [];
        return expenses.filter((e: any) =>
            (e.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            (e.category || "").toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [expenses, searchQuery]);

    const groupedExpenses = useMemo(() => {
        const groups: Record<string, any[]> = {};
        filteredExpenses.forEach((e: any) => {
            const date = new Date(e.date);
            const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!groups[monthYear]) groups[monthYear] = [];
            groups[monthYear].push(e);
        });
        return groups;
    }, [filteredExpenses]);

    return (
        <div className="relative flex h-screen max-w-md mx-auto flex-col bg-background-light dark:bg-background-dark overflow-hidden border-x border-white/5 font-display text-white selection:bg-primary/30 transition-colors duration-300">
            <header className="flex flex-col px-6 pt-6 pb-4 bg-background-light dark:bg-background-dark/95 backdrop-blur-md z-10">
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center justify-center size-10 rounded-full bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white active:scale-90 transition-transform"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Expense History</h2>
                    <div className="size-10"></div>
                </div>
                <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-4 text-slate-400">search</span>
                    <input
                        className="w-full h-12 pl-12 pr-4 bg-slate-100 dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#c89f93]/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all shadow-sm"
                        placeholder="Search merchant, category..."
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </header>

            <main className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-28 no-scrollbar">
                {isLoading ? (
                    Array(3).fill(0).map((_, i) => (
                        <div key={i} className="mt-8">
                            <Skeleton className="h-4 w-32 mb-4 bg-slate-200 dark:bg-white/5" />
                            <div className="space-y-3">
                                <Skeleton className="h-20 w-full rounded-xl bg-slate-200 dark:bg-white/5" />
                                <Skeleton className="h-20 w-full rounded-xl bg-slate-200 dark:bg-white/5" />
                            </div>
                        </div>
                    ))
                ) : Object.keys(groupedExpenses).length > 0 ? (
                    Object.entries(groupedExpenses).map(([monthYear, items]) => (
                        <section key={monthYear} className="mt-4">
                            <div className="flex items-center justify-between sticky top-0 bg-background-light dark:bg-background-dark py-3 z-[5] transition-colors duration-300">
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary">{monthYear}</h3>
                                <span className="text-[10px] text-slate-500 dark:text-[#c89f93] font-bold">{items.length} TRANSACTIONS</span>
                            </div>
                            <div className="flex flex-col gap-3 mt-2">
                                {items.map((expense: any) => (
                                    <div key={expense.id} className="flex items-center gap-4 bg-slate-50 dark:bg-card-dark/60 border border-slate-100 dark:border-white/5 p-4 rounded-xl hover:bg-slate-100 dark:hover:bg-card-dark transition-colors group">
                                        <div className="bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center rounded-lg shrink-0 size-12 group-hover:scale-105 transition-transform">
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
                                        <div className="text-right">
                                            <p className="text-slate-900 dark:text-white text-lg font-black">
                                                {currency.format(expense.amount)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="size-16 bg-slate-100 dark:bg-card-dark rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-slate-300 dark:text-white/10 text-3xl">history</span>
                        </div>
                        <p className="text-slate-500 text-sm">No transactions found match your search.</p>
                    </div>
                )}
            </main>

            <MobileBottomNav />
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-900 dark:bg-white/20 rounded-full z-10"></div>
        </div>
    );
};

export default ExpenseHistory;
