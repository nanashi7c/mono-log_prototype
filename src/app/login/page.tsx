import Link from "next/link";
import { login } from "./actions";
import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const { error, redirect } = await searchParams;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>ログイン</h1>
      <form action={login} className={styles.form}>
        {redirect ? <input type="hidden" name="redirect" value={redirect} /> : null}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>メール</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={styles.input}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>パスワード</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={styles.input}
          />
        </label>
        {error ? <p className={styles.error}>{decodeURIComponent(error)}</p> : null}
        <button type="submit" className={styles.submit}>
          ログイン
        </button>
      </form>
      <p className={styles.footer}>
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className={styles.footerLink}>
          新規登録
        </Link>
      </p>
    </div>
  );
}
