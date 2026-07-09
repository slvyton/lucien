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
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }
    if (!stripeKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
    if (!publishableKey) return json({ error: "Missing STRIPE_PUBLISHABLE_KEY" }, 500);

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
    const tier = String(body.tier || "").trim();

    if (!["Sage", "Emerald"].includes(tier)) {
      return json({ error: "Invalid tier. Must be Sage or Emerald." }, 400);
    }

    const priceId = priceIdForTier(tier);
    if (!priceId) return json({ error: `No Stripe price configured for ${tier}.` }, 400);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", userId)
      .maybeSingle();

    const { data: onboarding } = await adminClient
      .from("member_onboarding")
      .select("id, email, full_name, stripe_customer_id, payment_status")
      .eq("profile_id", userId)
      .maybeSingle();

    if (String(onboarding?.payment_status || "").toLowerCase() === "paid") {
      return json({ error: "Membership payment is already marked paid." }, 400);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let customerId = onboarding?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || onboarding?.email || authData.user.email || undefined,
        name: profile?.display_name || onboarding?.full_name || undefined,
        metadata: { profile_id: userId },
      });
      customerId = customer.id;
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        profile_id: userId,
        onboarding_id: onboarding?.id || "",
        tier,
      },
    });

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;
    if (!paymentIntent?.client_secret) {
      return json({ error: "Stripe did not return a subscription payment secret." }, 500);
    }

    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        profile_id: userId,
        onboarding_id: onboarding?.id || "",
        tier,
        subscription_id: subscription.id,
      },
    });

    await adminClient
      .from("member_onboarding")
      .upsert(
        {
          profile_id: userId,
          stripe_customer_id: customerId,
          selected_tier: tier,
          payment_status: "subscription_started",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    return json({
      client_secret: paymentIntent.client_secret,
      publishable_key: publishableKey,
      customer_id: customerId,
      subscription_id: subscription.id,
      payment_intent_id: paymentIntent.id,
      tier,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to initialise subscription payment.";
    console.error("create-payment-intent failed", err);
    return json({ error: message }, 500);
  }
});
