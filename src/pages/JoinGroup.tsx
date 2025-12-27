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
        .from("groups")
        .select("id, name")
        .eq("invite_code", trimmed)
        .maybeSingle();

      if (groupError) throw groupError;
      if (!group) {
        throw new Error("Invalid or expired code.");
      }

      const { error: memberError } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id });

      if (memberError && (memberError as any).code !== "23505") {
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
    onError: (error: any) => {
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}> 
              {"<-"} Back
            </Button>
            <h1 className="mt-2 text-lg font-semibold">Join a group</h1>
            <p className="text-xs text-muted-foreground">
              Enter an invite code or open a shared link to join an existing group.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-8">
        <Card className="p-4 space-y-4">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="invite-code">
            Invite code
          </label>
          <Input
            id="invite-code"
            placeholder="e.g., ABCD1234"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button className="w-full" disabled={joinGroup.isPending} onClick={() => joinGroup.mutate()}>
            Join group
          </Button>
          {codeFromUrl && (
            <p className="text-xs text-muted-foreground">
              This link contains an invite code. Confirm to join the group.
            </p>
          )}
        </Card>
      </main>
    </div>
  );
};

export default JoinGroupPage;
