import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <p className={styles.code}>404</p>
      <p className={styles.message}>ページが見つかりません。</p>
      <Link href="/" className={styles.link}>
        ホームへ
      </Link>
    </div>
  );
}
