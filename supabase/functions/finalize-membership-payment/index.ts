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

const TIER_PRICE: Record<string, number> = {
  Sage: 550,
  Emerald: 2500,
};

function dateFromStripeSeconds(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Missing authorization token" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Invalid token" }, 401);

  const { payment_intent_id } = await req.json();
  if (!payment_intent_id || typeof payment_intent_id !== "string") {
    return json({ error: "Missing payment_intent_id" }, 400);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
  const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
  if (paymentIntent.status !== "succeeded") {
    return json({ error: `Payment is ${paymentIntent.status}` }, 409);
  }

  let profileId = paymentIntent.metadata?.profile_id;
  let tier = paymentIntent.metadata?.tier;
  let stripeSubscriptionId: string | null = paymentIntent.metadata?.subscription_id || null;
  let stripeRenewalDate: string | null = null;

  if ((!profileId || !tier) && paymentIntent.invoice) {
    const invoiceId = typeof paymentIntent.invoice === "string"
      ? paymentIntent.invoice
      : paymentIntent.invoice.id;
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["subscription"] });
    const subscription = typeof invoice.subscription === "string"
      ? await stripe.subscriptions.retrieve(invoice.subscription)
      : invoice.subscription;

    profileId = profileId || subscription?.metadata?.profile_id;
    tier = tier || subscription?.metadata?.tier;
    stripeSubscriptionId = stripeSubscriptionId || subscription?.id || null;
    stripeRenewalDate = dateFromStripeSeconds(subscription?.current_period_end);
  }

  if (profileId !== authData.user.id) {
    return json({ error: "Payment does not belong to this member" }, 403);
  }
  if (!tier || !TIER_PRICE[tier]) {
    return json({ error: "Payment is missing a valid membership tier" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();
  const renewal = new Date();
  renewal.setMonth(renewal.getMonth() + 3);
  const renewalDate = stripeRenewalDate || renewal.toISOString().slice(0, 10);
  const stripeCustomerId = typeof paymentIntent.customer === "string"
    ? paymentIntent.customer
    : paymentIntent.customer?.id ?? null;

  const { error: membershipError } = await adminClient
    .from("memberships")
    .update({
      status: "active",
      tier,
      billing_status: "paid",
      quarterly_price: TIER_PRICE[tier],
      renewal_date: renewalDate,
      updated_at: now,
    })
    .eq("profile_id", profileId);
  if (membershipError) return json({ error: membershipError.message }, 500);

  const { error: onboardingError } = await adminClient
    .from("member_onboarding")
    .update({
      selected_tier: tier,
      quarterly_price: TIER_PRICE[tier],
      payment_status: "paid",
      stripe_customer_id: stripeCustomerId,
      updated_at: now,
    })
    .eq("profile_id", profileId);
  if (onboardingError) return json({ error: onboardingError.message }, 500);

  await adminClient.from("audit_logs").insert({
    actor_id: profileId,
    subject_type: "memberships",
    subject_id: profileId,
    action: "membership_payment_finalized",
    new_data: {
      tier,
      payment_intent_id: paymentIntent.id,
      stripe_subscription_id: stripeSubscriptionId,
      amount: paymentIntent.amount,
      source: "client_finalize",
    },
    changed_fields: ["status", "tier", "billing_status", "payment_status"],
  });

  return json({ ok: true, tier, renewal_date: renewalDate });
});
