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
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
    } catch (error) {
      const message = (error as Error).message ?? "Please check your details and try again.";
      toast({
        title: "Authentication failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const mode = form.watch("mode");

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep-black font-sans text-white bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))] dark:bg-none">
      {/* Dark Mode Gradient */}
      <div className="absolute top-0 left-0 right-0 h-[500px] z-0 pointer-events-none hidden dark:block" style={{ background: 'radial-gradient(circle at top, rgba(255, 77, 45, 0.15) 0%, transparent 70%)' }}></div>

      <div className="w-full max-w-sm rounded-[2rem] bg-white/80 dark:bg-charcoal/80 p-8 pb-10 shadow-xl backdrop-blur border border-white/20 dark:border-white/5 relative z-10">
        <div className="flex flex-col items-center gap-5 pt-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white dark:bg-white/5 shadow-md border border-gray-100 dark:border-white/5">
            <span className="text-3xl" aria-hidden>
              💸
            </span>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">SplitStuff</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/40">Split. Settle. Stay Friends.</p>
          </div>
        </div>

        <div className="mt-8 space-y-3 text-sm">
          {/* Placeholder Buttons - styled for dark mode */}
          <Button
            type="button"
            variant="secondary"
            className="flex w-full items-center justify-center gap-2 rounded-[999px] bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 shadow-sm hover:bg-gray-50 dark:hover:bg-white/10"
            disabled
          >
            <span className="text-base">🔍</span>
            <span>Continue with Google</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="flex w-full items-center justify-center gap-2 rounded-[999px] bg-gray-900 dark:bg-white text-white dark:text-black shadow-md hover:bg-gray-800 dark:hover:bg-white/90"
            disabled
          >
            <span className="text-base">🍎</span>
            <span>Continue with Apple</span>
          </Button>
        </div>

        <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-6 text-xs text-gray-500 dark:text-white/40">
          <p className="mb-1 text-center font-medium">
            {mode === "login" ? "Or sign in with email" : "Create your account"}
          </p>
          <p className="mb-4 text-center">
            {mode === "login" ? (
              <>
                <span className="text-gray-500 dark:text-white/40">New here? </span>
                <button
                  type="button"
                  onClick={() => form.setValue("mode", "signup")}
                  className="font-semibold text-brand underline-offset-4 hover:underline transition-all duration-200 hover:scale-105"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                <span className="text-gray-500 dark:text-white/40">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => form.setValue("mode", "login")}
                  className="font-semibold text-brand underline-offset-4 hover:underline transition-all duration-200 hover:scale-105"
                >
                  Log in instead
                </button>
              </>
            )}
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {mode === "signup" && (
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-white/60">Full name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" {...field} className="rounded-2xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10" />
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
                    <FormLabel className="text-gray-700 dark:text-white/60">Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} className="rounded-2xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10" />
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
                    <FormLabel className="text-gray-700 dark:text-white/60">Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        {...field}
                        className="rounded-2xl bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="mt-2 w-full rounded-[999px] text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 bg-brand hover:bg-brand/90 text-white">
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
