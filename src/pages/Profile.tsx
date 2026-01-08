import { useEffect, useState } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
    const [isSaving, setIsSaving] = useState(false);
    const [showProfileWarning, setShowProfileWarning] = useState(false);
    const [hasShownProfileWarning, setHasShownProfileWarning] = useState(false);
    
    // Type for profile data
    type ProfileFormValues = z.infer<typeof profileSchema>;

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
                    .single();

                if (error) throw error;

                if (data) {
                    form.reset({
                        fullName: data.full_name || "",
                        upiId: data.upi_id || "",
                    });
                }
            } catch (error) {
                toast({
                    title: "Error fetching profile",
                    description: (error as Error).message,
                    variant: "destructive",
                });
            }
        };

        fetchProfile();
    }, [user, form, toast]);
    
    // Show a one-time warning per visit if either field is empty
    useEffect(() => {
        if (hasShownProfileWarning) return;

        const fullName = form.getValues("fullName")?.trim();
        const upiId = form.getValues("upiId")?.trim();

        const isNameEmpty = !fullName;
        const isUpiIdEmpty = !upiId;

        if (isNameEmpty || isUpiIdEmpty) {
            setShowProfileWarning(true);
            setHasShownProfileWarning(true);
        }
    }, [form, hasShownProfileWarning]);

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

            // Hide the warning after successful update
            setShowProfileWarning(false);
            
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
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))]">
            <div className="mx-auto flex max-w-md flex-col pb-20">
                {/* Header */}
                <header className="sticky top-0 z-10 flex items-center justify-between bg-white/50 px-4 py-4 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-ml-2 h-9 w-9 rounded-full"
                            onClick={() => navigate(-1)}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-lg font-semibold text-foreground">Profile</h1>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                        onClick={() => setShowLogoutConfirm(true)}
                    >
                        <LogOut className="h-5 w-5" />
                    </Button>
                </header>

                <div className="p-4 space-y-6">
                    <div className="flex flex-col items-center justify-center space-y-3 py-4">
                        <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                                {getInitials(form.watch("fullName") || "User")}
                            </AvatarFallback>
                        </Avatar>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="fullName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full Name</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="John Doe"
                                                {...field}
                                                className="rounded-xl border-input/50 bg-background/50 focus:bg-background transition-colors"
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
                                    <FormItem>
                                        <FormLabel>UPI ID</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="username@bank"
                                                {...field}
                                                className="rounded-xl border-input/50 bg-background/50 focus:bg-background transition-colors"
                                            />
                                        </FormControl>
                                        <FormDescription className="text-xs">
                                            Required for others to pay you directly from the app.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                className="w-full rounded-2xl py-6 text-base font-semibold shadow-lg shadow-primary/20"
                                disabled={isSaving}
                            >
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </form>
                    </Form>
                </div>

                {/* Bottom Nav Spacer */}
                <div className="h-16" />
            </div>
            
            <AlertDialog open={showProfileWarning} onOpenChange={setShowProfileWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Profile Details Missing</AlertDialogTitle>
                        <AlertDialogDescription>
                            {(() => {
                                const fullName = form.watch("fullName");
                                const upiId = form.watch("upiId");
                                
                                const isNameEmpty = !fullName || fullName.trim() === "";
                                const isUpiIdEmpty = !upiId || upiId.trim() === "";
                                
                                if (isNameEmpty && isUpiIdEmpty) {
                                    return "Your name and UPI ID are missing. Please update your profile to fully use SplitStuff.";
                                } else if (isNameEmpty) {
                                    return "Your name is missing. Please update your profile to fully use SplitStuff.";
                                } else {
                                    return "Your UPI ID is missing. Please update your profile to fully use SplitStuff.";
                                }
                            })()}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setShowProfileWarning(false)}>
                            OK
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Log Out</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to log out? You'll need to sign in again to access your account.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleLogout}
                            className="bg-destructive hover:bg-destructive/90"
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
