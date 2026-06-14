# LUCIEN Netlify Setup

## Prepared folders

- Member portal: `deploy/netlify-members`
- Admin dashboard: `deploy/netlify-admin`

Each folder contains an `index.html` file ready for Netlify.

## Recommended setup

Create two Netlify sites:

1. `lucien-members`
   - Deploy folder: `deploy/netlify-members`
   - Current Netlify URL: `https://lucienmember.netlify.app`
   - Custom domain later: `members.houseoflucien.com`

2. `lucien-admin`
   - Deploy folder: `deploy/netlify-admin`
   - Current Netlify URL: `https://lucienadmin.netlify.app`
   - Custom domain later: `admin.houseoflucien.com`

## Fast first deploy

In Netlify:

1. Go to Sites.
2. Choose "Add new site".
3. Choose manual deploy / drag and drop.
4. Drag the whole `deploy/netlify-members` folder for the member portal.
5. Repeat with `deploy/netlify-admin` for the admin dashboard.

This gets the live URLs quickly, but it is still manual for future updates.

## Best ongoing deploy

For automatic updates, put this project in GitHub and connect each Netlify site to the matching folder.

Netlify build settings for the member site:

- Base directory: `deploy/netlify-members`
- Build command: leave blank
- Publish directory: `.`

Netlify build settings for the admin site:

- Base directory: `deploy/netlify-admin`
- Build command: leave blank
- Publish directory: `.`

## After the member URL is live

Set the invite redirect secret to the member portal URL:

```bash
npx supabase secrets set --project-ref lbwgzorrogzqgpjhttnx MEMBER_INVITE_REDIRECT_URL="https://lucienmember.netlify.app"
```

After the custom domain is connected, change this to `https://members.houseoflucien.com`.

## Supabase Auth URL settings

Add the live member portal URL in Supabase Auth redirect URLs:

- `https://members.houseoflucien.com`
- `https://lucienmember.netlify.app`
