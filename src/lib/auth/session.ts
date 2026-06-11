import { cookies } from "next/headers";
import { type AuthTokens, verifyIdToken } from "./cognito";

const ID_COOKIE = "ml_id";
const ACCESS_COOKIE = "ml_access";
const REFRESH_COOKIE = "ml_refresh";

const baseCookie = {
  httpOnly: true, // JS から読めない（XSS で盗まれにくい）
  secure: process.env.NODE_ENV === "production", // 本番は HTTPS のみ
  sameSite: "lax" as const,
  path: "/",
};

// トークンを httpOnly Cookie に保存（login 成功時に呼ぶ）
export async function setSession(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  store.set(ID_COOKIE, tokens.idToken, baseCookie);
  store.set(ACCESS_COOKIE, tokens.accessToken, baseCookie);
  // リフレッシュトークンは長め（30日）に保持
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    maxAge: 60 * 60 * 24 * 30,
  });
}

// セッション Cookie を削除（logout 時に呼ぶ）
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ID_COOKIE);
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

// auth_time は ID トークンの認証時刻（秒）。最終ログイン表示に使う。
export type CurrentUser = { sub: string; email: string; authTime: number | null };

// 現在のユーザを取得（ID トークンを検証するだけ＝読み取り専用）。未ログインなら null。
// トークンの更新（期限切れ時の refresh）は middleware 側で行う。
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const idToken = store.get(ID_COOKIE)?.value;
  if (!idToken) return null;
  try {
    const payload = await verifyIdToken(idToken);
    return {
      sub: payload.sub,
      email: payload.email as string,
      authTime: typeof payload.auth_time === "number" ? payload.auth_time : null,
    };
  } catch {
    return null; // 署名不正・期限切れ等
  }
}

// アクセストークンを取得（パスワード変更・退会など Cognito 操作で使う）。
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}
