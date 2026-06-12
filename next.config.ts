import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 用: .next/standalone に最小実行ファイルをまとめ、軽量イメージにする
  output: "standalone",
  // Prisma はネイティブのクエリエンジンを使うため、バンドルせず node_modules から解決させる
  serverExternalPackages: ["@prisma/client", "prisma"],
  images: {
    // S3 の署名付き URL を next/image で表示できるよう許可する。
    // 既定は仮想ホスト形式 <bucket>.s3.<region>.amazonaws.com。パス形式も一応許可。
    remotePatterns: [
      { protocol: "https", hostname: "*.s3.ap-northeast-1.amazonaws.com" },
      { protocol: "https", hostname: "s3.ap-northeast-1.amazonaws.com" },
    ],
  },
};

export default nextConfig;
