import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

const CATEGORY_ICONS: Record<string, string> = {
    Food: "restaurant",
    Transport: "directions_subway",
    Shop: "shopping_cart",
    Bills: "description",
    Work: "work",
    Health: "fitness_center",
    Travel: "flight",
    Fun: "movie",
    Misc: "chat",
    Other: "category",
};

const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
});

const Insights = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const { data: expenses, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ["individual-expenses", user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await (supabase as any)
                .from("individual_expenses")
                .select("*")
                .eq("user_id", user.id);

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const insights = useMemo(() => {
        if (!expenses || expenses.length === 0) return null;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        const currentMonthExpenses = expenses.filter((e: any) => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        const lastMonthExpenses = expenses.filter((e: any) => {
            const d = new Date(e.date);
            return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
        });

        const currentTotal = currentMonthExpenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
        const lastTotal = lastMonthExpenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);

        const percentChange = lastTotal === 0 ? 100 : ((currentTotal - lastTotal) / lastTotal) * 100;

        // Top Category
        const categoryTotals: Record<string, number> = {};
        currentMonthExpenses.forEach((e: any) => {
            categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.amount);
        });
        const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
        const topCategory = sortedCategories[0]?.[0] || "N/A";
        const topCategoryAmount = sortedCategories[0]?.[1] || 0;

        // Daily Average
        const daysElapsed = now.getDate();
        const dailyAverage = currentTotal / daysElapsed;

        // Largest Expense
        const largestExpense = currentMonthExpenses.reduce((prev: any, current: any) =>
            (Number(current.amount) > Number(prev.amount) ? current : prev),
            currentMonthExpenses[0] || { amount: 0, title: "N/A", category: "N/A" }
        );

        // Mock data for bar chart based on expenses
        const dayTotals = Array(15).fill(0).map((_, i) => {
            const day = i * 2 + 1;
            return currentMonthExpenses
                .filter((e: any) => new Date(e.date).getDate() === day)
                .reduce((sum, e) => sum + Number(e.amount), 0);
        });
        const maxDayTotal = Math.max(...dayTotals, 1);
        const chartBars = dayTotals.map(t => (t / maxDayTotal) * 100);

        return {
            currentTotal,
            lastTotal,
            percentChange,
            topCategory,
            topCategoryAmount,
            topCategoryPercent: currentTotal > 0 ? (topCategoryAmount / currentTotal) * 100 : 0,
            dailyAverage,
            largestExpense,
            currentMonthName: now.toLocaleString('default', { month: 'long' }).toUpperCase(),
            chartBars
        };
    }, [expenses]);

    if (isLoading) {
        return (
            <div className="bg-[#0b0b0e] min-h-screen text-white p-6 space-y-6">
                <header className="flex items-center gap-4">
                    <Skeleton className="size-10 rounded-full bg-white/5" />
                    <Skeleton className="h-8 w-32 bg-white/5" />
                </header>
                <Skeleton className="h-40 w-full rounded-2xl bg-white/5" />
                <div className="space-y-4">
                    <Skeleton className="h-20 w-full rounded-2xl bg-white/5" />
                    <Skeleton className="h-20 w-full rounded-2xl bg-white/5" />
                    <Skeleton className="h-20 w-full rounded-2xl bg-white/5" />
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full max-w-md min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white flex flex-col mx-auto transition-colors duration-300 selection:bg-primary/30">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 pt-6 pb-4 border-b border-transparent">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="size-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl text-gray-700 dark:text-gray-300">arrow_back</span>
                    </button>
                    <h2 className="text-lg font-bold tracking-tight">Insights</h2>
                    <button className="size-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                        <span className="material-symbols-outlined text-xl text-gray-700 dark:text-gray-300">more_horiz</span>
                    </button>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
                <div className="px-5 pt-4 pb-6">
                    <h1 className="text-3xl font-bold leading-tight tracking-tight">Understand your spending patterns</h1>
                    <p className="text-slate-500 dark:text-gray-400 mt-1 text-sm">
                        Personal financial analysis for {new Date().toLocaleString('default', { month: 'long' })}
                    </p>
                </div>

                {!insights || insights.currentTotal === 0 ? (
                    <div className="px-4 py-12 flex flex-col items-center justify-center text-center">
                        <div className="size-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mb-6">
                            <span className="material-symbols-outlined text-4xl text-primary font-black">reorder</span>
                        </div>
                        <h3 className="text-xl font-bold mb-2">No data available</h3>
                        <p className="text-gray-500 max-w-[200px] text-sm">Add some expenses to see your spending analytics.</p>
                        <Button
                            onClick={() => navigate("/tracking")}
                            className="mt-8 bg-primary hover:bg-primary/90 text-white font-bold rounded-full px-8"
                        >
                            Add Expense
                        </Button>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-5 duration-700">
                        {/* Summary Card */}
                        <div className="px-4 mb-8">
                            <div className="relative overflow-hidden rounded-xl bg-card-dark border border-card-border p-6 bento-glow shadow-xl">
                                <div className="relative z-10">
                                    <p className="text-gray-400 text-sm font-medium mb-1">
                                        {new Date().toLocaleString('default', { month: 'long' })} Summary
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-black text-primary">
                                            {currency.format(insights.currentTotal).split('.')[0]}
                                        </span>
                                        <span className="text-xl font-bold text-primary/80">.00</span>
                                    </div>
                                    <div className="mt-6 flex items-center gap-2">
                                        <div className="flex -space-x-2">
                                            <div className="size-6 rounded-full border-2 border-card-dark bg-blue-500"></div>
                                            <div className="size-6 rounded-full border-2 border-card-dark bg-primary"></div>
                                            <div className="size-6 rounded-full border-2 border-card-dark bg-emerald-500"></div>
                                        </div>
                                        <p className="text-xs text-gray-400 font-medium">Spending trends for this period</p>
                                    </div>
                                </div>
                                <div className="absolute -bottom-10 -right-10 size-40 bg-primary/10 rounded-full blur-3xl"></div>
                            </div>
                        </div>

                        {/* Category Breakdown (Simplified to top 3 for UI) */}
                        <div className="px-4 mb-8">
                            <div className="flex items-center justify-between mb-4 px-1">
                                <h3 className="text-lg font-bold">Top Categories</h3>
                                <button className="text-primary text-sm font-bold">Details</button>
                            </div>
                            <div className="space-y-2">
                                {Object.entries(expenses?.reduce((acc: any, e: any) => {
                                    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
                                    return acc;
                                }, {}) || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([category, amount]: any) => {
                                    const percent = (amount / insights.currentTotal) * 100;
                                    const colorClass = category === insights.topCategory ? "bg-primary" : "bg-indigo-500";
                                    const icon = CATEGORY_ICONS[category] || "shopping_bag";

                                    return (
                                        <div key={category} className="flex items-center gap-4 bg-white dark:bg-card-dark/40 p-3 rounded-xl border border-transparent dark:hover:border-card-border transition-colors">
                                            <div className={`flex items-center justify-center rounded-lg bg-primary/10 text-primary size-12 shrink-0`}>
                                                <span className="material-symbols-outlined">{icon}</span>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-2">
                                                    <p className="text-sm font-bold">{category}</p>
                                                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{percent.toFixed(0)}% • {currency.format(amount)}</p>
                                                </div>
                                                <div className="relative w-full h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${percent}%` }}
                                                        className={`absolute top-0 left-0 h-full ${colorClass} rounded-full`}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Key Insights Grid */}
                        <div className="px-4 mb-8">
                            <h3 className="text-lg font-bold mb-4 px-1">Key Insights</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-1 h-32 bg-card-lighter border border-card-border rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden group shadow-sm">
                                    <div className="z-10">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Top Category</p>
                                        <p className="text-base font-bold leading-tight truncate">{insights.topCategory}</p>
                                    </div>
                                    <div className="z-10 flex justify-end">
                                        <div className="size-8 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-sm border border-white/5">
                                            <span className="material-symbols-outlined text-primary text-lg">{CATEGORY_ICONS[insights.topCategory] || 'category'}</span>
                                        </div>
                                    </div>
                                    <div className="absolute -right-4 -bottom-4 opacity-15">
                                        <div className="size-20 rounded-full bg-gradient-to-tr from-primary to-orange-300 blur-xl"></div>
                                    </div>
                                </div>

                                <div className="col-span-1 h-32 bg-card-lighter border border-card-border rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden group shadow-sm">
                                    <div className="z-10">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Daily Avg</p>
                                        <p className="text-base font-bold leading-tight">{currency.format(insights.dailyAverage)}</p>
                                    </div>
                                    <div className="z-10 flex justify-end">
                                        <div className="size-8 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-sm border border-white/5">
                                            <span className="material-symbols-outlined text-primary text-lg">calendar_today</span>
                                        </div>
                                    </div>
                                    <div className="absolute -right-4 -bottom-4 opacity-15">
                                        <div className="size-20 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-300 blur-xl"></div>
                                    </div>
                                </div>

                                <div className="col-span-2 h-24 bg-card-lighter border border-card-border rounded-xl p-4 flex items-center justify-between relative overflow-hidden group shadow-sm">
                                    <div className="z-10">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Largest Expense</p>
                                        <p className="text-xl font-black">{currency.format(insights.largestExpense.amount)}</p>
                                        <p className="text-[10px] text-primary font-bold uppercase mt-0.5 tracking-tight">{insights.largestExpense.title || insights.largestExpense.category}</p>
                                    </div>
                                    <div className="z-10">
                                        <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center backdrop-blur-sm border border-white/5">
                                            <span className="material-symbols-outlined text-2xl text-primary">{CATEGORY_ICONS[insights.largestExpense.category] || 'apartment'}</span>
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
                                </div>
                            </div>
                        </div>

                        {/* Smart Analysis Block */}
                        <div className="px-4 mb-10">
                            <div className="ai-glow border border-ai-border rounded-xl p-5 flex items-start gap-4 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 opacity-20">
                                    <span className="material-symbols-outlined text-primary/40 text-4xl">auto_awesome</span>
                                </div>
                                <div className="size-10 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                                    <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-primary tracking-tight">Smart Analysis</h4>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-gray-300 leading-relaxed mt-1.5">
                                        Your spending is trending <span className={`font-bold ${insights.percentChange > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                            {Math.abs(insights.percentChange).toFixed(0)}% {insights.percentChange > 0 ? 'higher' : 'lower'}
                                        </span> than last month. {insights.percentChange <= 0 ? 'Keep it up!' : 'Consider optimizing your top categories.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <MobileBottomNav />
        </div>
    );
};

export default Insights;
