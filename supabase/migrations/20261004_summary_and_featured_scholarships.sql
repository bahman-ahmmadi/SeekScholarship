-- Additive fields for custom summary entries and Home featured selection.
-- Existing scholarship content and RLS policies are preserved.
BEGIN;

ALTER TABLE public.scholarships
    ADD COLUMN IF NOT EXISTS summary_details jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
    featured_column_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scholarships'
          AND column_name = 'is_featured'
    ) INTO featured_column_exists;

    ALTER TABLE public.scholarships
        ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

    -- Preserve today's Home results only on first creation. Re-running this file
    -- will not override an admin's later featured/unfeatured choices.
    IF NOT featured_column_exists THEN
        UPDATE public.scholarships
        SET is_featured = true
        WHERE status = 'published';
    END IF;
END $$;

COMMIT;
