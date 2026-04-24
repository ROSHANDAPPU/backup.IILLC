-- RPC Fix for Spoofing
CREATE OR REPLACE FUNCTION increment_shift_sales(shift_id UUID, amount INT)
RETURNS void AS $$
BEGIN
  IF amount < 1 OR amount > 10 THEN
    RAISE EXCEPTION 'Invalid sale amount: %', amount;
  END IF;
  
  UPDATE shifts
  SET total_sales = total_sales + amount
  WHERE id = shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add deposit dual-authorization columns
ALTER TABLE deposits 
ADD COLUMN IF NOT EXISTS admin_reviewed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS admin_reviewed_by UUID REFERENCES auth.users(id);

-- Photographer Performance Baseline View
CREATE OR REPLACE VIEW photographer_performance_baseline AS
SELECT 
  p.full_name,
  v.name as venue,
  AVG(s.total_sales) as avg_sales,
  COUNT(s.id) as total_shifts,
  AVG(
    (ie.total_frames - iend.total_frames)::float / 
    NULLIF(s.total_sales, 0)
  ) as frames_per_sale
FROM shifts s
JOIN profiles p ON p.user_id = s.photographer_id
JOIN venues v ON v.id = s.venue_id
LEFT JOIN inventory_start ie ON ie.shift_id = s.id
LEFT JOIN inventory_end iend ON iend.shift_id = s.id
WHERE s.status = 'closed'
GROUP BY p.full_name, v.name;
