import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "mono-log",
  description: "所有物管理アプリ",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="ja">
      <body>
        <NavBar email={user?.email ?? null} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
