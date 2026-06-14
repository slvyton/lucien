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

function inviteHtml(displayName: string, inviteLink: string) {
  return `
    <div style="font-family:Georgia,serif;color:#182620;line-height:1.6">
      <p>${displayName ? `Dear ${displayName},` : "Dear member,"}</p>
      <p>Your private LUCIEN member access has been prepared.</p>
      <p><a href="${inviteLink}" style="color:#8a6f3e">Enter LUCIEN</a></p>
      <p>This link is personal to you and will let you set your access credentials. If it expires, your concierge can send a fresh invitation.</p>
      <p>LUCIEN</p>
    </div>`;
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
        html: inviteHtml(profile.display_name || "", inviteLink),
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
