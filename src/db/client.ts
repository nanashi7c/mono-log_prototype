import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// プロセス内コネクションプール（常駐プロセスで接続を再利用）。
// Next.js dev のホットリロードでプールが増えないよう global に保持する。
const globalForPool = globalThis as unknown as { _monologPool?: Pool };

const pool =
  globalForPool._monologPool ??
  new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPool._monologPool = pool;

export const db = drizzle(pool, { schema });

// db.transaction のコールバックが受け取るトランザクション型を取り出す
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 指定ユーザ(sub)の RLS コンテキストでクエリを実行するヘルパー。
// トランザクション内で set_config(..., true)（=SET LOCAL 相当）を行い、その中で fn を実行する。
export async function withUser<T>(
  sub: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_user_id', ${sub}, true)`,
    );
    return fn(tx);
  });
}
