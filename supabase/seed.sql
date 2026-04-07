-- ============================================================
-- AALIYAH ILLUSIONS — CORRECTED HISTORICAL DATA SEED
-- Tailored exactly for our secure schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. SEED VENUES (Schema: is_active boolean instead of status text)
INSERT INTO venues (id, name, is_business_trip, frame_stock, paper_stock, low_stock_threshold, is_active, manager_id)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'MILA',       false, 96,  10, 20, true, '7951e2b7-bb40-40ea-9346-3103c18663d6'),
  ('11111111-0000-0000-0000-000000000002', 'RODEO',      false, 36,  5,  20, true, '7951e2b7-bb40-40ea-9346-3103c18663d6'),
  ('11111111-0000-0000-0000-000000000003', 'TROPHY',     false, 348, 8,  20, true, '7951e2b7-bb40-40ea-9346-3103c18663d6'),
  ('11111111-0000-0000-0000-000000000004', 'VICE PARK',  false, 34,  3,  20, true, '7951e2b7-bb40-40ea-9346-3103c18663d6')
ON CONFLICT (id) DO NOTHING;

-- 2. SEED CORE SHIFTS (Schema: start_time/end_time instead of dates, total_sales, required photographer_id)
INSERT INTO shifts (id, venue_id, photographer_id, status, start_time, end_time, total_sales, commission_rate, commission_pay, notes)
VALUES
  ('aaaaaaaa-0001-0000-0000-000000000031','11111111-0000-0000-0000-000000000001','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-04T23:00:00Z','2026-02-05T00:30:00Z', 9,  3.00, 27.00, NULL),
  ('aaaaaaaa-0001-0000-0000-000000000032','11111111-0000-0000-0000-000000000001','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-09T23:00:00Z','2026-02-10T02:00:00Z', 13, 3.00, 39.00, NULL),
  ('aaaaaaaa-0001-0000-0000-000000000034','11111111-0000-0000-0000-000000000001','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-16T23:00:00Z','2026-02-17T02:00:00Z', 15, 3.00, 45.00, NULL),
  ('dddddddd-0003-0000-0000-000000000040','11111111-0000-0000-0000-000000000003','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-21T22:30:00Z','2026-02-22T02:00:00Z', 34, 4.00, 136.00,'BEST SHIFT — 34 sold (Bonus Tier)!'),
  ('dddddddd-0003-0000-0000-000000000041','11111111-0000-0000-0000-000000000003','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-22T22:30:00Z','2026-02-23T02:00:00Z', 15, 3.00, 45.00,'Added 120 frames'),
  ('dddddddd-0003-0000-0000-000000000043','11111111-0000-0000-0000-000000000003','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-26T23:00:00Z','2026-02-27T02:00:00Z', 22, 3.00, 66.00, NULL),
  ('dddddddd-0003-0000-0000-000000000044','11111111-0000-0000-0000-000000000003','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2026-02-27T23:00:00Z','2026-02-28T02:00:00Z', 25, 3.00, 75.00,'$13 prints on Square'),
  ('cccccccc-0004-0000-0000-000000000001','11111111-0000-0000-0000-000000000004','7951e2b7-bb40-40ea-9346-3103c18663d6','closed','2025-12-31T21:00:00Z','2026-01-01T02:00:00Z', 21, 3.00, 63.00, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. UNIFIED PAYMENTS LEDGER (Combines salary, expenses, and equipment outlays!)
INSERT INTO payments_ledger (id, user_id, entry_type, amount, description, week_number, year, is_paid)
VALUES
  ('eeeeeeee-0001-0000-0000-000000000008','7951e2b7-bb40-40ea-9346-3103c18663d6','hosting_fee', 300.00, 'Hosting fee (01/26-02/01)', 5, 2026, true),
  ('eeeeeeee-0001-0000-0000-000000000009','7951e2b7-bb40-40ea-9346-3103c18663d6','hosting_fee', 300.00, 'Hosting fee (02/02-02/08)', 6, 2026, true),
  ('jjjjjjjj-0001-0000-0000-000000000009','7951e2b7-bb40-40ea-9346-3103c18663d6','commission',  285.00, 'Salary RD (01/26-02/01)', 5, 2026, true),
  ('jjjjjjjj-0001-0000-0000-000000000010','7951e2b7-bb40-40ea-9346-3103c18663d6','commission',  335.00, 'Salary RD (02/02-02/08)', 6, 2026, true),
  ('gggggggg-0001-0000-0000-000000000004','7951e2b7-bb40-40ea-9346-3103c18663d6','expense',     399.00, 'PPS Printer Purchase',    7, 2026, true)
ON CONFLICT (id) DO NOTHING;

-- 4. INSERT A DUMMY DEPOSIT TO LIGHT UP THE MANAGERS VIEW
INSERT INTO deposits (shift_id, photographer_id, image_url, amount, is_confirmed)
VALUES
  ('dddddddd-0003-0000-0000-000000000040', '7951e2b7-bb40-40ea-9346-3103c18663d6', 'https://images.unsplash.com/photo-1598228612001-d07b7b252084?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 850.00, false)
ON CONFLICT DO NOTHING;

-- 5. INSERT A DISCREPANCY TICKET FOR THE ADMIN PORTAL
INSERT INTO discrepancy_tickets (venue_id, shift_id, photographer_id, delta_summary, status)
VALUES
  ('11111111-0000-0000-0000-000000000003', 'dddddddd-0003-0000-0000-000000000044', '7951e2b7-bb40-40ea-9346-3103c18663d6', '{"frames": -1}', 'open')
ON CONFLICT DO NOTHING;
