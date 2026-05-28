"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

async function authedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function back(qs: string): never {
  redirect(`/mypage?${qs}`);
}

export async function updateProfile(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) back("error=username-required");

  const { supabase, user } = await authedUser();
  const { error } = await supabase.from("profiles").update({ username }).eq("user_id", user.id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/mypage");
  back("ok=profile-updated");
}

export async function changePassword(formData: FormData) {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < 6) back("error=password-too-short");
  if (next !== confirm) back("error=password-mismatch");

  const { supabase, user } = await authedUser();
  if (!user.email) back("error=email-missing");

  // Re-verify the current password by attempting sign-in. Supabase Auth allows
  // updateUser({ password }) on an active session without a recheck; this gate
  // is here to prevent a hijacked session from changing the password silently.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: current,
  });
  if (signInError) back("error=current-password-wrong");

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  back("ok=password-updated");
}

export async function deleteAccount(formData: FormData) {
  if (!isAdminConfigured()) back("error=admin-not-configured");

  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "削除") back("error=confirmation-mismatch");

  const { supabase, user } = await authedUser();
  if (!user.email) back("error=email-missing");

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  });
  if (signInError) back("error=password-wrong");

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) back(`error=${encodeURIComponent(deleteError.message)}`);

  // Clear cookies so the user lands on the unauthenticated LP.
  await supabase.auth.signOut();
  redirect("/");
}
