-- Automatically move published scholarships to archived after their deadline.
-- This expects scholarships.deadline to be a DATE column; the guard below aborts
-- before changing anything if the deployed column has a different type.
DO $$
DECLARE
    deadline_data_type text;
BEGIN
    SELECT data_type
      INTO deadline_data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'scholarships'
       AND column_name = 'deadline';

    IF deadline_data_type IS DISTINCT FROM 'date' THEN
        RAISE EXCEPTION 'Expected public.scholarships.deadline to be DATE, found %',
            COALESCE(deadline_data_type, 'missing column');
    END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Archive records that have already passed their deadline when this migration runs.
UPDATE public.scholarships
   SET status = 'archived', updated_at = pg_catalog.now()
 WHERE status = 'published'
   AND deadline IS NOT NULL
   AND deadline < (pg_catalog.now() AT TIME ZONE 'Europe/Istanbul')::date;

-- Run shortly after midnight in Istanbul (21:05 UTC on the previous day).
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'archive-expired-scholarships-daily';

SELECT cron.schedule(
    'archive-expired-scholarships-daily',
    '5 21 * * *',
    $job$
        UPDATE public.scholarships
           SET status = 'archived', updated_at = pg_catalog.now()
         WHERE status = 'published'
           AND deadline IS NOT NULL
           AND deadline < (pg_catalog.now() AT TIME ZONE 'Europe/Istanbul')::date;
    $job$
);
