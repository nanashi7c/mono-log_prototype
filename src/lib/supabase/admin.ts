// Admin client used for self-service account deletion (`auth.admin.deleteUser`).
// Service role key bypasses RLS — confine usage to server actions that have already
// re-verified the caller's identity (typically by re-signing in with the current password).

import { createClient } from "@supabase/supabase-js";

export function isAdminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
