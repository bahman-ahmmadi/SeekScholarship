-- Additive schema update for flexible, optional scholarship details.
-- Existing scholarship rows are preserved; custom_sections starts as an empty array.
BEGIN;

ALTER TABLE public.scholarships
    ADD COLUMN IF NOT EXISTS custom_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Allow listings whose awarding country is not specified yet.
ALTER TABLE public.scholarships
    ALTER COLUMN country_code DROP NOT NULL,
    ALTER COLUMN degree DROP NOT NULL,
    ALTER COLUMN field DROP NOT NULL,
    ALTER COLUMN funding DROP NOT NULL,
    ALTER COLUMN gender DROP NOT NULL,
    ALTER COLUMN eligible_countries DROP NOT NULL,
    ALTER COLUMN language_requirement DROP NOT NULL,
    ALTER COLUMN deadline DROP NOT NULL,
    ALTER COLUMN description DROP NOT NULL,
    ALTER COLUMN application DROP NOT NULL,
    ALTER COLUMN application_url DROP NOT NULL;

COMMIT;
