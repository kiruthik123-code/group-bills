import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

const profileSchema = z.object({
    fullName: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(100, "Name must be at most 100 characters"),
    upiId: z
        .string()
        .trim()
        .min(1, "UPI ID is required")
        .max(100, "UPI ID must be at most 100 characters")
        .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z.]{2,}$/i, "Enter a valid UPI ID like username@bank"),
});

const Profile = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Type for profile data
    type ProfileFormValues = z.infer<typeof profileSchema>;

    const [isSaving, setIsSaving] = useState(false);

    // Define form
    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            fullName: "",
            upiId: "",
        },
    });

    // Fetch profile data
    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) return;

            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select("full_name, upi_id")
                    .eq("id", user.id)
                    .maybeSingle();

                if (error) throw error;

                // Normalize values and update form
                const fullName = data?.full_name?.trim() ?? "";
                const upiId = data?.upi_id?.trim() ?? "";

                form.reset({
                    fullName,
                    upiId,
                });
            } catch (error) {
                toast({
                    title: "Error fetching profile",
                    description: (error as Error).message,
                    variant: "destructive",
                });
            }
        };

        fetchProfile();
    }, [user, form, toast, supabase]);

    // Warning is now handled once after profile load in fetchProfile


    const onSubmit = async (values: ProfileFormValues) => {
        if (!user) return;
        setIsSaving(true);

        try {
            const { error } = await supabase
                .from("profiles")
                .upsert({
                    id: user.id,
                    full_name: values.fullName.trim(),
                    upi_id: values.upiId.trim() || null,
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;

            // Invalidate the profile query to update profile across the app
            await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });

            toast({
                title: "Profile updated",
                description: "Your information has been saved successfully.",
            });
        } catch (error) {
            toast({
                title: "Error updating profile",
                description: (error as Error).message,
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            navigate("/auth", { replace: true });
        } catch (error) {
            toast({
                title: "Error logging out",
                description: (error as Error).message || "Please try again",
                variant: "destructive",
            });
        }
    };


    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // Get initials for avatar
    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <div className="relative w-full max-w-md min-h-screen bg-deep-black overflow-hidden flex flex-col mx-auto font-sans text-white selection:bg-brand/30">
            <div className="absolute top-0 left-0 right-0 h-[400px] z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top right, rgba(255, 77, 45, 0.1) 0%, transparent 60%)' }}></div>

            <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-6 pb-32 pt-6">
                {/* Header */}
                <header className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="bg-white/5 hover:bg-white/10 text-white rounded-full w-10 h-10 transition-all border border-white/5 active:scale-95"
                            onClick={() => navigate("/")}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-xl font-bold">Profile</h1>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-full w-10 h-10 transition-all border border-red-500/10 active:scale-95"
                        onClick={() => setShowLogoutConfirm(true)}
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </header>

                <div className="space-y-8">
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="h-32 w-32 border-4 border-charcoal shadow-2xl rounded-full bg-brand text-white uppercase flex items-center justify-center text-4xl font-bold">
                            {getInitials(form.watch("fullName") || "User")}
                        </div>

                        <div className="text-center space-y-1">
                            <h2 className="text-2xl font-bold">{form.watch("fullName") || "User"}</h2>
                            <p className="text-sm text-white/40">{user?.email}</p>
                        </div>
                    </div>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="fullName"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel className="text-xs font-bold text-white/40 uppercase tracking-wider ml-1">Full Name</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="John Doe"
                                                {...field}
                                                className="bg-charcoal border-white/5 rounded-2xl h-14 px-5 text-white placeholder:text-white/20 focus:border-brand/50 transition-all"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="upiId"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel className="text-xs font-bold text-white/40 uppercase tracking-wider ml-1">UPI ID</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="username@bank"
                                                {...field}
                                                className="bg-charcoal border-white/5 rounded-2xl h-14 px-5 text-white placeholder:text-white/20 focus:border-brand/50 transition-all"
                                            />
                                        </FormControl>
                                        <FormDescription className="text-xs text-white/30 ml-1">
                                            Required for others to pay you directly.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                className="w-full rounded-[20px] h-14 text-base font-bold bg-brand hover:bg-brand/90 transition-all duration-200 mt-4 active:scale-[0.98]"
                                disabled={isSaving}
                            >
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />}
                                Save Changes
                            </Button>
                        </form>
                    </Form>
                </div>
            </div>

            <MobileBottomNav />

            <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                <AlertDialogContent className="bg-charcoal border-white/10 text-white rounded-[28px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Log Out</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/50">
                            Are you sure you want to log out? You'll need to sign in again to access your account.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleLogout}
                            className="bg-red-500/90 hover:bg-red-500 text-white rounded-xl border-none"
                        >
                            Log Out
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    );
};

export default Profile;
