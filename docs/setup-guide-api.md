# 付録C: REST API実装手順（/api/v1）＋逐行解説

[setup-guide.md](setup-guide.md) の補足。外部向けREST API（items / categories / export）を**ファイル作成→確認**の手順形式で実装し、各コードブロックの直後に**逐行解説**を付けます。仕様は[APIリファレンス](api-reference.md)。

- **前提**: 7〜9章のアプリ（DB/認証/RLS）が動作。Cognito稼働。
- **方式**: REST、認可は`Authorization: Bearer <Cognito IDトークン>`、配置はNext.jsのRoute Handler。
- 既存の`db/client.ts`(`withUser`)・`cognito.ts`(`verifyIdToken`)・`serialize.ts`を再利用。

### Route Handlerの基本（最初に1回）
- `src/app/api/<パス>/route.ts`にHTTPメソッド名(`GET`/`POST`/`PUT`/`DELETE`)の関数を`export`すると、その関数がそのパスのAPIになる。
- 引数は`req: NextRequest`(要求)。動的セグメント(`[id]`)は第2引数`ctx.params`(Next 15ではPromise)で受け取る。
- 戻り値は`NextResponse`(JSON等)。
- `export const dynamic = "force-dynamic"`: キャッシュせず毎回実行(認証依存のため)。

---

## Step 1. middleware を API 対象外にする
```diff
 export const config = {
   matcher: [
-    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
+    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
   ],
 };
```
**逐行解説**
- `matcher`の正規表現の否定先読み`(?!...)`に`api`を追加。これで**`/api/*`はmiddlewareを通らない**。
- 理由: middlewareは未ログインの保護ルートを`/login`へ**HTMLリダイレクト**する。APIに適用するとJSONでなくリダイレクトが返ってしまう。APIは各ハンドラがBearer検証して`401 JSON`を返すべきなので除外する。

---

## Step 2. Bearer 認証ヘルパ `src/lib/auth/api.ts`
```ts
import { NextResponse, type NextRequest } from "next/server";
import { verifyIdToken } from "./cognito";

export type ApiUser = { sub: string; email: string };

export async function getApiUser(req: NextRequest): Promise<ApiUser | null> {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const payload = await verifyIdToken(token);
    return { sub: payload.sub, email: payload.email as string };
  } catch {
    return null;
  }
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
export function unauthorized(): NextResponse { return jsonError(401, "unauthorized"); }
export function badRequest(message: string): NextResponse { return jsonError(400, message); }

export function dbErrorResponse(e: unknown): NextResponse {
  const code = (e as { code?: string }).code;
  if (typeof code === "string" && code.startsWith("23")) {
    return jsonError(400, (e as Error).message);
  }
  console.error(e);
  return jsonError(500, "internal error");
}
```
**逐行解説**
- `ApiUser`型: APIで使うユーザ情報(`sub`/`email`)。
- `getApiUser(req)`: **Bearer認証の中核**。
  - `req.headers.get("authorization")`: `Authorization`ヘッダを取得。
  - `if (!header || !header.startsWith("Bearer "))`: 無い/`Bearer `で始まらなければ`null`。
  - `header.slice("Bearer ".length).trim()`: `"Bearer "`を除いたトークン部分を取り出す。
  - `await verifyIdToken(token)`: 既存の検証器(`cognito.ts`)でIDトークンを検証。`sub`/`email`を返す。
  - `catch { return null }`: 不正/失効は`null`(呼び元が401を返す)。
- `jsonError(status, message)`: `NextResponse.json({ error }, { status })`で**統一エラーJSON**。
- `unauthorized()`=401、`badRequest(msg)`=400 の薄いラッパ。
- `dbErrorResponse(e)`: DB例外をHTTPに振り分け。`(e).code`がPostgresのエラーコード。`"23"`始まり=整合性制約違反(FK/CHECK/UNIQUE等)→**クライアント起因なので400**。それ以外は`console.error`して500。

---

## Step 3. items 共有ロジック `src/lib/api/items.ts`
```ts
import { inArray } from "drizzle-orm";
import { itemsCategories } from "@/db/schema";
import type { Tx } from "@/db/client";
import type { ItemStatus } from "@/types/item";

export const ITEM_STATUSES: ItemStatus[] = ["planned", "owned", "listed", "sold"];

export type ItemInput = { /* status,name,janCode,quantity,notes,actualPrice,purchasedAt,categoryIds */ };

export async function categoryIdsByItem(tx: Tx, ids: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (ids.length === 0) return map;
  const links = await tx
    .select({ itemId: itemsCategories.itemId, categoryId: itemsCategories.categoryId })
    .from(itemsCategories)
    .where(inArray(itemsCategories.itemId, ids));
  for (const l of links) {
    const arr = map.get(l.itemId) ?? [];
    arr.push(l.categoryId);
    map.set(l.itemId, arr);
  }
  return map;
}
```
**逐行解説**
- `ITEM_STATUSES`: 許容するstatus値の一覧(検証に使う)。
- `ItemInput`型: 整形後のアイテム入力(camelCase)。
- `categoryIdsByItem(tx, ids)`: アイテムID群に対し、紐づくカテゴリIDを**まとめて**取得し`Map<itemId, categoryId[]>`で返す(N+1回避)。
  - `if (ids.length === 0) return map`: 空なら即返す。
  - `tx.select({...}).from(itemsCategories).where(inArray(itemsCategories.itemId, ids))`: 中間表から該当リンクを一括取得。`inArray`は`IN (...)`。
  - `for (const l of links) { ... map.set(...) }`: itemIdごとに配列へ詰める。

```ts
export function parseItemBody(body: unknown):
  { ok: true; value: ItemInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  let status: ItemStatus = "owned";
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !ITEM_STATUSES.includes(b.status as ItemStatus))
      return { ok: false, error: `invalid status: ${String(b.status)}` };
    status = b.status as ItemStatus;
  }
  let quantity = 1;
  if (b.quantity !== undefined) {
    const q = Number(b.quantity);
    if (!Number.isInteger(q) || q <= 0) return { ok: false, error: "quantity must be a positive integer" };
    quantity = q;
  }
  const strOrNull = (v: unknown) => { if (v == null) return null; const s = String(v).trim(); return s === "" ? null : s; };
  const nonNegIntOrNull = (v: unknown) => { if (v == null || v === "") return null; const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : null; };
  let categoryIds: number[] = [];
  if (b.category_ids !== undefined) {
    if (!Array.isArray(b.category_ids)) return { ok: false, error: "category_ids must be an array" };
    categoryIds = b.category_ids.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  }
  return { ok: true, value: { status, name, janCode: strOrNull(b.jan_code), quantity, notes: strOrNull(b.notes), actualPrice: nonNegIntOrNull(b.actual_price), purchasedAt: strOrNull(b.purchased_at), categoryIds } };
}
```
**逐行解説**
- `parseItemBody(body)`: 受け取ったJSONを検証＆整形。戻り値は**判別共用体**`{ok:true,value} | {ok:false,error}`(呼び元が`if (!parsed.ok)`で分岐)。
- `if (typeof body !== "object" || body === null)`: JSONオブジェクトでなければエラー。
- `name`: 文字列でtrim後、空なら`name is required`。
- `status`: 未指定は`"owned"`。指定時は`ITEM_STATUSES`に含まれるか検証。
- `quantity`: 未指定は1。指定時は正の整数か検証。
- `strOrNull`/`nonNegIntOrNull`: 空→null、数値は0以上のみ、の整形(アプリ側ヘルパと同趣旨)。
- `category_ids`: 配列か検証し、正の整数だけ残す。
- 最後に整形済み`ItemInput`を`{ ok: true, value }`で返す。

---

## Step 4. items 一覧/作成 `src/app/api/v1/items/route.ts`
```ts
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { withUser } from "@/db/client";
import { items, itemsCategories, users } from "@/db/schema";
import { toItem } from "@/db/serialize";
import { getApiUser, unauthorized, badRequest, dbErrorResponse } from "@/lib/auth/api";
import { ITEM_STATUSES, categoryIdsByItem, parseItemBody } from "@/lib/api/items";
import type { ItemStatus } from "@/types/item";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !ITEM_STATUSES.includes(statusParam as ItemStatus)) {
    return badRequest(`invalid status: ${statusParam}`);
  }
  const status = statusParam as ItemStatus | null;

  try {
    const result = await withUser(user.sub, async (tx) => {
      const conds = [isNull(items.deletedAt)];
      if (status) conds.push(eq(items.status, status));
      const rows = await tx.select().from(items).where(and(...conds));
      const linkMap = await categoryIdsByItem(tx, rows.map((r) => r.id));
      return rows.map((r) => ({ ...toItem(r), category_ids: linkMap.get(r.id) ?? [] }));
    });
    return NextResponse.json({ items: result });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
```
**逐行解説（このGETで「APIハンドラの定番形」を理解する）**
- `export const dynamic = "force-dynamic"`: 毎回サーバ実行(キャッシュ無効)。
- `const user = await getApiUser(req); if (!user) return unauthorized();`: **全ハンドラ共通の入口**。Bearer検証、失敗で401。
- `req.nextUrl.searchParams.get("status")`: クエリ`?status=`を取得。
- `if (statusParam && !ITEM_STATUSES.includes(...)) return badRequest(...)`: 不正statusは400。
- `await withUser(user.sub, async (tx) => {...})`: **RLS文脈で実行**(自分の行のみ)。
  - `const conds = [isNull(items.deletedAt)]`: 条件配列。まず「削除されていない」。
  - `if (status) conds.push(eq(items.status, status))`: status指定があれば条件追加。
  - `tx.select().from(items).where(and(...conds))`: 条件をANDで結合して取得。`...conds`はスプレッド。
  - `categoryIdsByItem(tx, rows.map(r=>r.id))`: 各アイテムのカテゴリIDをまとめて取得。
  - `rows.map((r) => ({ ...toItem(r), category_ids: linkMap.get(r.id) ?? [] }))`: `toItem`でDB行をAPI形(snake_case)へ変換し、`category_ids`を付与。
- `return NextResponse.json({ items: result })`: 一覧をJSONで返す。
- `catch (e) { return dbErrorResponse(e) }`: DB例外を400/500に振り分け。

```ts
export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("invalid JSON body"); }
  const parsed = parseItemBody(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const v = parsed.value;

  try {
    const created = await withUser(user.sub, async (tx) => {
      await tx.insert(users)
        .values({ id: user.sub, email: user.email, username: user.email.split("@")[0] })
        .onConflictDoNothing();
      const inserted = await tx.insert(items).values({
        userId: user.sub, status: v.status, name: v.name, janCode: v.janCode,
        quantity: v.quantity, notes: v.notes, actualPrice: v.actualPrice, purchasedAt: v.purchasedAt,
      }).returning();
      const row = inserted[0];
      if (v.categoryIds.length > 0) {
        await tx.insert(itemsCategories).values(v.categoryIds.map((cid) => ({ itemId: row.id, categoryId: cid })));
      }
      return { ...toItem(row), category_ids: v.categoryIds };
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    return dbErrorResponse(e);
  }
}
```
**逐行解説**
- `let body; try { body = await req.json() } catch { return badRequest(...) }`: リクエストボディをJSONとして読む。壊れていれば400。
- `const parsed = parseItemBody(body); if (!parsed.ok) return badRequest(parsed.error)`: 検証。失敗で400。
- `await withUser(user.sub, async (tx) => {...})`内:
  - `tx.insert(users).values({...}).onConflictDoNothing()`: **FK対策**。`items.user_id → users.id`のため、API専用クライアント(Web未ログイン)でも動くよう`users`行を先に確保。
  - `tx.insert(items).values({...}).returning()`: アイテム挿入し全列を取得(`returning()`)。
  - `if (v.categoryIds.length > 0) { tx.insert(itemsCategories)... }`: カテゴリ紐付けを挿入。
  - `return { ...toItem(row), category_ids: v.categoryIds }`: 作成結果をAPI形で返す。
- `NextResponse.json({ item: created }, { status: 201 })`: **201 Created**で返す。

---

## Step 5. items 取得/更新/削除 `src/app/api/v1/items/[id]/route.ts`
```ts
function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
```
**逐行解説**: パスの`id`文字列を正の整数に。不正なら`null`(呼び元が400)。

```ts
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  const id = parseId((await ctx.params).id);
  if (id == null) return badRequest("invalid id");
  try {
    const result = await withUser(user.sub, async (tx) => {
      const rows = await tx.select().from(items).where(eq(items.id, id)).limit(1);
      if (!rows[0]) return null;
      const linkMap = await categoryIdsByItem(tx, [id]);
      return { ...toItem(rows[0]), category_ids: linkMap.get(id) ?? [] };
    });
    if (!result) return jsonError(404, "not found");
    return NextResponse.json({ item: result });
  } catch (e) { return dbErrorResponse(e); }
}
```
**逐行解説**
- 第2引数`ctx: { params: Promise<{ id: string }> }`: 動的セグメント。Next 15では`params`がPromiseなので`await ctx.params`。
- `const id = parseId((await ctx.params).id)`: idを整数化。不正なら400。
- `tx.select().from(items).where(eq(items.id, id)).limit(1)`: 1件取得。RLSで他人の行は見えないので、`!rows[0]`なら`null`→**404**。
- 取得できれば`toItem`＋`category_ids`で返す。

```ts
export async function PUT(req, ctx) {
  /* getApiUser → parseId → req.json → parseItemBody */
  const result = await withUser(user.sub, async (tx) => {
    const updated = await tx.update(items).set({ /* v各項目 */ }).where(eq(items.id, id)).returning();
    if (!updated[0]) return null;
    await tx.delete(itemsCategories).where(eq(itemsCategories.itemId, id));
    if (v.categoryIds.length > 0) await tx.insert(itemsCategories).values(/* 置換 */);
    return { ...toItem(updated[0]), category_ids: v.categoryIds };
  });
  if (!result) return jsonError(404, "not found");
  return NextResponse.json({ item: result });
}
```
**逐行解説**
- 入口はPOSTと同様(認証・id・body検証)。
- `tx.update(items).set({...}).where(eq(items.id, id)).returning()`: 更新し、更新後の行を取得。`!updated[0]`(0件=他人/存在しない)なら**404**。
- カテゴリは**置換**: `delete`で全消し→`insert`で入れ直す。
- 更新後の行を返す。

```ts
export async function DELETE(req, ctx) {
  const deleted = await withUser(user.sub, async (tx) => {
    const rows = await tx.select({ imageUrl: items.imageUrl }).from(items).where(eq(items.id, id)).limit(1);
    if (!rows[0]) return false;
    if (rows[0].imageUrl) await deleteImage(rows[0].imageUrl);
    await tx.delete(items).where(eq(items.id, id));
    return true;
  });
  if (!deleted) return jsonError(404, "not found");
  return new NextResponse(null, { status: 204 });
}
```
**逐行解説**
- 先に`image_url`を読み、あれば`deleteImage`でS3からも削除。
- `tx.delete(items).where(eq(items.id, id))`: 行削除(関連は`on delete cascade`)。
- 対象が無ければ404、成功は**204 No Content**(本文なし)。

---

## Step 6. categories `route.ts` / `[id]/route.ts`
```ts
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  try {
    const result = await withUser(user.sub, async (tx) => {
      const rows = await tx.select().from(categories);
      return rows.map(toCategory);
    });
    return NextResponse.json({ categories: result });
  } catch (e) { return dbErrorResponse(e); }
}
```
**逐行解説**
- `tx.select().from(categories)`: RLSの`categories_select`(`is_preset or user_id=自分`)により、**プリセット＋自分のカテゴリ**だけが返る。
- `rows.map(toCategory)`: API形に変換して返す。

```ts
export async function POST(req: NextRequest) {
  /* getApiUser, req.json */
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return badRequest("name is required");
  if (b.color !== undefined && typeof b.color !== "string") return badRequest("color must be a string");
  const color = typeof b.color === "string" && b.color.trim() ? b.color.trim() : undefined;
  try {
    const { category, created } = await withUser(user.sub, async (tx) => {
      await tx.insert(users).values({ id: user.sub, email: user.email, username: user.email.split("@")[0] }).onConflictDoNothing();
      const inserted = await tx.insert(categories).values({ userId: user.sub, name, ...(color ? { color } : {}) }).onConflictDoNothing().returning();
      if (inserted[0]) return { category: toCategory(inserted[0]), created: true };
      const found = await tx.select().from(categories).where(and(eq(categories.userId, user.sub), eq(categories.name, name))).limit(1);
      return { category: toCategory(found[0]), created: false };
    });
    return NextResponse.json({ category }, { status: created ? 201 : 200 });
  } catch (e) { return dbErrorResponse(e); }
}
```
**逐行解説**
- `name`必須、`color`は任意(文字列のみ)。`...(color ? { color } : {})`は**色指定があるときだけ`color`を含める**(無ければDB既定色)。
- `users`行を確保(FK対策)。
- `tx.insert(categories).values({...}).onConflictDoNothing().returning()`: 挿入。`unique(user_id, name)`衝突時は何も挿入されず`inserted[0]`が空。
  - 挿入できた→`created: true`。
  - 衝突(既存)→`select`で既存を引き、`created: false`。
- `status: created ? 201 : 200`: 新規は201、既存返却は200。

```ts
// categories/[id]/route.ts
export async function DELETE(req, ctx) {
  const deleted = await withUser(user.sub, async (tx) => {
    const rows = await tx.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
    return rows.length > 0;
  });
  if (!deleted) return jsonError(404, "not found");
  return new NextResponse(null, { status: 204 });
}
```
**逐行解説**
- `tx.delete(categories).where(eq(categories.id, id)).returning(...)`: 削除。RLS`categories_delete`(`user_id=自分`)により、**プリセット(user_id null)や他人の行は対象外**＝0件→404。
- 自分のカテゴリが消えれば204。

---

## Step 7. export `src/app/api/v1/export/route.ts`
```ts
export async function GET(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return unauthorized();
  try {
    const { exportedCategories, exportedItems } = await withUser(user.sub, async (tx) => {
      const catRows = await tx.select().from(categories).where(eq(categories.userId, user.sub));
      const itemRows = await tx.select().from(items);
      const linkMap = await categoryIdsByItem(tx, itemRows.map((r) => r.id));
      return {
        exportedCategories: catRows.map(toCategory),
        exportedItems: itemRows.map((r) => ({ ...toItem(r), category_ids: linkMap.get(r.id) ?? [] })),
      };
    });
    const payload = { version: 1, exported_at: new Date().toISOString(), categories: exportedCategories, items: exportedItems };
    return NextResponse.json(payload);
  } catch (e) { return dbErrorResponse(e); }
}
```
**逐行解説**
- `catRows`: `where(eq(categories.userId, user.sub))`で**自作カテゴリのみ**(プリセットは取り込み先に既存のため除外)。
- `itemRows`: 自分の全アイテム(RLS)。
- `linkMap`/`map(...)`: 各アイテムに`category_ids`を付与。
- `payload`: `version`/`exported_at`(ISO時刻)/`categories`/`items`をまとめて返す。

---

## Step 8. 型チェック & 動作確認
```bash
npx tsc --noEmit
npm run dev
```
**逐行解説**
- `npx tsc --noEmit`: 型エラーが無いか確認(出力なし)。
- `npm run dev`: ローカル起動。別ターミナルでトークン取得＋curl(下記)。

```bash
CLIENT_ID=$(aws ssm get-parameter --region ap-northeast-1 --name /mono-log/cognito/client_id --query Parameter.Value --output text)
TOKEN=$(aws cognito-idp initiate-auth --region ap-northeast-1 \
  --auth-flow USER_PASSWORD_AUTH --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME=you@example.com,PASSWORD='YourPassw0rd' \
  --query 'AuthenticationResult.IdToken' --output text)
BASE=http://localhost:3000/api/v1
curl -s -X POST "$BASE/items" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"api-test","status":"owned","quantity":1}'
curl -s "$BASE/items" -H "Authorization: Bearer $TOKEN"
```
**逐行解説**
- `CLIENT_ID=$(...)`: SSMからCognitoクライアントIDを取得。
- `TOKEN=$(aws cognito-idp initiate-auth ...)`: email/passwordでログインし**IDトークン**を取り出す(`--query 'AuthenticationResult.IdToken'`)。
- `curl -X POST .../items -H "Authorization: Bearer $TOKEN" -d '{...}'`: 作成。`-H "Content-Type: application/json"`でJSON指定。
- `curl .../items -H "Authorization: Bearer $TOKEN"`: 一覧取得。

本番反映は[12章のデプロイ](setup-guide.md#12-デプロイビルド--ecr--コンテナ起動)。

---

## まとめ・制約
- 仕様とcurl例: [APIリファレンス](api-reference.md)。
- v1未対応(将来): 画像アップロード・plan/listingのAPI公開・CORS・ページング・レート制限。
