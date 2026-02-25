-- Enable RLS on all tables
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policies for public.leads
-- Allow service_role to do everything
CREATE POLICY "Service Role Full Access" ON public.leads
    FOR ALL USING (auth.role() = 'service_role');

-- Allow anon key to insert (for new leads via webhook if needed, 
-- but ideally service_role handles this)
-- For the Dashboard, we usually use service_role or authenticated users.
-- Assuming the Dashboard is for the owner:
CREATE POLICY "Dashboard Owner Access" ON public.leads
    FOR ALL USING (auth.role() = 'authenticated');

-- Policies for public.chat_history
CREATE POLICY "Service Role Full Access" ON public.chat_history
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Dashboard Owner Access" ON public.chat_history
    FOR ALL USING (auth.role() = 'authenticated');

-- Policies for public.appointments
CREATE POLICY "Service Role Full Access" ON public.appointments
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Dashboard Owner Access" ON public.appointments
    FOR ALL USING (auth.role() = 'authenticated');
