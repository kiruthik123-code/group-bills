import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

interface UserSummary {
  id: string;
  full_name: string | null;
}

interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

const ChatPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>([]);

  const { data: results } = useQuery<UserSummary[]>({
    queryKey: ["chat-search", search, user?.id],
    enabled: !!user && search.trim().length >= 2,
    queryFn: async () => {
      const term = search.trim();
      if (!user || term.length < 2) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("full_name", `%${term}%`)
        .neq("id", user.id);

      if (error) throw error;
      return (data ?? []) as UserSummary[];
    },
  });

  const otherUserId = useMemo(() => selectedUser?.id ?? null, [selectedUser]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!user || !otherUserId) return;
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, receiver_id, content, created_at")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        return;
      }
      setMessages((data as DirectMessage[]) ?? []);
    };

    loadMessages();

    if (!user || !otherUserId) return;

    const channel = supabase
      .channel(`direct_messages:${user.id}:${otherUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const dm = payload.new as DirectMessage;
          if (
            (dm.sender_id === user.id && dm.receiver_id === otherUserId) ||
            (dm.sender_id === otherUserId && dm.receiver_id === user.id)
          ) {
            setMessages((prev) => [...prev, dm]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, otherUserId]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Please sign in to chat.</p>
      </div>
    );
  }

  const handleSend = async () => {
    if (!message.trim() || !otherUserId) return;

    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: otherUserId,
        content: message.trim(),
      });

      if (error) throw error;
      setMessage("");
    } catch (error: any) {
      toast({
        title: "Cannot send message",
        description:
          error.message ||
          "You can only chat with users who share at least one group with you.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col pb-20">
        <header className="sticky top-0 z-10 bg-white/50 px-4 py-4 backdrop-blur-md">
          <h1 className="text-lg font-semibold text-foreground">Messages</h1>
        </header>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Search by name (only people from your groups)
            </p>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Start typing a name..."
            />
            {search.trim().length >= 2 && results && results.length > 0 && (
              <Card className="mt-2 max-h-48 overflow-y-auto">
                <ul className="divide-y">
                  {results.map((u) => (
                    <li
                      key={u.id}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => {
                        setSelectedUser(u);
                        setSearch(u.full_name || "");
                      }}
                    >
                      {u.full_name || "Friend"}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {selectedUser && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Chatting with <span className="font-medium">{selectedUser.full_name}</span>
              </p>
              <Card className="h-72 overflow-y-auto space-y-2 p-3 bg-muted/40">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.sender_id === user.id ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-xs ${
                        m.sender_id === user.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    No messages yet. Say hi!
                  </p>
                )}
              </Card>

              <div className="flex items-center gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button onClick={handleSend}>Send</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
