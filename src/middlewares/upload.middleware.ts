import multer from "multer";

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
        fileSize: 50 * 1024 * 1024,
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
