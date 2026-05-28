"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If the project requires email confirmation, no session is returned yet.
  if (!data.session) {
    redirect(
      `/signup?message=${encodeURIComponent("確認メールを送信しました。メール内のリンクから認証してください。")}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}
