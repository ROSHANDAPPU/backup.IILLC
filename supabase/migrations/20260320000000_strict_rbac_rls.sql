-- Migration to enforce strict Role-Based Access Control (RBAC) isolation
-- Fixes holes where Managers could read inventory or logs for venues they don't manage

-- 1. Fix interval_logs (Managers should only see logs for shifts at THEIR venues)
DROP POLICY IF EXISTS "Manager read logs" ON public.interval_logs;
CREATE POLICY "Manager read logs" ON public.interval_logs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'manager') 
    AND EXISTS (
      SELECT 1 FROM public.shifts s 
      JOIN public.venues v ON s.venue_id = v.id
      WHERE s.id = interval_logs.shift_id AND v.manager_id = auth.uid()
    )
  );

-- 2. Fix inventory_start (Managers should only see start inventory for THEIR venues)
DROP POLICY IF EXISTS "Manager read inv_s" ON public.inventory_start;
CREATE POLICY "Manager read inv_s" ON public.inventory_start
  FOR SELECT USING (
    public.has_role(auth.uid(), 'manager') 
    AND EXISTS (
      SELECT 1 FROM public.shifts s 
      JOIN public.venues v ON s.venue_id = v.id
      WHERE s.id = inventory_start.shift_id AND v.manager_id = auth.uid()
    )
  );

-- 3. Fix inventory_end (Managers should only see end inventory for THEIR venues)
DROP POLICY IF EXISTS "Manager read inv_e" ON public.inventory_end;
CREATE POLICY "Manager read inv_e" ON public.inventory_end
  FOR SELECT USING (
    public.has_role(auth.uid(), 'manager') 
    AND EXISTS (
      SELECT 1 FROM public.shifts s 
      JOIN public.venues v ON s.venue_id = v.id
      WHERE s.id = inventory_end.shift_id AND v.manager_id = auth.uid()
    )
  );

-- 4. Secure Venues (Managers should only see their assigned venues, unless they are Admin)
-- Photographers/Assistants might need to see venues, but let's restrict it strictly.
-- Actually, we'll leave Auth read venues for now to allow Photographers to see Shift locations,
-- but we enforce the isolation in the front-end queries for Managers.

-- 5. Deposits (Managers must see deposits for THEIR venues to confirm them)
DROP POLICY IF EXISTS "Manager read dep" ON public.deposits;
CREATE POLICY "Manager read dep" ON public.deposits
  FOR SELECT USING (
    public.has_role(auth.uid(), 'manager') 
    AND EXISTS (
      SELECT 1 FROM public.shifts s 
      JOIN public.venues v ON s.venue_id = v.id
      WHERE s.id = deposits.shift_id AND v.manager_id = auth.uid()
    )
  );
-- Managers can update deposits (to confirm them)
DROP POLICY IF EXISTS "Manager update dep" ON public.deposits;
CREATE POLICY "Manager update dep" ON public.deposits
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'manager') 
    AND EXISTS (
      SELECT 1 FROM public.shifts s 
      JOIN public.venues v ON s.venue_id = v.id
      WHERE s.id = deposits.shift_id AND v.manager_id = auth.uid()
    )
  );
