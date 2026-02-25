-- ================================================
-- PHASE 3: Knowledge Base Expansion
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Expand knowledge_documents with categories and metadata
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'documents'
  CHECK (category IN ('company_info', 'products', 'faq', 'documents', 'media'));

ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Index for category filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category ON public.knowledge_documents(tenant_id, category);

-- 3. Storage bucket for knowledge files (PDFs, images)
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage RLS: tenant members can upload/read their own files
CREATE POLICY "Tenant knowledge upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files');

CREATE POLICY "Tenant knowledge read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-files');

CREATE POLICY "Tenant knowledge delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-files');
