import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

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

function priceIdForTier(tier: string) {
  const normalized = tier.trim().toLowerCase();
  if (normalized === "sage") return Deno.env.get("STRIPE_SAGE_PRICE_ID");
  if (normalized === "emerald") return Deno.env.get("STRIPE_EMERALD_PRICE_ID");
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const memberPortalUrl =
    Deno.env.get("MEMBER_PORTAL_URL") ||
    Deno.env.get("SITE_URL") ||
    Deno.env.get("MEMBER_INVITE_REDIRECT_URL") ||
    "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }
  if (!stripeSecretKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
  if (!memberPortalUrl) return json({ error: "Missing MEMBER_PORTAL_URL or SITE_URL" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Missing authorization token" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Invalid token" }, 401);

  const userId = authData.user.id;
  const body = await req.json().catch(() => ({}));
  const requestedTier = String(body.tier || "").trim();

  const { data: onboarding } = await adminClient
    .from("member_onboarding")
    .select("id, email, full_name, selected_tier, payment_status")
    .eq("profile_id", userId)
    .maybeSingle();

  const tier = requestedTier || onboarding?.selected_tier || "";
  if (!["Sage", "Emerald"].includes(tier)) {
    return json({ error: "Invalid tier. Must be Sage or Emerald." }, 400);
  }
  if (String(onboarding?.payment_status || "").toLowerCase() === "paid") {
    return json({ error: "Membership payment is already marked paid." }, 400);
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) return json({ error: `No Stripe price configured for ${tier}.` }, 400);

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", userId)
    .maybeSingle();

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const successUrl = new URL(memberPortalUrl);
  successUrl.searchParams.set("payment", "success");
  successUrl.searchParams.set("tier", tier);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

  const cancelUrl = new URL(memberPortalUrl);
  cancelUrl.searchParams.set("payment", "cancelled");
  cancelUrl.searchParams.set("tier", tier);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: profile?.email || onboarding?.email || authData.user.email || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    client_reference_id: userId,
    subscription_data: {
      metadata: {
        profile_id: userId,
        onboarding_id: onboarding?.id || "",
        tier,
      },
    },
    metadata: {
      profile_id: userId,
      onboarding_id: onboarding?.id || "",
      tier,
      display_name: profile?.display_name || onboarding?.full_name || "",
    },
  });

  if (onboarding?.id) {
    await adminClient
      .from("member_onboarding")
      .update({ payment_status: "checkout_started", updated_at: new Date().toISOString() })
      .eq("id", onboarding.id);
  }

  return json({ url: session.url, id: session.id });
});
