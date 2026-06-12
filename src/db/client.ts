import { PrismaClient, Prisma } from "@prisma/client";

// アプリの接続URLを個別 env から組み立てる。アプリは常に DB_USER(=monolog_app・非所有者)で
// 接続して RLS を効かせる。Prisma CLI 用の DATABASE_URL は admin を指すため、ここでは使わない。
// RDS は rds.force_ssl=1 で SSL 必須なので本番のみ sslmode=require を付与する
// （require は暗号化のみで CA 検証なし＝従来の rejectUnauthorized:false と等価）。
function buildDatabaseUrl(): string | undefined {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const pw = process.env.DB_PASSWORD;
  if (!host || !port || !name || !user || pw == null) return undefined;
  const ssl = process.env.NODE_ENV === "production" ? "?sslmode=require" : "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@${host}:${port}/${name}${ssl}`;
}

// dev のホットリロードで PrismaClient が増殖しないよう global に保持する。
const globalForPrisma = globalThis as unknown as { _monologPrisma?: PrismaClient };

// ビルド時は env が無く接続URLを組めないため、初回利用時に遅延生成する。
let cached: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (cached) return cached;
  if (globalForPrisma._monologPrisma) {
    cached = globalForPrisma._monologPrisma;
    return cached;
  }
  cached = new PrismaClient({ datasourceUrl: buildDatabaseUrl() });
  if (process.env.NODE_ENV !== "production") globalForPrisma._monologPrisma = cached;
  return cached;
}

// withUser のコールバックが受け取るトランザクションクライアント型。
export type Tx = Prisma.TransactionClient;

// 指定ユーザ(sub)の RLS コンテキストでクエリを実行するヘルパー。
// トランザクション内で set_config(..., true)（=SET LOCAL 相当）を行い、その中で fn を実行する。
export async function withUser<T>(
  sub: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.current_user_id', ${sub}, true)`;
    return fn(tx);
  });
}
