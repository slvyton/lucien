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

function markdownToHtml(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((block) => `<p>${block.trim().replace(/\n/g, "<br>")}</p>`)
    .join("");
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
  const fromEmail = Deno.env.get("NEWSLETTER_FROM_EMAIL") || "LUCIEN <concierge@lucien.local>";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }
  if (!resendApiKey) {
    return json({ error: "Missing RESEND_API_KEY. Add it as a Supabase function secret before sending newsletters." }, 500);
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
  const newsletterId = String(body.newsletter_id || body.newsletterId || "");
  const testEmail = String(body.test_email || body.testEmail || "").trim().toLowerCase();
  if (!newsletterId) {
    return json({ error: "Newsletter id is required" }, 400);
  }

  const { data: newsletter, error: newsletterError } = await adminClient
    .from("newsletters")
    .select("*")
    .eq("id", newsletterId)
    .single();

  if (newsletterError || !newsletter) {
    return json({ error: newsletterError?.message || "Newsletter not found" }, 404);
  }

  const html = newsletter.body_html || markdownToHtml(newsletter.body_markdown || "");
  if (!newsletter.subject || !html) {
    return json({ error: "Newsletter needs a subject and body before sending." }, 400);
  }

  let recipients: Array<{ id: string | null; email: string }> = [];
  if (testEmail) {
    recipients = [{ id: null, email: testEmail }];
  } else {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id,email,memberships!inner(status)")
      .eq("memberships.status", "active")
      .not("email", "is", null);

    if (profilesError) {
      return json({ error: profilesError.message }, 500);
    }
    recipients = (profiles || [])
      .map((profile) => ({ id: profile.id, email: String(profile.email || "").trim().toLowerCase() }))
      .filter((recipient) => recipient.email);
  }

  if (!recipients.length) {
    return json({ error: "No newsletter recipients found." }, 400);
  }

  const results = [];
  for (const recipient of recipients) {
    const deliveryInsert = await adminClient
      .from("newsletter_deliveries")
      .insert({
        newsletter_id: newsletter.id,
        profile_id: recipient.id,
        email: recipient.email,
        status: "queued",
      })
      .select()
      .single();

    const deliveryId = deliveryInsert.data?.id;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: recipient.email,
          subject: newsletter.subject,
          html,
          text: newsletter.body_markdown || newsletter.preview_text || newsletter.subject,
        }),
      });

      const provider = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(provider?.message || `Resend returned ${response.status}`);
      }

      if (deliveryId) {
        await adminClient
          .from("newsletter_deliveries")
          .update({
            status: "sent",
            provider_message_id: provider?.id || null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", deliveryId);
      }
      results.push({ email: recipient.email, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown send error";
      if (deliveryId) {
        await adminClient
          .from("newsletter_deliveries")
          .update({ status: "failed", error_message: message })
          .eq("id", deliveryId);
      }
      results.push({ email: recipient.email, status: "failed", error: message });
    }
  }

  const sentCount = results.filter((result) => result.status === "sent").length;
  const failedCount = results.length - sentCount;

  if (!testEmail && sentCount > 0) {
    await adminClient
      .from("newsletters")
      .update({
        status: failedCount ? "partially_sent" : "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", newsletter.id);
  }

  return json({ sent: sentCount, failed: failedCount, results });
});
