# Lucien — Project Handoff
*Last updated: June 18, 2026*

## What This Is
Lucien is a private membership society platform. Two user types: **admin** (Mike) and **members**. Two member acquisition flows: admin quick-invite (pre-approved, charged immediately) and member referral (applies, admin approves, card charged on approval).

## Live URLs
- Member portal: `https://houseoflucien.com` → `deploy/netlify-members/index.html`
- Admin dashboard: `https://houseoflucien.com/lucien-admin-dashboard.html`
- Privacy policy: `https://houseoflucien.com/privacy`
- Hosting: Netlify, auto-deploys from `slvyton/lucien` GitHub repo (public), `deploy/netlify-members/` folder

## Repo & File Structure
```
/Users/mikeh/Documents/Codex/2026-06-10/files-mentioned-by-the-user-lucien/
├── outputs/
│   ├── lucien-mvp-design-prototype.html   ← member portal source (~5200 lines)
│   └── lucien-admin-dashboard.html         ← admin dashboard source (~2700 lines)
├── deploy/
│   └── netlify-members/
│       ├── index.html                      ← member portal (synced from outputs/)
│       ├── lucien-admin-dashboard.html     ← admin dashboard (synced from outputs/)
│       └── privacy.html                    ← privacy policy
└── supabase/
    └── functions/
        ├── create-payment-intent/          ← Stripe PaymentIntent for admin-invite flow
        ├── create-setup-intent/            ← Stripe SetupIntent for referral card-save flow
        ├── create-setup-session/           ← legacy, kept for compat
        ├── create-checkout-session/        ← legacy, kept for compat
        ├── charge-member/                  ← admin charges saved card (referral approval)
        ├── create-member/                  ← creates Supabase auth user
        ├── delete-member/                  ← deletes member
        ├── send-member-invite/             ← sends invite email via Resend
        ├── send-newsletter/                ← newsletter blast
        └── stripe-webhook/                 ← handles payment_intent.succeeded, setup_intent.succeeded, checkout.session.completed
```

## Infrastructure
| Service | Purpose | Project/Key |
|---------|---------|-------------|
| Supabase | DB, Auth, Edge Functions | project ref: `lbwgzorrogzqgpjhttnx` |
| Stripe | Payments | test keys configured as Supabase secrets |
| Resend | Transactional email | invite emails |
| Netlify | Hosting | auto-deploy on push to main |
| GitHub | Source control | `slvyton/lucien` (public) |

**Supabase Auth:**
- Site URL: `https://houseoflucien.com`
- Redirect URLs: `https://houseoflucien.com/**`

**CLI rule:** Always use `npx supabase` not `supabase`. Deploy functions from the project root.

**Commit rule:** No `Co-Authored-By` lines in commits — Netlify contributor limit issue.

**Editing rule:** Both HTML files are 2500–5200 lines. Use Python `str.replace()` via Bash for all edits. The Edit tool fails on files this large.

## Database Tables (key ones)
- `profiles` — one row per member (display_name, email, phone, city, company, contact_preference)
- `memberships` — membership status, tier (Sage=$550/qtr, Emerald=$2500/qtr), billing_status
- `member_onboarding` — full application data + Stripe IDs (stripe_customer_id, stripe_payment_method_id, payment_status)
- `referrals` — referral applicants before approval (no profile row exists yet)
- `events` — society events
- `user_roles` — admin/owner roles
- `audit_logs` — admin action log

**`member_onboarding.payment_status` values:**
- `pending` — form submitted, no payment yet
- `card_saved` — referral applicant saved card, awaiting admin approval
- `paid` — charged successfully

## The Two Member Flows

### Flow A: Admin Quick Invite (pre-approved)
1. Admin fills "Quick Invite" form in dashboard → calls `create-member` + `send-member-invite`
2. Member gets email → clicks link → lands on houseoflucien.com
3. Member sets password (`completeInviteSetup()`) → onboarding form opens
4. Member fills form (`submitAcceptedOnboarding()`) → writes to `profiles`, `member_onboarding` (payment_status=pending), `memberships`
5. Payment modal opens with Stripe Elements (`openLucienPayModal({mode:'payment'})`) → immediate charge
6. `payment_intent.succeeded` webhook fires → activates membership (status=active, billing_status=paid)
7. Portal opens automatically after payment (no redirect needed)

### Flow B: Member Referral (apply → admin approves → charge)
1. Existing member shares referral link: `houseoflucien.com?ref=CODE&tier=Sage`
2. Applicant fills public referral form (`submitPublicReferral()`) → inserts into `referrals` table
3. Admin sees pending referral in dashboard → reviews
4. If applicant has saved card: admin clicks "Approve & Charge" → calls `charge-member` edge function → charges saved card → activates membership
5. If no card yet: admin clicks "Approve — Request Payment" → sends invite email → applicant sets password → saves card via SetupIntent → admin then charges

**Card save flow:** `openCardSetup()` → `create-setup-intent` edge function → Stripe Elements in setup mode → `setup_intent.succeeded` webhook saves `stripe_payment_method_id` to `member_onboarding`, sets payment_status=card_saved

## Key Frontend Functions (member portal)

| Function | What it does |
|----------|-------------|
| `doLogin()` | Auth login |
| `completeInviteSetup()` | Set password for invited member, then enter portal + open onboarding |
| `submitAcceptedOnboarding()` | Save profile/onboarding/memberships, unlock payment |
| `openLucienPayModal({mode, tier})` | Mount Stripe Elements (mode: 'payment' or 'setup') |
| `lpmSubmit()` | Terms check → confirmPayment or confirmSetup → on success enter portal |
| `openPublicReferral()` | Show referral application form (hides entry screen) |
| `submitPublicReferral()` | Validate + insert to referrals table |
| `openCardSetup(tier, referralCode)` | Setup Intent flow for referral card save |
| `doPasswordReset()` | Forgot password via Supabase resetPasswordForEmail |
| `loadPortalData()` | Fetch events, directory, notifications |
| `loadMemberData()` | Fetch this member's profile/membership/onboarding |

## Key Admin Functions

| Function | What it does |
|----------|-------------|
| `loadMembers()` | Fetch all profiles, memberships, onboarding from DB |
| `viewMember(id)` | Open dossier — NOW re-fetches live data for that member from DB before rendering |
| `memberDossierHTML(profileId)` | Render full member dossier with dynamic payment status |
| `quickInviteMember()` | Create member + send invite (duplicate email check included) |
| `approveAndCharge(id)` | Charge saved card via charge-member edge function |
| `approveAndInvitePayment(id)` | Mark approved + send payment invite (no card on file path) |
| `deleteMember(id)` | Two-step: confirm dialog → type "confirm" → delete |

## What's Working
- Full admin-invite flow (invite → password → onboarding → pay → portal)
- Stripe Elements embedded in portal (no redirect, Lucien branding preserved)
- Webhook handling for payment_intent.succeeded and setup_intent.succeeded
- Admin dossier: dynamic payment status, live refresh on open, ↺ Refresh button
- Referral link flow with card save
- Privacy policy at /privacy
- Post-payment auto-enters portal (no manual step)
- Duplicate email checks on invite + referral submission
- Mobile-responsive payment modal
- Terms of service checkbox gates payment
- Membership terms modal
- Password reset flow
- Delete confirmation (type "confirm")
- Tier selection pre-populated from ?tier= URL param
- Member directory visibility flag
- Notification center

## What's NOT Done Yet (priority order)

### 1. End-to-end test (do this first)
Test the full admin-invite flow with Stripe test card `4242 4242 4242 4242`:
- Invite email arrives ✓?
- Link goes to houseoflucien.com (not localhost) ✓?
- Password set → onboarding saved → payment processed ✓?
- Portal opens after payment ✓?
- Admin dossier shows Paid + correct data ✓?

### 2. Referral applicant data in admin
When a referral applicant submits, their data is in the `referrals` table only. The admin requests/approvals tab doesn't show their full application details (why they want to join, etc.). Need to pull and display `referrals` row data in the approval view.

### 3. Quarterly recurring billing
Right now payment is one-time. Members need to be charged every 90 days. Options:
- **Stripe Subscriptions** (cleanest — Stripe handles retries, dunning, receipts)
- **Cron + charge-member** (more control, more work — scheduled job calls charge-member for all active members every quarter)

### 4. Member referral link in portal
Members should be able to see and copy their personal referral link from inside the portal. Currently the referral system exists but members have no UI to access their code.

### 5. Member directory
The directory section in the portal — is it populated from real `profiles` data or placeholder? Needs to query `profiles` where `is_directory_visible = true` and `memberships.status = 'active'`.

## Stripe Config Notes
- Test publishable key: `pk_test_51NTsUPGAyuVN3rlqzmZN7Ek6Tu7z98PRqBRuaM1E0ggXLw8JXQ4CgG5srTKAEDKt70EI3UxBaP9H7SWWvDX2Fg6x007nmdiu5V`
- Secret key + webhook secret stored as Supabase secrets (not in repo)
- Webhook endpoint: your Supabase edge function URL for `stripe-webhook`
- Webhook events configured: `checkout.session.completed`, `payment_intent.succeeded`, `setup_intent.succeeded`
- Tier prices: Sage = $550/qtr (55000 cents), Emerald = $2500/qtr (250000 cents)

## Tiers
| Tier | Price |
|------|-------|
| Sage | $550/quarter |
| Emerald | $2,500/quarter |
