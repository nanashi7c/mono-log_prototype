import { createClient as createServerSupabase } from "@/lib/supabase/server";

const BUCKET = "item-images";
const SIGNED_TTL = 60 * 60; // 1 hour

export async function signedImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

export const IMAGE_BUCKET = BUCKET;
