"use server";

import { redirect } from "next/navigation";
import {
  signUp,
  confirmSignUp,
  login,
  verifyIdToken,
} from "@/lib/auth/cognito";
import { setSession, clearSession } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { users } from "@/db/schema";

// サインアップ → 確認コード入力ページへ
export async function signupAction(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  try {
    await signUp(email, password);
  } catch (e) {
    const name = (e as { name?: string }).name ?? "";
    const msg =
      name === "UsernameExistsException"
        ? "このメールアドレスは既に登録されています。ログインしてください。"
        : name === "InvalidPasswordException"
          ? "パスワードが要件を満たしていません（8文字以上・大文字・小文字・数字を含む）。"
          : name === "InvalidParameterException"
            ? "入力内容に誤りがあります（メール形式・パスワード要件をご確認ください）。"
            : "登録に失敗しました。時間をおいて再度お試しください。";
    redirect(`/signup?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/confirm?email=${encodeURIComponent(email)}`);
}

// 確認コード検証 → ログインページへ
export async function confirmAction(formData: FormData) {
  const email = String(formData.get("email"));
  const code = String(formData.get("code"));
  try {
    await confirmSignUp(email, code);
  } catch {
    redirect(
      `/confirm?email=${encodeURIComponent(email)}&error=${encodeURIComponent("確認コードが正しくありません")}`,
    );
  }
  redirect("/login?confirmed=1");
}

// ログイン → トークン保存 → users 行作成 → items へ
export async function loginAction(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  try {
    const tokens = await login(email, password);
    await setSession(tokens);

    // 初回ログイン時に users 行を作成（id = Cognito の sub）。RLS 下で自分の行を insert
    const payload = await verifyIdToken(tokens.idToken);
    const sub = payload.sub;
    const userEmail = payload.email as string;
    await withUser(sub, async (tx) => {
      await tx
        .insert(users)
        .values({
          id: sub,
          email: userEmail,
          username: userEmail.split("@")[0],
        })
        .onConflictDoNothing();
    });
  } catch {
    redirect(
      `/login?error=${encodeURIComponent("メールまたはパスワードが違います")}`,
    );
  }
  redirect("/items");
}

// ログアウト → Cookie 削除 → ログインへ
export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
