# Solar project database setup

The Flask backend connects directly to Supabase PostgreSQL using `DATABASE_URL` in the local `.env` file. Every person running their own local copy needs their own Supabase project and PostgreSQL connection string. Never commit `.env` or share its credentials.

## Option A — brand-new Supabase project

1. Create a new Supabase project.
2. Open **SQL Editor**.
3. Run `fresh_install.sql` once.
4. Copy the project's PostgreSQL connection string into a local `.env` file at the repository root:

   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
   ```

5. Install the Python dependencies and start Flask as described in the main README.

`fresh_install.sql` creates the final schema for `prediction_history`, `analysis_sessions`, and `analysis_readings`. Do not run the incremental migration scripts after it.

## Option B — upgrading an existing legacy database

If the database already has the original `prediction_history`, `analysis_sessions`, and `analysis_readings` tables, run these scripts in order in Supabase SQL Editor:

1. `migrations/001_prediction_history_plant_metadata.sql`
2. `migrations/002_analysis_dual_plant.sql`

These scripts preserve existing prediction history and analysis sessions. The second script marks older sessions as Plant 1 legacy sessions and adds the Plant 1 / Plant 2 result fields.

Do not run `fresh_install.sql` against a database that already contains application data. It is for a new, empty project only.

## Security notes

- Keep `.env` out of Git.
- Do not enable public/anonymous access to these tables just to make the browser connect. The browser calls Flask; Flask connects privately to PostgreSQL.
- Use a database connection string intended for your backend and require SSL.
