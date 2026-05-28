import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/image";
import ItemForm from "@/components/item-form";
import { deleteItem, updateItem } from "../../actions";
import type { Category, Item } from "@/types/item";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: item }, { data: categories }] = await Promise.all([
    supabase.from("items").select("*").eq("id", id).single(),
    supabase.from("categories").select("id, name, color").order("name", { ascending: true }),
  ]);

  if (!item) notFound();

  const imageUrl = await signedImageUrl((item as Item).image_path);

  const updateAction = updateItem.bind(null, id);
  const deleteAction = deleteItem.bind(null, id);

  return (
    <ItemForm
      mode="edit"
      item={item as Item}
      imageUrl={imageUrl}
      categories={(categories ?? []) as Pick<Category, "id" | "name" | "color">[]}
      action={updateAction}
      onDelete={deleteAction}
      error={error}
    />
  );
}
