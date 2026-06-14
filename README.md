# LUCIEN MVP

Private member portal and LUCIEN Control Room prototype.

## Current Structure

- `outputs/lucien-mvp-design-prototype.html` - working member-facing prototype
- `outputs/lucien-admin-dashboard.html` - working admin/control room prototype
- `deploy/netlify-members/index.html` - Netlify-ready member portal
- `deploy/netlify-admin/index.html` - Netlify-ready admin portal
- `outputs/*.sql` - Supabase schema and upgrade scripts
- `supabase/functions/*` - Supabase Edge Functions

## Local Preview

From this folder:

```bash
python3 -m http.server 8766 --directory outputs
```

Member portal:

```text
http://127.0.0.1:8766/lucien-mvp-design-prototype.html
```

Admin dashboard:

```text
http://127.0.0.1:8766/lucien-admin-dashboard.html
```

## Netlify Deploy Targets

Recommended Netlify setup:

- Member site
  - Base directory: `deploy/netlify-members`
  - Publish directory: `.`
  - Build command: blank

- Admin site
  - Base directory: `deploy/netlify-admin`
  - Publish directory: `.`
  - Build command: blank

When updating the working HTML files, sync them into deploy folders before committing:

```bash
cp outputs/lucien-mvp-design-prototype.html deploy/netlify-members/index.html
cp outputs/lucien-admin-dashboard.html deploy/netlify-admin/index.html
```

## Notes

Do not commit service-role keys, Resend keys, Stripe keys, or local `.env` files. Supabase secrets should stay in Supabase function secrets.
