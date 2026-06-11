import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import {
  items,
  plans,
  listings,
  itemsCategories,
  categories,
  platforms,
  services,
  sizes,
  shipping,
} from "@/db/schema";
import { toItem, toPlan, toListing } from "@/db/serialize";
import { signedImageUrl } from "@/lib/image";
import ItemForm from "@/components/item-form";
import { deleteItem, updateItem } from "../../actions";
import type { Item, Listing, Plan } from "@/types/item";

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

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await withUser(user.sub, async (tx) => {
    const itemRows = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
    if (!itemRows[0]) return null;
    const item: Item = toItem(itemRows[0]);

    const planRows = await tx.select().from(plans).where(eq(plans.itemId, itemId)).limit(1);
    const plan: Plan | null = planRows[0] ? toPlan(planRows[0]) : null;

    const listingRows = await tx.select().from(listings).where(eq(listings.itemId, itemId)).limit(1);
    const listing: Listing | null = listingRows[0] ? toListing(listingRows[0]) : null;

    const links = await tx
      .select({ categoryId: itemsCategories.categoryId })
      .from(itemsCategories)
      .where(eq(itemsCategories.itemId, itemId));
    const selectedCategoryIds = links.map((r) => r.categoryId);

    const cats = await tx
      .select({ id: categories.id, name: categories.name, color: categories.color })
      .from(categories)
      .orderBy(asc(categories.name));
    const plats = await tx
      .select({ id: platforms.id, name: platforms.name })
      .from(platforms)
      .orderBy(asc(platforms.name));
    const svcs = await tx
      .select({ id: services.id, shipping_service: services.shippingService })
      .from(services)
      .orderBy(asc(services.shippingService));
    const szs = await tx
      .select({ id: sizes.id, shipping_size: sizes.shippingSize })
      .from(sizes)
      .orderBy(asc(sizes.shippingSize));

    // listings の shipping_id 参照からフォーム初期値の service/size を解決する。
    let initialServiceId: number | null = null;
    let initialSizeId: number | null = null;
    if (listing?.shipping_id != null) {
      const sh = await tx
        .select({
          serviceId: shipping.shippingServiceId,
          sizeId: shipping.shippingSizeId,
        })
        .from(shipping)
        .where(eq(shipping.id, listing.shipping_id))
        .limit(1);
      initialServiceId = sh[0]?.serviceId ?? null;
      initialSizeId = sh[0]?.sizeId ?? null;
    }

    return {
      item,
      plan,
      listing,
      selectedCategoryIds,
      cats,
      plats,
      svcs,
      szs,
      initialServiceId,
      initialSizeId,
    };
  });

  if (!result) notFound();

  const imageUrl = await signedImageUrl(result.item.image_url);

  const updateAction = updateItem.bind(null, itemId);
  const deleteAction = deleteItem.bind(null, itemId);

  return (
    <ItemForm
      mode="edit"
      item={result.item}
      plan={result.plan}
      listing={result.listing}
      imageUrl={imageUrl}
      categories={result.cats}
      selectedCategoryIds={result.selectedCategoryIds}
      platforms={result.plats}
      services={result.svcs}
      sizes={result.szs}
      initialServiceId={result.initialServiceId}
      initialSizeId={result.initialSizeId}
      action={updateAction}
      onDelete={deleteAction}
      error={error}
    />
  );
}
