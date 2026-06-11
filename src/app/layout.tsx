import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import NavBar from "@/components/nav-bar";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "mono-log",
  description: "所有物管理アプリ",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <NavBar email={user?.email ?? null} />
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
