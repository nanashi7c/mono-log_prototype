import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.S3_IMAGE_BUCKET!;
const SIGNED_TTL = 60 * 60; // 1 hour

// 認証情報は環境（ローカルは ~/.aws、EC2 は IAM ロール）から自動取得する。
const s3 = new S3Client({ region: process.env.AWS_REGION });

export const IMAGE_BUCKET = BUCKET;

// S3 オブジェクトキーから署名付き GET URL を生成する。キーが無ければ null。
export async function signedImageUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
      expiresIn: SIGNED_TTL,
    });
  } catch {
    return null;
  }
}

// 画像を S3 に保存する。
export async function putImage(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

// 画像を S3 から削除する。
export async function deleteImage(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
