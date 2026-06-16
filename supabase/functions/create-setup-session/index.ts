import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") || Deno.env.get("MEMBER_INVITE_REDIRECT_URL") || "";

  if (!stripeKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);

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

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", userId)
    .single();

  if (!profile) return json({ error: "Profile not found" }, 404);

  const body = await req.json();
  const tier = String(body.tier || "Sage").trim();
  const referralCode = String(body.referral_code || "").trim();

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

  // Find or create Stripe customer for this member
  const { data: onboarding } = await adminClient
    .from("member_onboarding")
    .select("stripe_customer_id")
    .eq("profile_id", userId)
    .single();

  let customerId = onboarding?.stripe_customer_id || null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email || authData.user.email || undefined,
      name: profile.display_name || undefined,
      metadata: { profile_id: userId },
    });
    customerId = customer.id;

    // Store the customer ID now so we have it for charging later
    await adminClient
      .from("member_onboarding")
      .upsert(
        { profile_id: userId, stripe_customer_id: customerId, payment_status: "pending" },
        { onConflict: "profile_id" }
      );
  }

  const cancelUrl = referralCode
    ? `${siteUrl}?ref=${referralCode}&setup=cancelled`
    : `${siteUrl}?setup=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    currency: "usd",
    metadata: {
      profile_id: userId,
      tier,
    },
    success_url: `${siteUrl}?setup=success&tier=${encodeURIComponent(tier)}`,
    cancel_url: cancelUrl,
  });

  return json({ url: session.url });
});
