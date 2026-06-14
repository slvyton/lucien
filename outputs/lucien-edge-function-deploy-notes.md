# LUCIEN Create Member Edge Function

The admin dashboard now calls a Supabase Edge Function named `create-member`.

Local files:

- `supabase/functions/create-member/index.ts`
- `supabase/config.toml`

Deploy with Supabase CLI:

```bash
supabase login
supabase link --project-ref lbwgzorrogzqgpjhttnx
supabase functions deploy create-member
```

The function uses Supabase's built-in environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

After deployment, log into the admin dashboard as an owner/admin, open Members, click New, and create a member with display name, email, and temporary password. The service role key should not be entered into the dashboard anymore.
