-- Upgrade an existing legacy database.
-- Existing history rows came from the original Plant 1 Random Forest model.
-- They are retained and marked as legacy rather than being deleted.

BEGIN;

ALTER TABLE public.prediction_history
    ADD COLUMN IF NOT EXISTS plant_id SMALLINT,
    ADD COLUMN IF NOT EXISTS model_name TEXT;

UPDATE public.prediction_history
SET plant_id = 1
WHERE plant_id IS NULL;

UPDATE public.prediction_history
SET model_name = 'Random Forest (legacy)'
WHERE model_name IS NULL OR BTRIM(model_name) = '';

ALTER TABLE public.prediction_history
    ALTER COLUMN plant_id SET NOT NULL,
    ALTER COLUMN model_name SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prediction_history_plant_id_check'
          AND conrelid = 'public.prediction_history'::regclass
    ) THEN
        ALTER TABLE public.prediction_history
            ADD CONSTRAINT prediction_history_plant_id_check
            CHECK (plant_id IN (1, 2));
    END IF;
END $$;

COMMIT;
