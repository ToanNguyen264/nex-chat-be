import multer from "multer";
import type { NextFunction, Request, Response } from "express";

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",

    "video/mp4",
    "video/webm",
    "video/quicktime",

    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/webm",
]);

const upload = multer({
    storage: multer.memoryStorage(), // lưu ở ram đã rồi mới đẩy lên s3

    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 20,
    },

    fileFilter: (_req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return callback(
                new Error("Unsupported file type")
            );
        }

        callback(null, true);
    },
});

export const uploadPostMedia = upload.array("media", 20);

const messageMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        const allowedMessageMediaTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "audio/mpeg",
            "audio/wav",
            "audio/ogg",
            "audio/mp4",
            "audio/webm",
        ]);

        if (!allowedMessageMediaTypes.has(file.mimetype)) {
            return callback(
                new Error("Only image and audio files are allowed")
            );
        }

        callback(null, true);
    },
});

export const uploadMessageMedia = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    messageMediaUpload.single("media")(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        const message =
            error instanceof multer.MulterError &&
            error.code === "LIMIT_FILE_SIZE"
                ? "Message media must not exceed 25 MB"
                : error instanceof Error
                  ? error.message
                  : "Invalid message media";

        res.status(400).json({
            success: false,
            message,
        });
    });
};

const profileImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        const allowedProfileImageTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
        ]);

        if (!allowedProfileImageTypes.has(file.mimetype)) {
            return callback(new Error("Only image files are allowed"));
        }

        callback(null, true);
    },
});

const handleProfileImageUpload = (fieldName: string) => {
    const middleware = profileImageUpload.single(fieldName);

    return (req: Request, res: Response, next: NextFunction) => {
        middleware(req, res, (error) => {
            if (!error) {
                next();
                return;
            }

            const message = error instanceof multer.MulterError &&
                error.code === "LIMIT_FILE_SIZE"
                ? "Image must not exceed 10 MB"
                : error instanceof Error
                    ? error.message
                    : "Invalid image upload";

            res.status(400).json({
                success: false,
                message,
            });
        });
    };
};

export const uploadProfileAvatar = handleProfileImageUpload("avatar");
export const uploadProfileCover = handleProfileImageUpload("coverImage");
