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
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Setup mode: card saved, not yet charged ──────────────────────────────
  if (session.mode === "setup") {
    if (!profileId) return json({ error: "Missing profile_id in metadata" }, 400);

    // Retrieve the SetupIntent to get the saved payment method
    const setupIntentId = session.setup_intent as string | null;
    let paymentMethodId: string | null = null;

    if (setupIntentId) {
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      paymentMethodId = typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ?? null;
    }

    await adminClient
      .from("member_onboarding")
      .upsert(
        {
          profile_id: profileId,
          stripe_customer_id: session.customer?.toString() || null,
          stripe_payment_method_id: paymentMethodId,
          selected_tier: tier || null,
          payment_status: "card_saved",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

    await adminClient.from("audit_logs").insert({
      actor_id: null,
      subject_type: "member_onboarding",
      subject_id: profileId,
      action: "stripe_card_saved",
      new_data: { tier, session_id: session.id, payment_method_id: paymentMethodId },
      changed_fields: ["stripe_payment_method_id", "payment_status"],
    });

    return json({ received: true });
  }

  // ── Payment mode: direct payment completed (admin-invited members) ────────
  if (!profileId || !tier) {
    return json({ error: "Missing metadata in session" }, 400);
  }

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

  await adminClient
    .from("member_onboarding")
    .update({
      payment_status: "paid",
      stripe_customer_id: session.customer?.toString() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

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
