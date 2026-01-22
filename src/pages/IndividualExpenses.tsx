import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Search, Filter, Edit2, BarChart2, PieChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

type IndividualExpense = {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  description: string;
};

const categories = ["Food", "Transport", "Shopping", "Entertainment", "Utilities", "Health", "Other"];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

const IndividualExpensesPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<IndividualExpense | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [showChart, setShowChart] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    date: new Date().toISOString().split('T')[0],
    category: "Other",
    description: ""
  });

  // Fetch individual expenses
  const { data: expenses, isLoading } = useQuery({
    queryKey: ["individual-expenses", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await (supabase as any)
        .from("individual_expenses")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false });
      
      if (error) throw error;
      return data as IndividualExpense[];
    },
    enabled: !!user,
  });

  // Mutation to add expense
  const addExpenseMutation = useMutation({
    mutationFn: async (expenseData: Omit<IndividualExpense, 'id'>) => {
      if (!user) throw new Error("User not authenticated");
      
      const { data, error } = await (supabase as any)
        .from("individual_expenses")
        .insert([{ ...expenseData, user_id: user.id }])
        .select()
        .single();
      
      if (error) throw error;
      return data as IndividualExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["individual-expenses", user?.id] });
      setShowAddForm(false);
      resetForm();
      toast({
        title: "Expense added",
        description: "Your individual expense has been recorded."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add expense",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation to update expense
  const updateExpenseMutation = useMutation({
    mutationFn: async (expense: IndividualExpense) => {
      const { error } = await (supabase as any)
        .from("individual_expenses")
        .update({
          title: expense.title,
          amount: expense.amount,
          date: expense.date,
          category: expense.category,
          description: expense.description
        })
        .eq("id", expense.id);
      
      if (error) throw error;
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["individual-expenses", user?.id] });
      setEditingExpense(null);
      resetForm();
      toast({
        title: "Expense updated",
        description: "Your expense has been updated."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update expense",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mutation to delete expense
  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("individual_expenses")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["individual-expenses", user?.id] });
      toast({
        title: "Expense deleted",
        description: "Your expense has been removed."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete expense",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormData({
      title: "",
      amount: "",
      date: new Date().toISOString().split('T')[0],
      category: "Other",
      description: ""
    });
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.amount) {
      toast({
        title: "Missing fields",
        description: "Please fill in both title and amount",
        variant: "destructive"
      });
      return;
    }
    
    if (editingExpense) {
      updateExpenseMutation.mutate({
        ...editingExpense,
        title: formData.title,
        amount: parseFloat(formData.amount),
        date: formData.date,
        category: formData.category,
        description: formData.description,
      });
    } else {
      addExpenseMutation.mutate({
        title: formData.title,
        amount: parseFloat(formData.amount),
        date: formData.date,
        category: formData.category,
        description: formData.description,
        user_id: user!.id,
      });
    }
  };

  const startEdit = (expense: IndividualExpense) => {
    setEditingExpense(expense);
    setFormData({
      title: expense.title,
      amount: expense.amount.toString(),
      date: expense.date,
      category: expense.category,
      description: expense.description || ""
    });
  };

  const filteredExpenses = expenses?.filter(expense => {
    const matchesSearch = expense.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          expense.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "All" || expense.category === filterCategory;
    return matchesSearch && matchesCategory;
  }) || [];

  const chartData = filteredExpenses.reduce((acc, curr) => {
    const existing = acc.find(item => item.name === curr.category);
    if (existing) {
      existing.value += curr.amount;
    } else {
      acc.push({ name: curr.category, value: curr.amount });
    }
    return acc;
  }, [] as { name: string, value: number }[]);

  const totalSpent = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))] font-sans">
      <main className="mx-auto flex max-w-md flex-col pb-20">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/50 px-4 py-4 backdrop-blur-md border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 h-9 w-9 rounded-full"
                onClick={() => navigate("/")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </Button>
              <h1 className="text-xl font-bold text-foreground">My Expenses</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowChart(!showChart)}>
               {showChart ? <BarChart2 className="h-5 w-5 text-primary" /> : <PieChart className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {/* Summary Card */}
          <Card className="p-5 rounded-2xl border-0 bg-gradient-to-br from-[hsl(210_100%_97%)] via-[hsl(280_100%_96%)] to-[hsl(210_100%_97%)] shadow-lg">
            <p className="text-xs font-medium text-muted-foreground">Total spent</p>
            <p className="mt-2 text-3xl font-extrabold text-primary">
              {currency.format(totalSpent)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filteredExpenses.length} expenses tracked
            </p>
          </Card>

          {/* Chart Section */}
          {showChart && chartData.length > 0 && (
            <Card className="p-4 rounded-2xl overflow-hidden">
              <h3 className="text-sm font-semibold mb-4">Expenses by Category</h3>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                    <RechartsTooltip 
                      formatter={(value: number) => [currency.format(value), "Amount"]}
                      cursor={{ fill: 'transparent' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Search and Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search expenses..." 
                className="pl-9 rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[110px] rounded-xl">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add Expense Button */}
          <Button
            className="w-full py-6 rounded-2xl shadow-md transition-all duration-200 hover:scale-[1.02]"
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
          >
            <Plus className="mr-2 h-5 w-5" />
            Add Individual Expense
          </Button>

          {/* Expenses List */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Recent Expenses</h2>
            
            {isLoading ? (
              <p className="text-muted-foreground">Loading expenses...</p>
            ) : filteredExpenses.length > 0 ? (
              <div className="space-y-3">
                {filteredExpenses.map((expense) => (
                  <Card 
                    key={expense.id} 
                    className="flex items-center justify-between p-4 rounded-2xl shadow-sm transition-all duration-200 hover:scale-[1.01] cursor-pointer"
                    onClick={() => startEdit(expense)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{expense.title}</p>
                        <Badge variant="secondary" className="text-xs pointer-events-none">
                          {expense.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(expense.date).toLocaleDateString()}
                      </p>
                      {expense.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">{expense.description}</p>
                      )}
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <p className="font-semibold text-primary">
                        {currency.format(expense.amount)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteExpenseMutation.mutate(expense.id);
                        }}
                        disabled={deleteExpenseMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 rounded-2xl text-center border-dashed">
                <p className="text-muted-foreground">No expenses found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
              </Card>
            )}
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={showAddForm || !!editingExpense} onOpenChange={(open) => {
          if (!open) {
            setShowAddForm(false);
            setEditingExpense(null);
          }
        }}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>{editingExpense ? "Edit Expense" : "Add New Expense"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveExpense} className="space-y-4 pt-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Dinner, Groceries, etc."
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="mt-1 rounded-xl"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    className="mt-1 rounded-xl"
                  />
                </div>
                
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="mt-1 rounded-xl"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({...formData, category: value})}
                >
                  <SelectTrigger className="w-full mt-1 rounded-xl">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  placeholder="Additional details..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="mt-1 rounded-xl"
                />
              </div>
              
              <DialogFooter className="flex gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingExpense(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-xl"
                  disabled={addExpenseMutation.isPending || updateExpenseMutation.isPending}
                >
                  {addExpenseMutation.isPending || updateExpenseMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default IndividualExpensesPage;
