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

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
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
    return json({ error: "Admin access required" }, 403);
  }

  const body = await req.json();
  const profileId = String(body.profile_id || body.profileId || "");
  if (!profileId) {
    return json({ error: "profile_id is required" }, 400);
  }
  if (profileId === authUser.user.id) {
    return json({ error: "You cannot delete your own admin account from this dashboard." }, 400);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,email,display_name")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    return json({ error: profileError?.message || "Profile not found" }, 404);
  }

  await adminClient.from("member_invites").delete().eq("profile_id", profileId);
  await adminClient.from("member_onboarding").delete().eq("profile_id", profileId);
  await adminClient.from("referrals").update({
    status: "cancelled",
    accepted_profile_id: null,
  }).eq("accepted_profile_id", profileId);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(profileId);
  if (deleteError) {
    return json({ error: deleteError.message }, 400);
  }

  return json({ ok: true, id: profile.id, email: profile.email, display_name: profile.display_name });
});
