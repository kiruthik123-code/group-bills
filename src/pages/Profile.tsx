import { useEffect, useState, useRef, RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Loader2, LogOut, Eye, Pencil, Upload, UserPen, ZoomIn, ZoomOut, X, RotateCcw, RotateCw } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import AvatarEditor from 'react-avatar-editor';

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
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);
    const [isViewingAvatar, setIsViewingAvatar] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const avatarEditorRef = useRef<any>(null);

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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
                setIsEditingAvatar(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUploadAvatar = async () => {
        if (!user || !avatarEditorRef.current) return;

        setUploading(true);
        try {
            // Get the cropped image from the editor
            const canvas = avatarEditorRef.current.getImageScaledToCanvas();
            const base64Image = canvas.toDataURL();
            
            // Convert base64 to blob
            const response = await fetch(base64Image);
            const blob = await response.blob();
            
            // Validate image type
            const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!validImageTypes.includes(blob.type)) {
                throw new Error('Invalid image type. Please upload a JPEG, PNG, GIF, or WEBP image.');
            }
            
            const fileExt = blob.type.split('/')[1];
            const fileName = `${user.id}/${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Delete old avatar if it exists
            if (avatarUrl) {
                // Extract file path from the avatar URL
                try {
                    const url = new URL(avatarUrl);
                    const pathname = url.pathname;
                    // Extract filename from the pathname
                    const pathParts = pathname.split('/');
                    const filename = pathParts[pathParts.length - 1];
                    
                    if (filename) {
                        const { error: deleteError } = await supabase.storage
                            .from('avatars')
                            .remove([`${user.id}/${filename}`]);
                            
                        if (deleteError) {
                            console.warn('Failed to delete old avatar:', deleteError);
                        }
                    }
                } catch (urlError) {
                    console.warn('Failed to parse avatar URL for deletion:', urlError);
                    // Fallback to the original method
                    try {
                        const oldFilePath = avatarUrl.split('/').pop();
                        if (oldFilePath) {
                            const { error: deleteError } = await supabase.storage
                                .from('avatars')
                                .remove([`${user.id}/${oldFilePath}`]);
                                
                            if (deleteError) {
                                console.warn('Failed to delete old avatar with fallback method:', deleteError);
                            }
                        }
                    } catch (fallbackError) {
                        console.warn('Fallback deletion also failed:', fallbackError);
                    }
                }
            }

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, blob, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Add a timestamp to bypass cache
            const timestamp = Date.now();
            const cachedPublicUrl = `${publicUrl}?t=${timestamp}`;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: cachedPublicUrl, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (updateError) throw updateError;

            setAvatarUrl(cachedPublicUrl); // Use the cached URL with timestamp
            setIsEditingAvatar(false);
            setIsAvatarDialogOpen(false);
            
            // Invalidate the profile query to update avatar across the app
            await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
            await queryClient.invalidateQueries({ queryKey: ["profile"] });
            
            // Also invalidate any group member queries that might display this user's avatar
            await queryClient.invalidateQueries({ queryKey: ["group_members"] });
            await queryClient.invalidateQueries({ queryKey: ["balances"] });
            await queryClient.invalidateQueries({ queryKey: ["payables"] });
            
            toast({
                title: "Avatar updated",
                description: "Your profile picture has been updated.",
            });
        } catch (error) {
            toast({
                title: "Upload failed",
                description: (error as Error).message || "An error occurred while uploading your avatar",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
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
                    <div className="flex flex-col items-center justify-center space-y-4 py-4">
                        <div className="relative group">
                            <Avatar className="h-32 w-32 border-4 border-white shadow-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl group-focus:ring-4 group-focus:ring-primary/30">
                                <AvatarImage src={avatarUrl || ""} className="object-cover" />
                                <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-primary/20 to-secondary/20 text-primary uppercase flex items-center justify-center">
                                    {getInitials(form.watch("fullName") || "User")}
                                </AvatarFallback>
                            </Avatar>
                            <button
                                onClick={() => setIsAvatarDialogOpen(true)}
                                className="absolute -bottom-2 -right-2 bg-primary text-white p-3 rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-110 border-4 border-white group-hover:scale-125 duration-300"
                                aria-label="Edit profile picture"
                            >
                                <UserPen className="h-4 w-4" />
                            </button>
                        </div>

                        <p className="text-sm text-muted-foreground font-medium">{user?.email}</p>
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

            {/* Avatar Options Dialog */}
            <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
                <DialogContent className="sm:max-w-xs rounded-[2rem] p-0 overflow-hidden border-0 shadow-2xl animate-in fade-in zoom-in duration-300">
                    <div className="bg-gradient-to-b from-primary/5 to-transparent p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="text-center text-lg font-bold text-foreground">Profile Picture</DialogTitle>
                        </DialogHeader>

                        <div className="grid grid-cols-1 gap-3">
                            <button
                                className="group flex items-center gap-4 w-full p-4 rounded-2xl bg-white/80 hover:bg-primary/10 border border-white/50 shadow-sm transition-all duration-200 active:scale-[0.98]"
                                onClick={() => {
                                    setIsViewingAvatar(true);
                                    setIsAvatarDialogOpen(false);
                                }}
                            >
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Eye className="h-5 w-5" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-sm text-foreground">View profile photo</p>
                                    <p className="text-[10px] text-muted-foreground">See your current display picture</p>
                                </div>
                            </button>

                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                                <div className="group flex items-center gap-4 w-full p-4 rounded-2xl bg-white/80 hover:bg-primary/10 border border-white/50 shadow-sm transition-all duration-200 active:scale-[0.98]">
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                        <Pencil className="h-5 w-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-sm text-foreground">Upload new photo</p>
                                        <p className="text-[10px] text-muted-foreground">Choose from gallery or camera</p>
                                    </div>
                                </div>
                            </label>

                            <Button
                                variant="ghost"
                                className="mt-2 text-muted-foreground font-semibold hover:bg-transparent"
                                onClick={() => setIsAvatarDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Avatar Dialog */}
            <Dialog open={isViewingAvatar} onOpenChange={setIsViewingAvatar}>
                <DialogContent className="max-w-sm w-[calc(100%-2rem)] max-h-[95vh] rounded-3xl p-0 overflow-hidden bg-black/95 border-0 shadow-2xl backdrop-blur-xl">
                    <div className="relative aspect-square flex items-center justify-center p-6">
                        <Avatar className="h-[85%] w-[85%] rounded-xl overflow-hidden">
                            <AvatarImage src={avatarUrl || ""} className="object-contain w-full h-full" />
                            <AvatarFallback className="text-5xl font-bold bg-gradient-to-br from-primary/20 to-secondary/20 text-white rounded-none flex items-center justify-center">
                                {getInitials(form.watch("fullName") || "U")}
                            </AvatarFallback>
                        </Avatar>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-5 right-5 h-10 w-10 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full text-white shadow-lg transition-all duration-200 hover:scale-110"
                            onClick={() => setIsViewingAvatar(false)}
                            aria-label="Close viewer"
                        >
                            <X className="h-5 w-5" />
                        </Button>

                        <div className="absolute bottom-5 left-0 right-0 px-6">
                            <div className="bg-white/20 backdrop-blur-md rounded-full py-2 px-4 inline-block">
                                <p className="text-white font-medium text-sm truncate">
                                    {form.watch("fullName") || "Profile Photo"}
                                </p>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Avatar Dialog (Crop/Scale/Rotate) */}
            <Dialog open={isEditingAvatar} onOpenChange={(open) => !open && !uploading && setIsEditingAvatar(false)}>
                <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[95vh] rounded-3xl p-0 overflow-hidden border-0 shadow-2xl bg-white">
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-center text-xl font-bold text-foreground">Edit Your Photo</DialogTitle>
                            <p className="text-center text-xs text-muted-foreground">Drag to position, zoom to fit, rotate as needed</p>
                        </DialogHeader>

                        <div className="flex flex-col items-center gap-5">
                            {/* Editor Area */}
                            <div className="relative group">
                                <div className="relative h-60 w-60 rounded-full overflow-hidden border-4 border-primary/10 shadow-lg bg-muted/20 ring-2 ring-primary/10 transition-all duration-300">
                                    {previewUrl && (
                                        <AvatarEditor
                                            ref={avatarEditorRef}
                                            image={previewUrl}
                                            width={240}
                                            height={240}
                                            border={0}
                                            borderRadius={120}
                                            color={[255, 255, 255, 0.6]}
                                            scale={scale}
                                            rotate={rotation}
                                            position={position}
                                            onPositionChange={setPosition}
                                        />
                                    )}

                                    {/* Overlay Mesh/Mask */}
                                    <div className="absolute inset-0 pointer-events-none ring-1 ring-white/50 border-4 border-white/80 rounded-full" />
                                </div>

                                <div className="absolute -bottom-3 right-0 h-8 w-8 bg-primary text-white flex items-center justify-center rounded-full shadow-lg ring-2 ring-white transition-transform group-hover:scale-110">
                                    <Pencil className="h-3.5 w-3.5" />
                                </div>
                            </div>

                            {/* Controls Section */}
                            <div className="w-full space-y-5 px-3">
                                {/* Scale Control */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs font-medium text-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <ZoomIn className="h-3.5 w-3.5 text-primary" />
                                            Zoom
                                        </span>
                                        <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs">
                                            {(scale).toFixed(1)}x
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2.5 mt-2">
                                        <button
                                            className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary/10"
                                            onClick={() => setScale(prev => Math.max(1, prev - 0.1))}
                                            aria-label="Zoom out"
                                        >
                                            <ZoomOut className="h-4 w-4" />
                                        </button>
                                        <Slider
                                            value={[scale]}
                                            min={1}
                                            max={3}
                                            step={0.1}
                                            onValueChange={(val) => setScale(val[0])}
                                            className="flex-1 h-1.5"
                                        />
                                        <button
                                            className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary/10"
                                            onClick={() => setScale(prev => Math.min(3, prev + 0.1))}
                                            aria-label="Zoom in"
                                        >
                                            <ZoomIn className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Rotation Control */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs font-medium text-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <RotateCw className="h-3.5 w-3.5 text-primary" />
                                            Rotation
                                        </span>
                                        <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs">
                                            {rotation}°
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2.5 mt-2">
                                        <button
                                            className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary/10"
                                            onClick={() => setRotation(prev => (prev - 45) % 360)}
                                            aria-label="Rotate left"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </button>
                                        <Slider
                                            value={[rotation]}
                                            min={0}
                                            max={360}
                                            step={1}
                                            onValueChange={(val) => setRotation(val[0])}
                                            className="flex-1 h-1.5"
                                        />
                                        <button
                                            className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary/10"
                                            onClick={() => setRotation(prev => (prev + 45) % 360)}
                                            aria-label="Rotate right"
                                        >
                                            <RotateCw className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 mt-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-xl h-11 font-medium text-muted-foreground border-muted-foreground/30 hover:bg-muted/50"
                                        onClick={() => setIsEditingAvatar(false)}
                                        disabled={uploading}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 rounded-xl h-11 font-semibold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all duration-200"
                                        onClick={handleUploadAvatar}
                                        disabled={uploading}
                                    >
                                        {uploading ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin text-white" />
                                                <span>Saving...</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Upload className="h-4 w-4" />
                                                <span>Save</span>
                                            </div>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Profile;
