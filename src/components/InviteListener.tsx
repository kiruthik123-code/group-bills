import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface PendingInvite {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
}

export const InviteListener = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`group_invites:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_invites",
          filter: `invitee_id=eq.${user.id}`,
        },
        async (payload) => {
          const invite = payload.new as any;

          // Fetch inviter name and group name for the message
          const [{ data: inviter }, { data: group }] = await Promise.all([
            supabase
              .from("profiles")
              .select("full_name")
              .eq("id", invite.inviter_id)
              .maybeSingle(),
            supabase
              .from("groups")
              .select("name")
              .eq("id", invite.group_id)
              .maybeSingle(),
          ]);

          const inviterName = inviter?.full_name || "Someone";
          const groupName = group?.name || "a group";

          setPendingInvite({
            id: invite.id,
            group_id: invite.group_id,
            inviter_id: invite.inviter_id,
            invitee_id: invite.invitee_id,
          });
          setMessage(`${inviterName} invited you to join ${groupName}. Do you want to join?`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user || !pendingInvite) return null;

  const handleAccept = async () => {
    try {
      await supabase.from("group_members").insert({
        group_id: pendingInvite.group_id,
        user_id: user.id,
      });

      await supabase
        .from("group_invites")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", pendingInvite.id);

      toast({
        title: "Joined group",
        description: "You're now a member of this group.",
      });
      navigate(`/groups/${pendingInvite.group_id}`);
    } catch (error: any) {
      toast({
        title: "Could not join group",
        description: error.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPendingInvite(null);
    }
  };

  const handleDecline = async () => {
    try {
      await supabase
        .from("group_invites")
        .update({ status: "declined", responded_at: new Date().toISOString() })
        .eq("id", pendingInvite.id);
    } catch {
      // ignore errors on decline
    } finally {
      setPendingInvite(null);
    }
  };

  return (
    <AlertDialog open={!!pendingInvite} onOpenChange={(open) => !open && setPendingInvite(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Group Invitation</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDecline}>Decline</AlertDialogCancel>
          <AlertDialogAction onClick={handleAccept}>Accept</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
