import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dateFromStripeSeconds(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  async function activateSubscriptionMembership(params: {
    profileId: string;
    tier: string;
    customerId: string | null;
    subscriptionId?: string | null;
    renewalDate?: string | null;
    action: string;
  }) {
    const { profileId, tier, customerId, subscriptionId, renewalDate, action } = params;
    const normalizedTier = tier === "Emerald" ? "Emerald" : "Sage";

    await adminClient
      .from("memberships")
      .update({
        status: "active",
        tier: normalizedTier,
        billing_status: "paid",
        quarterly_price: normalizedTier === "Sage" ? 550 : 2500,
        renewal_date: renewalDate,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    await adminClient
      .from("member_onboarding")
      .update({
        payment_status: "paid",
        stripe_customer_id: customerId,
        selected_tier: normalizedTier,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    await adminClient.from("audit_logs").insert({
      actor_id: null,
      subject_type: "memberships",
      subject_id: profileId,
      action,
      new_data: { tier: normalizedTier, stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, renewal_date: renewalDate },
      changed_fields: ["status", "tier", "billing_status", "payment_status", "renewal_date"],
    });
  }

  // ── Subscription Checkout completed ─────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const profileId = session.metadata?.profile_id || session.client_reference_id || "";
    const tier = session.metadata?.tier || "";

    if (session.mode === "subscription") {
      if (!profileId || !tier) return json({ received: true });
      const subscriptionId = session.subscription?.toString() || null;
      let renewalDate: string | null = null;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        renewalDate = dateFromStripeSeconds(subscription.current_period_end);
      }
      await activateSubscriptionMembership({
        profileId,
        tier,
        customerId: session.customer?.toString() || null,
        subscriptionId,
        renewalDate,
        action: "stripe_subscription_checkout_completed",
      });
      return json({ received: true });
    }
  }

  // ── Subscription lifecycle updates ───────────────────────────────────────
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const profileId = subscription.metadata?.profile_id;
    const tier = subscription.metadata?.tier;
    if (!profileId || !tier) return json({ received: true });

    if (event.type === "customer.subscription.deleted" || subscription.status === "canceled") {
      await adminClient
        .from("memberships")
        .update({
          status: "cancelled",
          billing_status: "paused",
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId);
      return json({ received: true });
    }

    if (["active", "trialing"].includes(subscription.status)) {
      await activateSubscriptionMembership({
        profileId,
        tier,
        customerId: subscription.customer?.toString() || null,
        subscriptionId: subscription.id,
        renewalDate: dateFromStripeSeconds(subscription.current_period_end),
        action: `stripe_subscription_${subscription.status}`,
      });
      return json({ received: true });
    }

    if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(subscription.status)) {
      await adminClient
        .from("memberships")
        .update({
          billing_status: subscription.status,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", profileId);
      return json({ received: true });
    }
  }

  // ── Paid subscription invoice renewals ──────────────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    if (!invoice.subscription) return json({ received: true });

    const subscriptionId = typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription.id;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const profileId = subscription.metadata?.profile_id;
    const tier = subscription.metadata?.tier;
    if (!profileId || !tier) return json({ received: true });

    await activateSubscriptionMembership({
      profileId,
      tier,
      customerId: subscription.customer?.toString() || null,
      subscriptionId: subscription.id,
      renewalDate: dateFromStripeSeconds(subscription.current_period_end),
      action: "stripe_invoice_payment_succeeded",
    });
    return json({ received: true });
  }

  // ── Payment Intent succeeded (embedded Elements, admin-invite flow) ───────
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const profileId = pi.metadata?.profile_id;
    const tier = pi.metadata?.tier;
    if (!profileId || !tier) return json({ received: true });
    let renewalDate: string | null = null;
    if (pi.metadata?.subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(pi.metadata.subscription_id);
      renewalDate = dateFromStripeSeconds(subscription.current_period_end);
    }

    await adminClient
      .from("memberships")
      .update({
        status: "active",
        tier,
        billing_status: "paid",
        quarterly_price: tier === "Sage" ? 550 : 2500,
        renewal_date: renewalDate,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    await adminClient
      .from("member_onboarding")
      .update({
        payment_status: "paid",
        stripe_customer_id: typeof pi.customer === "string" ? pi.customer : null,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    await adminClient.from("audit_logs").insert({
      actor_id: null,
      subject_type: "memberships",
      subject_id: profileId,
      action: "stripe_payment_succeeded",
      new_data: { tier, payment_intent_id: pi.id, amount: pi.amount },
      changed_fields: ["status", "tier", "billing_status"],
    });

    return json({ received: true });
  }

  // ── Setup Intent succeeded (referral card-save flow) ─────────────────────
  if (event.type === "setup_intent.succeeded") {
    const si = event.data.object as Stripe.SetupIntent;
    const profileId = si.metadata?.profile_id;
    const tier = si.metadata?.tier;
    if (!profileId) return json({ received: true });

    const paymentMethodId = typeof si.payment_method === "string"
      ? si.payment_method
      : si.payment_method?.id ?? null;

    await adminClient
      .from("member_onboarding")
      .upsert(
        {
          profile_id: profileId,
          stripe_customer_id: typeof si.customer === "string" ? si.customer : null,
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
      new_data: { tier, setup_intent_id: si.id, payment_method_id: paymentMethodId },
      changed_fields: ["stripe_payment_method_id", "payment_status"],
    });

    return json({ received: true });
  }

  // ── Legacy: Checkout Session completed (keep for backwards compat) ────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const profileId = session.metadata?.profile_id;
    const tier = session.metadata?.tier;

    if (session.mode === "setup") {
      if (!profileId) return json({ received: true });
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
      return json({ received: true });
    }

    if (!profileId || !tier) return json({ received: true });

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
        stripe_customer_id: session.customer?.toString() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);

    return json({ received: true });
  }

  return json({ received: true });
});
