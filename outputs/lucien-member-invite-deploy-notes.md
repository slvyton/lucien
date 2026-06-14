# LUCIEN Member Invite Deployment Notes

Run these when you are ready to test direct admin invites.

## 1. SQL

Run:

```sql
-- outputs/lucien-member-invite-upgrade.sql
-- outputs/lucien-member-onboarding-upgrade.sql
```

This creates `public.member_invites` so invite sends can be tracked, plus `public.member_onboarding` for accepted invite setup before Stripe is connected.

## 2. Function Secrets

Set these Supabase function secrets:

```bash
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set MEMBER_INVITE_FROM_EMAIL="LUCIEN <members@houseoflucien.com>"
supabase secrets set NEWSLETTER_FROM_EMAIL="LUCIEN <members@houseoflucien.com>"
supabase secrets set MEMBER_INVITE_REDIRECT_URL="https://your-member-portal-url"
```

For early testing, `onboarding@resend.dev` is fine if your Resend account supports it. Later, use a verified LUCIEN domain email.
The function automatically adds `?onboarding=1` to the redirect URL so accepted invitees land in the setup flow.

## 3. Deploy

```bash
supabase functions deploy send-member-invite
```

## 4. Test

In the admin dashboard:

1. Open Members.
2. Confirm the member has an email.
3. Click `Send Invite`.
4. Check the member inbox.
5. Check `public.member_invites` for the send record.

Expected behavior:

- Admin must be logged in and have `owner` or `admin` role.
- The function creates a Supabase recovery link for the already-created member profile.
- Resend sends the email.
- The link routes the member into accepted onboarding.
- `member_invites` stores queued/sent/failed status.
- Membership status moves to `invited` unless the member is already active.
