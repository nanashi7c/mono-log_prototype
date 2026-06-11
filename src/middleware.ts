import { NextResponse, type NextRequest } from "next/server";

// 認証不要のパス（ランディング・認証系）
const PUBLIC_PREFIXES = ["/", "/login", "/signup", "/confirm"];

const SESSION_COOKIES = ["ml_id", "ml_access", "ml_refresh"];

// JWT の exp を署名検証せずに読み、失効/不正なら true。
// Edge ランタイムで動くよう atob のみ使用（完全な署名検証は getCurrentUser 側で実施）。
function isTokenExpired(token: string | undefined): boolean {
  if (!token) return true;
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function middleware(request: NextRequest) {
  const idToken = request.cookies.get("ml_id")?.value;
  const expired = isTokenExpired(idToken);
  const loggedIn = !expired; // 有効な（未失効の）ID トークンがある
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => path === p || (p !== "/" && path.startsWith(`${p}/`)),
  );

  // 未ログイン（トークン無し or 失効）で保護ルート → /login。
  // 失効 Cookie は破棄し、/items ⇄ /login のループを防ぐ。
  if (!loggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    const res = NextResponse.redirect(url);
    if (idToken) for (const c of SESSION_COOKIES) res.cookies.delete(c);
    return res;
  }

  // ログイン済み（有効トークン）で /login・/signup → /items
  if (loggedIn && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/items";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
