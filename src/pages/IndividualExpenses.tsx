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
import { Plus, Calendar, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
 
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
 
const IndividualExpensesPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newExpense, setNewExpense] = useState({
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
      setNewExpense({
        title: "",
        amount: "",
        date: new Date().toISOString().split('T')[0],
        category: "Other",
        description: ""
      });
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

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.title || !newExpense.amount) {
      toast({
        title: "Missing fields",
        description: "Please fill in both title and amount",
        variant: "destructive"
      });
      return;
    }
    
    addExpenseMutation.mutate({
      title: newExpense.title,
      amount: parseFloat(newExpense.amount),
      date: newExpense.date,
      category: newExpense.category,
      description: newExpense.description,
      user_id: user.id!,
    });
  };

  const categories = ["Food", "Transport", "Shopping", "Entertainment", "Utilities", "Health", "Other"];

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
            <div>
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
          </div>
        </header>

        <div className="p-4">
          {/* Summary Card */}
          <Card className="p-5 mb-6 rounded-2xl border-0 bg-gradient-to-br from-[hsl(210_100%_97%)] via-[hsl(280_100%_96%)] to-[hsl(210_100%_97%)] shadow-lg">
            <p className="text-xs font-medium text-muted-foreground">Total spent</p>
            <p className="mt-2 text-3xl font-extrabold text-primary">
              {currency.format(expenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {expenses?.length || 0} expenses tracked
            </p>
          </Card>

          {/* Add Expense Button */}
          <div className="mb-6">
            {!showAddForm ? (
              <Button
                className="w-full py-6 rounded-2xl transition-all duration-200 hover:scale-[1.02]"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="mr-2 h-5 w-5" />
                Add Individual Expense
              </Button>
            ) : (
              <Card className="p-4 mb-4 rounded-2xl">
                <form onSubmit={handleAddExpense} className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="Dinner, Groceries, etc."
                      value={newExpense.title}
                      onChange={(e) => setNewExpense({...newExpense, title: e.target.value})}
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
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                        className="mt-1 rounded-xl"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={newExpense.date}
                        onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                        className="mt-1 rounded-xl"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <select
                      id="category"
                      value={newExpense.category}
                      onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                      className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      placeholder="Additional details..."
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                      className="mt-1 rounded-xl"
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-xl"
                      onClick={() => setShowAddForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 rounded-xl"
                      disabled={addExpenseMutation.isPending}
                    >
                      {addExpenseMutation.isPending ? "Adding..." : "Add"}
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </div>

          {/* Expenses List */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Recent Expenses</h2>
            
            {isLoading ? (
              <p className="text-muted-foreground">Loading expenses...</p>
            ) : expenses && expenses.length > 0 ? (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <Card 
                    key={expense.id} 
                    className="flex items-center justify-between p-4 rounded-2xl shadow-sm transition-all duration-200 hover:scale-[1.01]"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{expense.title}</p>
                        <Badge variant="secondary" className="text-xs">
                          {expense.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(expense.date).toLocaleDateString()}
                      </p>
                      {expense.description && (
                        <p className="text-xs text-muted-foreground mt-1">{expense.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">
                        {currency.format(expense.amount)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 mt-1 text-destructive hover:text-destructive"
                        onClick={() => deleteExpenseMutation.mutate(expense.id)}
                        disabled={deleteExpenseMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 rounded-2xl text-center">
                <p className="text-muted-foreground">No expenses recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add your first individual expense to get started</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default IndividualExpensesPage;