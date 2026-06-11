"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  getCurrentUser,
  getAccessToken,
  clearSession,
} from "@/lib/auth/session";
import {
  login,
  changePassword as cognitoChangePassword,
  deleteOwnUser,
} from "@/lib/auth/cognito";
import { withUser } from "@/db/client";
import { users } from "@/db/schema";

function back(qs: string): never {
  redirect(`/mypage?${qs}`);
}

export async function updateProfile(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) back("error=username-required");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await withUser(user.sub, (tx) =>
    tx.update(users).set({ username }).where(eq(users.id, user.sub)),
  );

  revalidatePath("/mypage");
  back("ok=profile-updated");
}

export async function changePassword(formData: FormData) {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < 6) back("error=password-too-short");
  if (next !== confirm) back("error=password-mismatch");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");

  // Cognito の ChangePassword は現パスワードを必須とし、誤りなら例外を投げる。
  try {
    await cognitoChangePassword(accessToken, current, next);
  } catch {
    back("error=current-password-wrong");
  }

  back("ok=password-updated");
}

export async function deleteAccount(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "削除") back("error=confirmation-mismatch");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.email) back("error=email-missing");

  // 本人確認: 現パスワードで再ログインを試行する。
  try {
    await login(user.email, password);
  } catch {
    back("error=password-wrong");
  }

  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");

  // 先に DB の users 行を削除（items 等は FK の ON DELETE CASCADE で消える）。
  await withUser(user.sub, (tx) => tx.delete(users).where(eq(users.id, user.sub)));

  // Cognito 上のユーザも削除（セルフサービス）。
  try {
    await deleteOwnUser(accessToken);
  } catch {
    // DB 側は削除済み。Cognito 削除に失敗してもセッションは破棄して LP へ。
  }

  await clearSession();
  redirect("/");
}
