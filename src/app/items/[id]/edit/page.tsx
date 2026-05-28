import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/image";
import ItemForm from "@/components/item-form";
import { deleteItem, updateItem } from "../../actions";
import type {
  Category,
  Item,
  Listing,
  Plan,
  Platform,
  Service,
  Shipping,
  Size,
} from "@/types/item";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) notFound();

  const { error } = await searchParams;

  const supabase = await createClient();
  const [itemRes, planRes, listingRes, linkRes, categoriesRes, platformsRes, servicesRes, sizesRes] =
    await Promise.all([
      supabase.from("items").select("*").eq("id", itemId).maybeSingle(),
      supabase.from("plans").select("*").eq("item_id", itemId).maybeSingle(),
      supabase.from("listings").select("*").eq("item_id", itemId).maybeSingle(),
      supabase.from("items_categories").select("category_id").eq("item_id", itemId),
      supabase.from("categories").select("id, name, color").order("name", { ascending: true }),
      supabase.from("platforms").select("id, name").order("name", { ascending: true }),
      supabase.from("services").select("id, shipping_service").order("shipping_service", { ascending: true }),
      supabase.from("sizes").select("id, shipping_size").order("shipping_size", { ascending: true }),
    ]);

  const item = itemRes.data as Item | null;
  if (!item) notFound();

  const plan = (planRes.data as Plan | null) ?? null;
  const listing = (listingRes.data as Listing | null) ?? null;
  const selectedCategoryIds = (linkRes.data ?? []).map((r) => r.category_id as number);

  // Resolve service/size from the shipping_id reference for the form's initial values.
  let initialServiceId: number | null = null;
  let initialSizeId: number | null = null;
  if (listing?.shipping_id != null) {
    const { data: ship } = await supabase
      .from("shipping")
      .select("shipping_service_id, shipping_size_id")
      .eq("id", listing.shipping_id)
      .maybeSingle();
    const s = ship as Pick<Shipping, "shipping_service_id" | "shipping_size_id"> | null;
    initialServiceId = s?.shipping_service_id ?? null;
    initialSizeId = s?.shipping_size_id ?? null;
  }

  const imageUrl = await signedImageUrl(item.image_url);

  const updateAction = updateItem.bind(null, itemId);
  const deleteAction = deleteItem.bind(null, itemId);

  return (
    <ItemForm
      mode="edit"
      item={item}
      plan={plan}
      listing={listing}
      imageUrl={imageUrl}
      categories={(categoriesRes.data ?? []) as Pick<Category, "id" | "name" | "color">[]}
      selectedCategoryIds={selectedCategoryIds}
      platforms={(platformsRes.data ?? []) as Pick<Platform, "id" | "name">[]}
      services={(servicesRes.data ?? []) as Pick<Service, "id" | "shipping_service">[]}
      sizes={(sizesRes.data ?? []) as Pick<Size, "id" | "shipping_size">[]}
      initialServiceId={initialServiceId}
      initialSizeId={initialSizeId}
      action={updateAction}
      onDelete={deleteAction}
      error={error}
    />
  );
}
