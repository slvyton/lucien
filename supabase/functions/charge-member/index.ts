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

const TIER_PRICES: Record<string, number> = {
  Sage: 55000,
  Emerald: 250000,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);

  // Must be called by an admin
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Missing authorization token" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authUser, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authUser.user) return json({ error: "Invalid token" }, 401);

  const { data: roleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authUser.user.id)
    .in("role", ["owner", "admin"]);

  if (!roleRows?.length) return json({ error: "Owner/admin access required" }, 403);

  const body = await req.json();
  const profileId = String(body.profile_id || "").trim();
  if (!profileId) return json({ error: "profile_id is required" }, 400);

  // Get the saved Stripe customer and tier
  const { data: onboarding } = await adminClient
    .from("member_onboarding")
    .select("stripe_customer_id, stripe_payment_method_id, selected_tier")
    .eq("profile_id", profileId)
    .single();

  if (!onboarding?.stripe_customer_id) {
    return json({ error: "No Stripe customer found for this member. They need to save a payment method first." }, 400);
  }
  if (!onboarding?.stripe_payment_method_id) {
    return json({ error: "No saved payment method found. Member must complete the card setup step." }, 400);
  }

  const tier = String(body.tier || onboarding.selected_tier || "Sage").trim();
  const amount = TIER_PRICES[tier];
  if (!amount) return json({ error: `Unknown tier: ${tier}` }, 400);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

  // Charge the saved card
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    customer: onboarding.stripe_customer_id,
    payment_method: onboarding.stripe_payment_method_id,
    off_session: true,
    confirm: true,
    description: `LUCIEN ${tier} Membership — Quarterly`,
    metadata: { profile_id: profileId, tier },
  });

  if (paymentIntent.status !== "succeeded") {
    return json({
      error: `Payment did not succeed (status: ${paymentIntent.status}). The member may need to update their payment method.`,
    }, 402);
  }

  // Activate the membership
  await adminClient
    .from("memberships")
    .update({
      status: "active",
      tier,
      billing_status: "paid",
      quarterly_price: tier === "Sage" ? 550 : 2500,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  await adminClient
    .from("member_onboarding")
    .update({
      payment_status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  await adminClient.from("audit_logs").insert({
    actor_id: authUser.user.id,
    subject_type: "memberships",
    subject_id: profileId,
    action: "admin_charge_approved",
    new_data: { tier, amount, payment_intent_id: paymentIntent.id },
    changed_fields: ["status", "tier", "billing_status"],
  });

  return json({ ok: true, payment_intent_id: paymentIntent.id, tier });
});
