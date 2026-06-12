import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
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
    const itemRow = await tx.item.findFirst({ where: { id: BigInt(itemId) } });
    if (!itemRow) return null;
    const item: Item = toItem(itemRow);

    const planRow = await tx.plan.findUnique({ where: { itemId: BigInt(itemId) } });
    const plan: Plan | null = planRow ? toPlan(planRow) : null;

    const listingRow = await tx.listing.findUnique({ where: { itemId: BigInt(itemId) } });
    const listing: Listing | null = listingRow ? toListing(listingRow) : null;

    const links = await tx.itemCategory.findMany({
      where: { itemId: BigInt(itemId) },
      select: { categoryId: true },
    });
    const selectedCategoryIds = links.map((r) => r.categoryId);

    const cats = await tx.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    });
    const plats = await tx.platform.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const svcs = (
      await tx.service.findMany({
        orderBy: { shippingService: "asc" },
        select: { id: true, shippingService: true },
      })
    ).map((s) => ({ id: s.id, shipping_service: s.shippingService }));
    const szs = (
      await tx.size.findMany({
        orderBy: { shippingSize: "asc" },
        select: { id: true, shippingSize: true },
      })
    ).map((s) => ({ id: s.id, shipping_size: s.shippingSize }));

    // listings の shipping_id 参照からフォーム初期値の service/size を解決する。
    let initialServiceId: number | null = null;
    let initialSizeId: number | null = null;
    if (listing?.shipping_id != null) {
      const sh = await tx.shipping.findUnique({
        where: { id: BigInt(listing.shipping_id) },
        select: { shippingServiceId: true, shippingSizeId: true },
      });
      initialServiceId = sh?.shippingServiceId ?? null;
      initialSizeId = sh?.shippingSizeId ?? null;
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
