import Link from "next/link";
import styles from "./nav-bar.module.css";

export default function NavBar({ email }: { email: string | null }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          mono-log
        </Link>
        {email ? (
          <nav className={styles.nav}>
            <Link href="/" className={styles.link}>
              一覧
            </Link>
            <Link href="/dashboard" className={styles.link}>
              ダッシュボード
            </Link>
            <Link href="/items/new" className={styles.cta}>
              + 追加
            </Link>
            <span className={styles.email}>{email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className={styles.logout}>
                ログアウト
              </button>
            </form>
          </nav>
        ) : (
          <nav className={styles.navGuest}>
            <Link href="/login" className={styles.link}>
              ログイン
            </Link>
            <Link href="/signup" className={styles.cta}>
              新規登録
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
