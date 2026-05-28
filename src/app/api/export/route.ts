import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("categories").select("id, name, color, created_at"),
    supabase
      .from("items")
      .select("id, category_id, name, notes, purchase_date, price_yen, tags, image_path, created_at, updated_at"),
  ]);

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    categories: categories ?? [],
    items: items ?? [],
  };

  const filename = `mono-log-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
