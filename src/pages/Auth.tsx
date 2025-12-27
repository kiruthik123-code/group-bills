import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const authSchema = z.object({
  mode: z.enum(["login", "signup"]),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().trim().max(100).optional(),
});

type AuthFormValues = z.infer<typeof authSchema>;

const AuthPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { mode: "login", email: "", password: "", fullName: "" },
  });

  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (values: AuthFormValues) => {
    const { mode, email, password, fullName } = values;
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: fullName ? { full_name: fullName } : {},
          },
        });
        if (error) throw error;
        toast({ title: "Account created", description: "You are now signed in." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back", description: "You are now signed in." });
      }
      navigate("/", { replace: true });
    } catch (error: any) {
      toast({
        title: "Authentication failed",
        description: error.message ?? "Please check your details and try again.",
        variant: "destructive",
      });
    }
  };

  const mode = form.watch("mode");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold">SplitStuff</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Smart expense splitting for roommates, trips, and groups.
        </p>

        <div className="mb-6 flex gap-2 rounded-md bg-muted p-1 text-sm">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "ghost"}
            className="w-1/2"
            onClick={() => form.setValue("mode", "login")}
          >
            Log in
          </Button>
          <Button
            type="button"
            variant={mode === "signup" ? "default" : "ghost"}
            className="w-1/2"
            onClick={() => form.setValue("mode", "signup")}
          >
            Sign up
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {mode === "signup" && (
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">
              {mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default AuthPage;
