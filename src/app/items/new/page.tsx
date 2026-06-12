import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/db/client";
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
