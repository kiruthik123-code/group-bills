import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
        throw new Error("Enter an invite code to join a group.");
      }

      const { data: group, error: groupError } = await supabase
        .rpc("lookup_group_by_invite", { invite_code_param: trimmed })
        .maybeSingle();

      if (groupError) throw groupError;
      if (!group) {
        throw new Error("Invalid or expired code.");
      }

      const { error: memberError } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id });

      if (memberError && memberError.code !== "23505") {
        // 23505 = unique_violation (already a member)
        throw memberError;
      }

      return group;
    },
    onSuccess: (group) => {
      toast({
        title: "Joined group",
        description: `You're now a member of "${group.name}"`,
      });
      navigate(`/groups/${group.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Could not join group",
        description: error.message ?? "Please check the code and try again.",
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join a group</DialogTitle>
          <DialogDescription>
            Enter an invite code or open a shared link to join an existing group.
          </DialogDescription>
        </DialogHeader>

        <Card className="mt-2 space-y-4 p-4 border-none shadow-none">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="invite-code">
            Invite code
          </label>
          <Input
            id="invite-code"
            placeholder="e.g., ABCD1234"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button
            className="w-full transition-all duration-200 hover:scale-105"
            disabled={joinGroup.isPending}
            onClick={() => joinGroup.mutate()}
         >
            Join group
          </Button>
          {codeFromUrl && (
            <p className="text-xs text-muted-foreground">
              This link contains an invite code. Confirm to join the group.
            </p>
          )}
        </Card>
      </DialogContent>
    </Dialog>
  );
};

export default JoinGroupPage;
