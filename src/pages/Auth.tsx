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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.24),_hsl(var(--background)))]">
      <div className="w-full max-w-sm rounded-[2rem] bg-card/90 p-8 pb-10 shadow-xl">
        <div className="flex flex-col items-center gap-4 pt-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-accent/40">
            <span className="text-3xl" aria-hidden>
              💸
            </span>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">SplitStuff</h1>
            <p className="mt-1 text-sm text-muted-foreground">Split. Settle. Stay friends.</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-muted/60 p-1 text-xs font-medium text-muted-foreground">
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "login" ? "default" : "ghost"}
              className="w-1/2 rounded-lg"
              onClick={() => form.setValue("mode", "login")}
            >
              Log in
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "signup" ? "default" : "ghost"}
              className="w-1/2 rounded-lg"
              onClick={() => form.setValue("mode", "signup")}
            >
              Sign up
            </Button>
          </div>
        </div>

        <div className="mt-6">
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
                      <Input
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="mt-2 w-full rounded-xl text-base font-semibold">
                {mode === "login" ? "Continue" : "Create account"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
