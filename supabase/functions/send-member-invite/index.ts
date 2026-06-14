import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface NextEvent {
  title: string;
  date_label: string;
  location: string;
  summary: string;
}

function inviteHtml(displayName: string, inviteLink: string, nextEvent?: NextEvent) {
  const greeting = displayName ? `Dear ${displayName},` : "Dear Member,";
  const portalUrl = inviteLink; // after setup they land in the portal

  const eventHero = nextEvent ? `
        <!-- Event Hero -->
        <tr>
          <td style="background:#0f1c16;border:1px solid rgba(200,168,107,0.28);border-bottom:0;padding:36px 40px 0">
            <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:8px;letter-spacing:0.32em;text-transform:uppercase;color:rgba(200,168,107,0.5)">Next Gathering</p>
            <h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:24px;font-weight:400;letter-spacing:0.05em;color:#e8e2d6;line-height:1.2">${nextEvent.title}</h2>
            <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#c8a86b">${nextEvent.date_label}</p>
            <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(196,186,168,0.5)">${nextEvent.location}</p>
            <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:14px;font-weight:300;color:rgba(196,186,168,0.75);line-height:1.65;font-style:italic">${nextEvent.summary}</p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px">
              <tr>
                <td>
                  <a href="${inviteLink}" style="display:inline-block;border:1px solid rgba(200,168,107,0.55);color:#c8a86b;font-family:Arial,sans-serif;font-size:8px;letter-spacing:0.26em;text-transform:uppercase;text-decoration:none;padding:11px 22px">View Event</a>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:1px;background:rgba(200,168,107,0.14);font-size:0">&nbsp;</td></tr>
            </table>
          </td>
        </tr>` : '';

  const cardBorderTop = nextEvent ? 'border-top:0;' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your LUCIEN Invitation</title>
</head>
<body style="margin:0;padding:0;background:#0a1410;font-family:Georgia,'Times New Roman',serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a1410;min-height:100vh">
  <tr>
    <td align="center" style="padding:52px 16px 40px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">

        <!-- Wordmark header -->
        <tr>
          <td align="center" style="padding-bottom:36px">
            <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:0.42em;color:#c8a86b;text-transform:uppercase;margin-bottom:8px">LUCIEN</div>
            <table cellpadding="0" cellspacing="0" border="0" align="center"><tr>
              <td style="height:1px;width:32px;background:rgba(200,168,107,0.3);font-size:0">&nbsp;</td>
              <td style="padding:0 10px;font-family:Arial,sans-serif;font-size:7px;letter-spacing:0.35em;text-transform:uppercase;color:rgba(200,168,107,0.38)">A PRIVATE SOCIETY</td>
              <td style="height:1px;width:32px;background:rgba(200,168,107,0.3);font-size:0">&nbsp;</td>
            </tr></table>
          </td>
        </tr>

        ${eventHero}

        <!-- Body card -->
        <tr>
          <td style="background:#111e18;border:1px solid rgba(200,168,107,0.22);${cardBorderTop}padding:44px 40px">

            <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(200,168,107,0.55)">Private Invitation</p>
            <h1 style="margin:0 0 30px;font-family:Georgia,serif;font-size:28px;font-weight:400;letter-spacing:0.04em;color:#e8e2d6;line-height:1.2">Your Access<br>Has Been Prepared.</h1>

            <p style="margin:0 0 16px;font-size:16px;color:#c4baa8;line-height:1.75">${greeting}</p>
            <p style="margin:0 0 16px;font-size:16px;color:#c4baa8;line-height:1.75">You have been extended a private invitation to LUCIEN — a society built for those who value discretion, depth of connection, and access arranged quietly.</p>
            <p style="margin:0 0 36px;font-size:16px;color:#c4baa8;line-height:1.75">Use the link below to set your credentials and step inside.</p>

            <!-- Primary CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px">
              <tr>
                <td align="center">
                  <a href="${inviteLink}" style="display:inline-block;background:#c8a86b;color:#0a1410;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;text-decoration:none;padding:16px 44px">Enter LUCIEN</a>
                </td>
              </tr>
            </table>

            <!-- Divider with ornament -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px">
              <tr>
                <td style="height:1px;background:rgba(200,168,107,0.15);font-size:0" width="45%">&nbsp;</td>
                <td align="center" style="font-family:Georgia,serif;font-size:12px;color:rgba(200,168,107,0.3);padding:0 12px">✦</td>
                <td style="height:1px;background:rgba(200,168,107,0.15);font-size:0" width="45%">&nbsp;</td>
              </tr>
            </table>

            <p style="margin:0 0 28px;font-size:13px;color:rgba(196,186,168,0.5);line-height:1.65">This link is personal to you. If it expires before you have a chance to use it, your concierge can arrange a fresh invitation at any time.</p>

            <!-- What awaits -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;border:1px solid rgba(200,168,107,0.12);background:rgba(200,168,107,0.04)">
              <tr><td style="padding:20px 22px">
                <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:8px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(200,168,107,0.5)">Within the Society</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:6px 0;border-bottom:1px solid rgba(200,168,107,0.08);font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.1em;color:rgba(196,186,168,0.65)">— Curated member events &amp; retreats</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;border-bottom:1px solid rgba(200,168,107,0.08);font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.1em;color:rgba(196,186,168,0.65)">— Private member directory</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;border-bottom:1px solid rgba(200,168,107,0.08);font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.1em;color:rgba(196,186,168,0.65)">— Personal concierge service</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.1em;color:rgba(196,186,168,0.65)">— Exclusive partner benefits</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <p style="margin:0;font-family:Georgia,serif;font-size:14px;letter-spacing:0.16em;color:rgba(200,168,107,0.45)">LUCIEN</p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:28px">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:7.5px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(196,186,168,0.22);line-height:2">This invitation was arranged privately &nbsp;·&nbsp; Please do not forward it</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function withOnboardingParam(url: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("onboarding", "1");
    return parsed.toString();
  } catch (_err) {
    return url;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("MEMBER_INVITE_FROM_EMAIL") || Deno.env.get("NEWSLETTER_FROM_EMAIL") || "LUCIEN <onboarding@resend.dev>";
  const rawRedirectTo = Deno.env.get("MEMBER_INVITE_REDIRECT_URL") || Deno.env.get("SITE_URL") || "";
  const redirectTo = withOnboardingParam(rawRedirectTo);

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }
  if (!resendApiKey) {
    return json({ error: "Missing RESEND_API_KEY. Add it as a Supabase function secret before sending invites." }, 500);
  }
  if (!rawRedirectTo) {
    return json({ error: "Missing MEMBER_INVITE_REDIRECT_URL or SITE_URL function secret." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "Missing authorization token" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authUser, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authUser.user) {
    return json({ error: "Invalid authorization token" }, 401);
  }

  const { data: roleRows, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authUser.user.id)
    .in("role", ["owner", "admin"]);

  if (roleError) {
    return json({ error: roleError.message }, 500);
  }
  if (!roleRows?.length) {
    return json({ error: "Owner/admin access required" }, 403);
  }

  const body = await req.json();
  const profileId = String(body.profile_id || body.profileId || "");
  if (!profileId) {
    return json({ error: "profile_id is required" }, 400);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,email,display_name")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    return json({ error: profileError?.message || "Profile not found" }, 404);
  }

  const email = String(profile.email || "").trim().toLowerCase();
  if (!email) {
    return json({ error: "This member does not have an email address." }, 400);
  }

  const invite = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
      data: { display_name: profile.display_name || "" },
    },
  });

  if (invite.error || !invite.data?.properties?.action_link) {
    return json({ error: invite.error?.message || "Unable to generate invite link" }, 500);
  }

  const inviteLink = invite.data.properties.action_link;
  const subject = "Set up your private LUCIEN access";

  const { data: nextEventRow } = await adminClient
    .from("events")
    .select("title,date_label,location,summary")
    .neq("status", "archived")
    .neq("status", "draft")
    .gte("start_date", new Date().toISOString().slice(0, 10))
    .order("start_date", { ascending: true })
    .limit(1)
    .single();

  const nextEvent = nextEventRow ?? undefined;

  const inviteInsert = await adminClient
    .from("member_invites")
    .insert({
      profile_id: profile.id,
      email,
      status: "queued",
      sent_by: authUser.user.id,
    })
    .select()
    .single();

  const inviteId = inviteInsert.data?.id;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject,
        html: inviteHtml(profile.display_name || "", inviteLink, nextEvent),
        text: `${profile.display_name ? `Dear ${profile.display_name},\n\n` : ""}Your private LUCIEN member access has been prepared. Use this secure link to set your access credentials:\n\n${inviteLink}\n\nLUCIEN`,
      }),
    });

    const provider = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(provider?.message || `Resend returned ${response.status}`);
    }

    if (inviteId) {
      await adminClient
        .from("member_invites")
        .update({
          status: "sent",
          provider_message_id: provider?.id || null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", inviteId);
    }

    await adminClient
      .from("memberships")
      .update({ status: "invited" })
      .eq("profile_id", profile.id)
      .neq("status", "active");

    return json({ ok: true, email, provider_message_id: provider?.id || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send error";
    if (inviteId) {
      await adminClient
        .from("member_invites")
        .update({ status: "failed", error_message: message })
        .eq("id", inviteId);
    }
    return json({ error: message }, 500);
  }
});
