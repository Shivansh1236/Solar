-- Upgrade an existing Analysis Desk database to dual-plant comparison.
-- Existing sessions are preserved as legacy Plant 1-only sessions.

BEGIN;

ALTER TABLE public.analysis_sessions
    ADD COLUMN IF NOT EXISTS analysis_mode TEXT,
    ADD COLUMN IF NOT EXISTS selected_plant_id SMALLINT;

UPDATE public.analysis_sessions
SET analysis_mode = 'single',
    selected_plant_id = 1
WHERE analysis_mode IS NULL;

ALTER TABLE public.analysis_sessions
    ALTER COLUMN analysis_mode SET DEFAULT 'comparison',
    ALTER COLUMN analysis_mode SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'analysis_sessions_analysis_mode_check'
          AND conrelid = 'public.analysis_sessions'::regclass
    ) THEN
        ALTER TABLE public.analysis_sessions
            ADD CONSTRAINT analysis_sessions_analysis_mode_check
            CHECK (
                (analysis_mode = 'comparison' AND selected_plant_id IS NULL)
                OR
                (analysis_mode = 'single' AND selected_plant_id IN (1, 2))
            );
    END IF;
END $$;

ALTER TABLE public.analysis_readings
    ADD COLUMN IF NOT EXISTS plant_1_predicted_ac_power DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS plant_2_predicted_ac_power DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS plant_1_model_name TEXT,
    ADD COLUMN IF NOT EXISTS plant_2_model_name TEXT;

UPDATE public.analysis_readings AS readings
SET plant_1_predicted_ac_power = readings.predicted_ac_power,
    plant_1_model_name = 'Random Forest (legacy)'
FROM public.analysis_sessions AS sessions
WHERE readings.session_id = sessions.id
  AND sessions.analysis_mode = 'single'
  AND sessions.selected_plant_id = 1
  AND readings.plant_1_predicted_ac_power IS NULL
  AND readings.predicted_ac_power IS NOT NULL;

COMMIT;
