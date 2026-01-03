-- Create chat_rooms table
CREATE TABLE chat_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Group Chat',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id)
);

-- Create chat_messages table
CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_chat_messages_chat_room_id ON chat_messages(chat_room_id);
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Enable RLS
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view chat rooms in their groups"
  ON chat_rooms FOR SELECT
  USING (
    group_id IN (
      SELECT group_id 
      FROM group_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view messages in their chat rooms"
  ON chat_messages FOR SELECT
  USING (
    chat_room_id IN (
      SELECT cr.id
      FROM chat_rooms cr
      JOIN group_members gm ON cr.group_id = gm.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in their chat rooms"
  ON chat_messages FOR INSERT
  WITH CHECK (
    chat_room_id IN (
      SELECT cr.id
      FROM chat_rooms cr
      JOIN group_members gm ON cr.group_id = gm.group_id
      WHERE gm.user_id = auth.uid()
    )
    AND auth.uid() = sender_id
  );