import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const JoinGroupPage = () => {
  const { code: codeFromUrl } = useParams<{ code?: string }>();
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (codeFromUrl) {
      setCode(codeFromUrl.toUpperCase());
    }
  }, [codeFromUrl]);

  const joinGroup = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error("You must be logged in to join a group.");
      }

      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        throw new Error("Please enter an invite code.");
      }

      // 1. Lookup the group by invite code
      const { data: groupLookup, error: groupError } = await supabase
        .rpc("lookup_group_by_invite", { invite_code_param: trimmed })
        .maybeSingle();

      if (groupError) {
        console.error("Group lookup error:", groupError);
        throw new Error("Unable to verify invite code. Please try again.");
      }

      if (!groupLookup) {
        throw new Error("This invite code is invalid or has expired.");
      }

      // 2. Check if user is already a member - Objective: Prevent duplicate joins
      const { data: existingMembership, error: membershipCheckError } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", groupLookup.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipCheckError) {
        console.error("Membership check error:", membershipCheckError);
        // Continue but be cautious
      }

      if (existingMembership) {
        // Requirement: If already a member, clearly say: "You’re already in this group"
        toast({
          title: "Already a member",
          description: `You're already in this group: "${groupLookup.name}"`,
        });
        navigate(`/groups/${groupLookup.id}`);
        return groupLookup;
      }

      // 3. Join the group
      const { error: memberError } = await supabase
        .from("group_members")
        .insert({
          group_id: groupLookup.id,
          user_id: user.id
          // Initialize any required existing fields to safe defaults (No new fields needed for group_members)
        });

      if (memberError) {
        if (memberError.code === "23505") {
          // Double check for race conditions
          return groupLookup;
        }
        console.error("Join member error:", memberError);
        throw new Error("Failed to join group. Please try again.");
      }

      return groupLookup;
    },
    onSuccess: (groupLookup) => {
      // Success feedback
      if (groupLookup && groupLookup.id) {
        toast({
          title: "Success!",
          description: `You've successfully joined "${groupLookup.name}"`,
        });
        // Sync group data immediately by navigating
        navigate(`/groups/${groupLookup.id}`, { replace: true });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Could not join group",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading SplitStuff...</p>
      </div>
    );
  }

  const handleClose = () => {
    setOpen(false);
    navigate(-1);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md bg-charcoal border-white/10 text-white rounded-[28px]">
        <DialogHeader>
          <DialogTitle>Join a group</DialogTitle>
          <DialogDescription className="text-white/50">
            Enter an invite code or open a shared link to join an existing group.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider pl-1" htmlFor="invite-code">
              Invite Code
            </label>
            <Input
              id="invite-code"
              placeholder="e.g., ABCD1234"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="bg-white/5 border-white/10 text-white h-12 rounded-xl placeholder:text-white/20 uppercase tracking-widest font-mono font-bold"
            />
          </div>

          <Button
            className="w-full bg-brand hover:bg-brand/90 text-white rounded-xl h-12 font-bold shadow-lg shadow-brand/20 transition-all duration-200 hover:scale-[1.02]"
            disabled={joinGroup.isPending}
            onClick={() => joinGroup.mutate()}
          >
            {joinGroup.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Join Group"}
          </Button>

          {codeFromUrl && (
            <p className="text-xs text-brand/80 text-center font-medium">
              You've been invited via link!
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JoinGroupPage;
