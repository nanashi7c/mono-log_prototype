import { createClient } from "@/lib/supabase/server";
import ItemForm from "@/components/item-form";
import { createItem } from "../actions";
import type { Category } from "@/types/item";

export const dynamic = "force-dynamic";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color")
    .order("name", { ascending: true });

  return (
    <ItemForm
      mode="create"
      categories={(categories ?? []) as Pick<Category, "id" | "name" | "color">[]}
      action={createItem}
      error={error}
    />
  );
}
