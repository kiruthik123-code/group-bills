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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))]">
      <div className="w-full max-w-sm rounded-[2rem] bg-card/80 p-8 pb-10 shadow-xl backdrop-blur">
        <div className="flex flex-col items-center gap-5 pt-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-card shadow-md">
            <span className="text-3xl" aria-hidden>
              💸
            </span>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">SplitStuff</h1>
            <p className="mt-1 text-sm text-muted-foreground">Split. Settle. Stay Friends.</p>
          </div>
        </div>

        <div className="mt-8 space-y-3 text-sm">
          <Button
            type="button"
            variant="secondary"
            className="flex w-full items-center justify-center gap-2 rounded-[999px] bg-card text-foreground shadow-md hover:shadow-lg"
            disabled
         >
            <span className="text-base">🔍</span>
            <span>Continue with Google</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="flex w-full items-center justify-center gap-2 rounded-[999px] bg-foreground text-background shadow-md hover:shadow-lg"
            disabled
         >
            <span className="text-base">🍎</span>
            <span>Continue with Apple</span>
          </Button>

          <Button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-[999px] shadow-md hover:shadow-lg"
            disabled
         >
            <span className="text-base">📱</span>
            <span>Continue with Phone</span>
          </Button>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          <p className="mb-3 text-center font-medium">Or sign in with email</p>

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
                        <Input autoComplete="name" {...field} className="rounded-2xl" />
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
                      <Input type="email" autoComplete="email" {...field} className="rounded-2xl" />
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
                        className="rounded-2xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="mt-2 w-full rounded-[999px] text-base font-semibold shadow-md hover:shadow-lg">
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
