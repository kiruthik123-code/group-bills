import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const JoinGroupPage = () => {
  const { code: codeFromUrl } = useParams<{ code?: string }>();
  const [code, setCode] = useState("");
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))]">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="hover-scale rounded-full px-3 text-xs"
            >
              f Back
            </Button>
            <h1 className="mt-3 text-base font-semibold text-foreground">Join a group</h1>
            <p className="text-xs text-muted-foreground">
              Enter an invite code from a friend to join their group.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-1 items-center px-4 py-8">
        <Card className="w-full space-y-4 rounded-3xl border-0 bg-card/90 p-5 shadow-lg animate-enter">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="invite-code">
              Invite code
            </label>
            <Input
              id="invite-code"
              placeholder="e.g., ABCD1234"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="h-10 rounded-2xl"
            />
          </div>
          <Button
            className="hover-scale w-full rounded-2xl py-2.5 text-sm font-semibold"
            disabled={joinGroup.isPending}
            onClick={() => joinGroup.mutate()}
          >
            {joinGroup.isPending ? "Joining..." : "Join group"}
          </Button>
          {codeFromUrl && (
            <p className="text-[11px] text-muted-foreground">
              This link contains an invite code. Confirm to join the group.
            </p>
          )}
        </Card>
      </main>
    </div>
  );
};

export default JoinGroupPage;
