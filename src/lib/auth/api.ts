import { NextResponse, type NextRequest } from "next/server";
import { verifyIdToken } from "./cognito";

// REST API 用の認証ユーザ（Cognito の sub と email）。
export type ApiUser = { sub: string; email: string };

// Authorization: Bearer <Cognito ID トークン> を検証してユーザを返す。失敗時は null。
// 外部クライアント（モバイル/サードパーティ）は Cognito で取得した ID トークンを付与する。
export async function getApiUser(req: NextRequest): Promise<ApiUser | null> {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const payload = await verifyIdToken(token);
    return { sub: payload.sub, email: payload.email as string };
  } catch {
    return null; // 署名不正・期限切れ等
  }
}

// 一貫した JSON エラー応答を作るヘルパー群。
export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
export function unauthorized(): NextResponse {
  return jsonError(401, "unauthorized");
}
export function badRequest(message: string): NextResponse {
  return jsonError(400, message);
}

// DB 例外を適切な HTTP に振り分ける。整合性制約(23xxx)は 400、その他は 500。
export function dbErrorResponse(e: unknown): NextResponse {
  const code = (e as { code?: string }).code;
  if (typeof code === "string" && code.startsWith("23")) {
    return jsonError(400, (e as Error).message);
  }
  console.error(e);
  return jsonError(500, "internal error");
}
