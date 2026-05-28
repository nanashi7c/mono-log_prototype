import { createClient } from "@/lib/supabase/server";
import ItemForm from "@/components/item-form";
import { createItem } from "../actions";
import type { Category, Platform, Service, Size } from "@/types/item";

export const dynamic = "force-dynamic";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [categoriesRes, platformsRes, servicesRes, sizesRes] = await Promise.all([
    supabase.from("categories").select("id, name, color").order("name", { ascending: true }),
    supabase.from("platforms").select("id, name").order("name", { ascending: true }),
    supabase.from("services").select("id, shipping_service").order("shipping_service", { ascending: true }),
    supabase.from("sizes").select("id, shipping_size").order("shipping_size", { ascending: true }),
  ]);

  return (
    <ItemForm
      mode="create"
      categories={(categoriesRes.data ?? []) as Pick<Category, "id" | "name" | "color">[]}
      platforms={(platformsRes.data ?? []) as Pick<Platform, "id" | "name">[]}
      services={(servicesRes.data ?? []) as Pick<Service, "id" | "shipping_service">[]}
      sizes={(sizesRes.data ?? []) as Pick<Size, "id" | "shipping_size">[]}
      action={createItem}
      error={error}
    />
  );
}
