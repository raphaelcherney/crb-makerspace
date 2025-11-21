# CRB Makerspace – 3D Printer Scheduler

A simple, mobile-first single-page web app to reserve 3D printers. Data is stored in Supabase (PostgreSQL database).

- Frontend: static files in `docs/scheduler-app/` (works on GitHub Pages and can be embedded via iframe)
- Backend: Supabase (PostgreSQL database with Row-Level Security)

## Quick Start

### 1) Set up Supabase Database

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (or use your existing project)

2. **Run the schema SQL**:
   - In your Supabase dashboard, go to **SQL Editor**
   - Open and run `schema.sql` from this repo
   - This creates:
     - `printers` table (with `display_name`, `printer_type`, `notes`, `status`)
     - `reservations` table (with proper timestamps)
     - Indexes for performance
     - Row-Level Security (RLS) policies
     - Database functions for overlap checking
     - Initial printer data

3. **Get your Supabase credentials**:
   - Go to **Project Settings** → **Data API**
   - Copy your **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - Go to **Project Settings** → **API Keys**
   - Copy your **anon/public key** (starts with `eyJ...`)

### 2) Configure Frontend

1. **Update `app.js`** with your Supabase credentials:
   ```javascript
   const CONFIG = {
     SUPABASE_URL: 'https://your-project.supabase.co', // Your Project URL
     SUPABASE_ANON_KEY: 'your-anon-key', // Your anon key
     TIMEZONE: 'America/Chicago',
     // ... rest of config
   };
   ```

2. **Test locally**:
   - Open `docs/scheduler-app/index.html` in a browser (or serve via local server)
   - The app will fetch printers from Supabase and display the calendar

### 3) Deploy to GitHub Pages (MkDocs)

1. **Commit and push** your changes

2. **Embed in MkDocs pages**:
   ```html
   <iframe src="../../scheduler-app/index.html" style="width:100%;height:80vh;border:0;" loading="lazy"></iframe>
   ```
   
   Note: Use relative paths (like `../../scheduler-app/index.html`) when embedding from pages in subdirectories to account for the site's base path.

3. The app is available at `/scheduler-app/` on your GitHub Pages site

## Database Schema

### Printers Table
- `id` (UUID, primary key)
- `display_name` (TEXT, unique) - e.g., "R2-3D2"
- `printer_type` (TEXT) - e.g., "Bambu X1C", "Bambu P1S"
- `notes` (TEXT, nullable) - Additional info about the printer
- `status` (TEXT) - One of: `'operational'`, `'down'`, `'maintenance'`, `'reserved'`
- `is_active` (BOOLEAN) - Whether the printer appears in the scheduler
- `created_at`, `updated_at` (timestamps)

### Reservations Table
- `id` (UUID, primary key)
- `printer_id` (UUID, foreign key to printers)
- `start_at` (TIMESTAMPTZ) - Start time in Chicago timezone
- `end_at` (TIMESTAMPTZ) - End time in Chicago timezone
- `status` (TEXT) - One of: `'confirmed'`, `'cancelled'`, `'completed'`
- `user_name` (TEXT) - User's name (PII, not returned in public queries)
- `user_contact` (TEXT) - Email or phone (PII, not returned in public queries)
- `lab` (TEXT, nullable) - Lab/program name
- `material` (TEXT, nullable) - Filament material
- `notes` (TEXT, nullable) - Additional notes
- `created_at`, `updated_at` (timestamps)

### Constraints
- Minimum duration: 30 minutes
- Maximum duration: 168 hours (7 days)
- Time slots must be in 30-minute increments
- No overlapping reservations for the same printer

## Security (Row-Level Security)

- **Public read access**: Anyone can view reservation times (without PII) and operational printers
- **Public write access**: Anyone can create reservations
- **PII protection**: `user_name`, `user_contact`, `lab`, `material`, and `notes` are stored but never returned in public queries (via the `public_reservations` view)

## API (Direct Supabase Client)

The frontend uses the Supabase JavaScript client directly. No custom API endpoints needed.

### Key Functions

- **`fetchPrinters()`**: Fetches active, operational printers from the `printers` table
- **`fetchReservations(date)`**: Fetches reservations that overlap with a given date
- **`createReservation(data)`**: Creates a new reservation with overlap checking

### Overlap Detection

The database function `check_reservation_overlap()` ensures no two confirmed reservations overlap for the same printer. This happens server-side for security and accuracy.

## Timezone Handling

- All timestamps are stored as `TIMESTAMPTZ` (timezone-aware)
- The `chicago_timestamp()` function converts date + time strings to proper timestamps in the `America/Chicago` timezone
- The frontend displays times in Chicago timezone using `Intl.DateTimeFormat`

## Managing Printers

You can manage printers directly in the Supabase dashboard:

1. Go to **Table Editor** → **printers**
2. Add new printers, update status, or edit notes
3. Set `is_active = false` to hide a printer from the scheduler
4. Set `status = 'down'` or `'maintenance'` to temporarily disable reservations

### Changing Printer Order

Printers are ordered by the `sort_order` column (lower numbers appear first, left to right).

**To change the order:**

1. Go to **Table Editor** → **printers**
2. Edit the `sort_order` value for each printer:
   - Lower numbers appear first (left to right)
   - Example: `sort_order = 1` appears before `sort_order = 2`
   - You can use any integers (1, 2, 3, 10, 20, etc.) to allow reordering later
3. Save the changes - the UI will automatically update

## Performance

- **Indexed queries**: Fast lookups by printer and date range
- **Efficient overlap checks**: Database function performs overlap detection server-side
- **No cold starts**: Unlike Google Apps Script, Supabase has no cold start delays
- **Typical response time**: 50-200ms (vs 1-5 seconds with Google Sheets)

## Troubleshooting

### Printers not showing
- Check that printers have `is_active = true` and `status = 'operational'`
- Verify your Supabase credentials in `app.js`
- Check browser console for errors

### Reservations not loading
- Verify RLS policies are enabled
- Check that the `public_reservations` view exists and is accessible
- Check browser console for Supabase errors

### Overlap errors
- The database enforces no overlaps for confirmed reservations
- Check that `check_reservation_overlap()` function exists
- Verify timezone handling is correct

### CORS issues
- Supabase handles CORS automatically for public access
- Ensure your `SUPABASE_ANON_KEY` is correct
- Check that RLS policies allow public access

## Preventing Supabase Project Pause (Keepalive)

Free Supabase projects are paused after 1 week of inactivity. This repository includes a GitHub Actions workflow that runs daily to keep the project active.

### Setting Up the Keepalive Workflow

1. **Add GitHub Secrets**:
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Add the following secrets:
     - `SUPABASE_URL`: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
     - `SUPABASE_ANON_KEY`: Your Supabase anon/public key (starts with `eyJ...`)

2. **Verify the Workflow**:
   - The workflow is located at `.github/workflows/supabase-keepalive.yml`
   - It runs daily at 2:00 AM UTC
   - You can manually trigger it from the **Actions** tab in GitHub
   - The workflow makes a simple query to the `printers` table to count as activity

3. **Monitor the Workflow**:
   - Check the **Actions** tab to ensure the workflow runs successfully
   - If it fails, verify that your GitHub secrets are set correctly

## Notes

- Time resolution is 30 minutes, 24-hour view
- Client performs a simple overlap check for UX; server is authoritative
- No cookies or credentials used (public access via anon key)
- Submitted PII (name and contact) is stored in database but protected by RLS policies
