-- 1. Add audit fields to shifts
ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS assistant_clock_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assistant_clock_out TIMESTAMPTZ;

-- 2. Create partial unique index to prevent duplicate active/pending shifts per photographer
CREATE UNIQUE INDEX IF NOT EXISTS one_active_shift_per_photo 
ON public.shifts (photographer_id) 
WHERE status IN ('pending', 'active');

-- 3. Create Assistant Logs table to handle check-ins, discrepancies, and evidence
CREATE TABLE IF NOT EXISTS public.assistant_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  assistant_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in', 'inventory_check', 'issue_report', 'evidence', 'clock_in', 'clock_out')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assistant can view and create logs" 
ON public.assistant_logs FOR ALL 
USING (assistant_id = auth.uid());

CREATE POLICY "Admins read all assistant logs" 
ON public.assistant_logs FOR SELECT 
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

