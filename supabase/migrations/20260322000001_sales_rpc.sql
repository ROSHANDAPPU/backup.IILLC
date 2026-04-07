-- Atomic shift sales incrementer designed specifically to safeguard against race conditions
-- when flusing offline sync queues.
CREATE OR REPLACE FUNCTION public.increment_shift_sales(target_shift_id UUID, amount INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.shifts 
  SET total_sales = COALESCE(total_sales, 0) + amount
  WHERE id = target_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
