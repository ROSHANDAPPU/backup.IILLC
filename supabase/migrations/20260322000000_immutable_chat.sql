-- 1. Create the Recipient Scope Enum
CREATE TYPE public.recipient_scope AS ENUM ('individual', 'venue', 'all_photographers', 'all_staff');

-- 2. Create the Messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(user_id),
    shift_id UUID REFERENCES public.shifts(id),
    venue_id UUID REFERENCES public.venues(id),
    recipient_scope public.recipient_scope NOT NULL DEFAULT 'individual',
    is_broadcast BOOLEAN DEFAULT false,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Immutability Trigger Guarantee (Function MUST be defined before trigger)
CREATE OR REPLACE FUNCTION public.prevent_message_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Messages are immutable for accountability. They cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_update_messages
BEFORE UPDATE OR DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.prevent_message_modification();

-- 4. Enable Row Level Security (Messages)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies (Messages)
-- Users can only insert messages as themselves
CREATE POLICY "Users can insert their own messages" ON public.messages 
FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Admins get full read access
CREATE POLICY "Admins have full access" ON public.messages
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Photographers / Assistants can read messages tied to their active shifts OR global broadcasts
-- This securely uses a JOIN to shifts via shift_id
CREATE POLICY "Field staff read scope" ON public.messages 
FOR SELECT USING (
  (shift_id IN (SELECT id FROM public.shifts WHERE photographer_id = auth.uid()))
  OR (is_broadcast = true AND (
       recipient_scope = 'all_staff' OR 
       (recipient_scope = 'all_photographers' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'photographer'))
     ))
  OR (venue_id IN (SELECT venue_id FROM public.shifts WHERE photographer_id = auth.uid()))
);

-- Managers can read messages tied to their assigned venues OR global broadcasts
CREATE POLICY "Managers read scope" ON public.messages 
FOR SELECT USING (
  (venue_id IN (SELECT id FROM public.venues WHERE manager_id = auth.uid()))
  OR (is_broadcast = true AND recipient_scope = 'all_staff')
);

-- 6. Add Read Receipts Table
CREATE TABLE public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- 7. Enable RLS & Policies (Read Receipts)
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Users can insert their own read receipts
CREATE POLICY "Users can insert own reads" ON public.message_reads 
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can read receipts for messages they are authorized to see (via join matching messages SELECT filter)
CREATE POLICY "Users can view reads for visible messages" ON public.message_reads
FOR SELECT USING (
  user_id = auth.uid()
);

-- 8. Add both tables to Realtime Publication directly natively
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages, public.message_reads;
