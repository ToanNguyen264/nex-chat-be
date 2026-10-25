import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import s3 from "../configs/s3";


const S3_BUCKET = process.env.S3_BUCKET;

if (!S3_BUCKET) {
    throw new Error("S3_BUCKET is missing");
}

type UploadFileInput = {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
};

export type UploadedMedia = {
    objectKey: string;
    fileName: string;
    fileType: string;
    fileSize: number;
};

export const uploadPostMedia = async (
    file: UploadFileInput
) : Promise<UploadedMedia> => {
    const extension = extname(file.originalname).toLowerCase();
    const dateFolder = new Date()
        .toISOString()
        .slice(0, 10);

    const objectKey =
        `posts/${dateFolder}/${randomUUID()}${extension}`;

    await s3.send( /* @smithy/signature-v4 của AWS SDK: kí signature */
        new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: objectKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentLength: file.size,
        })
    );

    return {
        objectKey,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
    };
};

export const uploadMessageMedia = async (
    file: UploadFileInput
): Promise<UploadedMedia> => {
    const extension = extname(file.originalname).toLowerCase();
    const dateFolder = new Date().toISOString().slice(0, 10);
    const objectKey =
        `messages/${dateFolder}/${randomUUID()}${extension}`;

    await s3.send( /* @smithy/signature-v4 của AWS SDK: kí signature */
        /* 
            Lấy Host (từ S3_ENDPOINT) + Đường dẫn /${Bucket}/${Key} + Thời gian hiện tại.
            Dùng S3_SECRET_ACCESS_KEY băm (HMAC-SHA256) thành chữ ký và nhét vào HTTP Header Authorization: AWS4-HMAC-SHA256 ... rồi mới gửi lên server MinIO.
        
        */
        new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: objectKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentLength: file.size,
        })
    );

    return {
        objectKey,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
    };
};

export const deleteMessageMedia = async (
    objectKey: string
): Promise<void> => {
    if (!objectKey.startsWith("messages/")) {
        return;
    }

    await s3.send(
        new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: objectKey,
        })
    );
};

export const getPublicMediaUrl = (objectKey: string): string => {
    const publicUrl = process.env.S3_PUBLIC_URL;

    if (!publicUrl) {
        throw new Error("S3_PUBLIC_URL is missing");
    }

    return `${publicUrl.replace(/\/$/, "")}/${S3_BUCKET}/${objectKey}`;
};

type ProfileImageKind = "avatar" | "cover";

export const uploadProfileImage = async (
    userId: bigint,
    kind: ProfileImageKind,
    file: UploadFileInput
): Promise<string> => {
    const extensionsByMimeType: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    };
    const extension = extensionsByMimeType[file.mimetype];

    if (!extension) {
        throw new Error("Unsupported profile image type");
    }

    const objectKey =
        `profiles/${userId.toString()}/${kind}/${randomUUID()}${extension}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: objectKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentLength: file.size,
        })
    );

    return objectKey;
};

export const deleteMediaByPublicUrl = async (
    publicMediaUrl: string | null
): Promise<void> => {
    if (!publicMediaUrl) {
        return;
    }

    const publicUrl = process.env.S3_PUBLIC_URL;

    if (!publicUrl) {
        throw new Error("S3_PUBLIC_URL is missing");
    }

    const expectedPrefix =
        `${publicUrl.replace(/\/$/, "")}/${S3_BUCKET}/`;

    if (!publicMediaUrl.startsWith(expectedPrefix)) {
        return;
    }

    const objectKey = decodeURIComponent(
        publicMediaUrl.slice(expectedPrefix.length)
    );

    if (!objectKey.startsWith("profiles/")) {
        return;
    }

    await s3.send(
        new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: objectKey,
        })
    );
};
