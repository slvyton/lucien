import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!stripeKey || !webhookSecret) {
    return json({ error: "Missing Stripe environment variables" }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing stripe-signature header" }, 400);

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook verification failed";
    return json({ error: msg }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const profileId = session.metadata?.profile_id;
  const tier = session.metadata?.tier;

  if (!profileId || !tier) {
    return json({ error: "Missing metadata in session" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Update membership: active, correct tier, paid billing status
  const { error: membershipError } = await adminClient
    .from("memberships")
    .update({
      status: "active",
      tier,
      billing_status: "paid",
      quarterly_price: tier === "Sage" ? 550 : 2500,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (membershipError) {
    console.error("Membership update failed:", membershipError);
    return json({ error: membershipError.message }, 500);
  }

  // Update onboarding payment status
  await adminClient
    .from("member_onboarding")
    .update({
      payment_status: "paid",
      stripe_customer_id: session.customer?.toString() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  // Log to audit
  await adminClient.from("audit_logs").insert({
    actor_id: null,
    subject_type: "memberships",
    subject_id: profileId,
    action: "stripe_payment_completed",
    new_data: { tier, session_id: session.id, amount: session.amount_total },
    changed_fields: ["status", "tier", "billing_status"],
  });

  return json({ received: true });
});
