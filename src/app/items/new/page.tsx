import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
import { categories, platforms, services, sizes } from "@/db/schema";
import ItemForm from "@/components/item-form";
import { createItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await withUser(user.sub, async (tx) => {
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
    return { cats, plats, svcs, szs };
  });

  return (
    <ItemForm
      mode="create"
      categories={data.cats}
      platforms={data.plats}
      services={data.svcs}
      sizes={data.szs}
      action={createItem}
      error={error}
    />
  );
}
