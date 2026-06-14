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

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") + "Aa1!";
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
  const profile = body.profile || {};
  const membership = body.membership || {};
  const password = String(body.password || randomPassword());
  const email = String(profile.email || "").trim().toLowerCase();
  const displayName = String(profile.display_name || "").trim();

  if (!email || !displayName) {
    return json({ error: "Email and display name are required" }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (createError || !created.user) {
    return json({ error: createError?.message || "Unable to create Auth user" }, 400);
  }

  const userId = created.user.id;

  const profilePayload = {
    ...profile,
    id: userId,
    email,
    display_name: displayName,
  };
  const membershipPayload = {
    ...membership,
    profile_id: userId,
  };

  const { error: profileError } = await adminClient.from("profiles").insert(profilePayload);
  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId);
    return json({ error: profileError.message }, 400);
  }

  const { error: membershipError } = await adminClient.from("memberships").insert(membershipPayload);
  if (membershipError) {
    await adminClient.auth.admin.deleteUser(userId);
    return json({ error: membershipError.message }, 400);
  }

  const { error: roleInsertError } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role: "member" });

  if (roleInsertError) {
    await adminClient.auth.admin.deleteUser(userId);
    return json({ error: roleInsertError.message }, 400);
  }

  return json({ id: userId, email, display_name: displayName });
});
