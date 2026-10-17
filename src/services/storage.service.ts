import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";

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

    await s3.send(
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

export const getPublicMediaUrl = (objectKey: string): string => {
    const publicUrl = process.env.S3_PUBLIC_URL;

    if (!publicUrl) {
        throw new Error("S3_PUBLIC_URL is missing");
    }

    return `${publicUrl.replace(/\/$/, "")}/${S3_BUCKET}/${objectKey}`;
};
