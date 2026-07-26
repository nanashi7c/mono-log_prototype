"use client";

import Link from "next/link";
import { useState } from "react";
import { logoutAction } from "@/app/auth/actions";
import styles from "./nav-bar.module.css";

export default function NavBar({ email }: { email: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} onClick={closeMenu}>
          mono-log
        </Link>

        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.visuallyHidden}>
            {menuOpen ? "メニューを閉じる" : "メニューを開く"}
          </span>
          <span
            aria-hidden="true"
            className={`${styles.menuIcon} ${menuOpen ? styles.menuIconOpen : ""}`}
          />
        </button>

        <div
          className={`${styles.menuPanel} ${menuOpen ? styles.menuPanelOpen : ""}`}
        >
          {email ? (
            <nav id="primary-navigation" className={styles.nav}>
              <Link href="/items" className={styles.link} onClick={closeMenu}>
                所有物
              </Link>
              <Link
                href="/items/planned"
                className={styles.link}
                onClick={closeMenu}
              >
                購入予定
              </Link>
              <Link
                href="/items/selling"
                className={styles.link}
                onClick={closeMenu}
              >
                出品中
              </Link>
              <Link
                href="/dashboard"
                className={styles.link}
                onClick={closeMenu}
              >
                ダッシュボード
              </Link>
              <Link
                href="/items/new"
                className={styles.cta}
                onClick={closeMenu}
              >
                + 追加
              </Link>
              <Link
                href="/mypage"
                className={styles.email}
                onClick={closeMenu}
              >
                {email}
              </Link>
              <form action={logoutAction}>
                <button type="submit" className={styles.logout}>
                  ログアウト
                </button>
              </form>
            </nav>
          ) : (
            <nav id="primary-navigation" className={styles.navGuest}>
              <Link href="/login" className={styles.link} onClick={closeMenu}>
                ログイン
              </Link>
              <Link href="/signup" className={styles.cta} onClick={closeMenu}>
                新規登録
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
