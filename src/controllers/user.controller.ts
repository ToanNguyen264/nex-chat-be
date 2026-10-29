import type { Request, Response } from "express";
import * as userService from "../services/user.service";
import bcrypt from "bcrypt";
import type { AuthRequest } from "../middlewares/auth.middleware";
import type { UpdateMyProfileInput } from "../services/user.service";
import * as storageService from "../services/storage.service";

const nullableTextFields = {
    bio: 2000,
    workplace: 255,
    education: 255,
    location: 255,
    website: 500,
} as const;

export const getCurrentUser = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const user = await userService.getUserById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                ...user,
                id: user.id.toString(),
            },
        });
    } catch (error) {
        console.error("GET CURRENT USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getUserProfile = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;

        if (!userId || Array.isArray(userId) || !/^\d+$/.test(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        const result = await userService.getUserProfile(BigInt(userId), req.userId);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const { profiles, ...user } = result;
        const fullName = [user.first_name, user.last_name]
            .filter(Boolean)
            .join(" ");

        return res.status(200).json({
            success: true,
            data: {
                ...user,
                id: user.id.toString(),
                display_name:
                    profiles?.display_name ||
                    fullName ||
                    user.user_name ||
                    "NgÆ°á»i dÃ¹ng",
                avatar: profiles?.avatar_url || user.avatar,
                cover_image: profiles?.cover_image ?? null,
                bio: profiles?.bio ?? null,
                birthday: profiles?.birthday ?? null,
                workplace: profiles?.workplace ?? null,
                education: profiles?.education ?? null,
                location: profiles?.location ?? null,
                website: profiles?.website ?? null,
            },
        });
    } catch (error) {
        console.error("GET USER PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({
                success: false,
                message: "Request body must be an object",
            });
        }

        const body = req.body as Record<string, unknown>;
        const allowedFields = [
            "displayName",
            "bio",
            "birthday",
            "workplace",
            "education",
            "location",
            "website",
        ];
        const suppliedFields = allowedFields.filter(
            (field) => body[field] !== undefined
        );

        if (suppliedFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No profile fields were provided",
            });
        }

        const data: UpdateMyProfileInput = {};

        if (body.displayName !== undefined) {
            if (typeof body.displayName !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "displayName must be a string",
                });
            }

            const displayName = body.displayName.trim();

            if (!displayName || displayName.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "displayName must contain 1 to 100 characters",
                });
            }

            data.displayName = displayName;
        }

        for (const [field, maxLength] of Object.entries(nullableTextFields)) {
            const value = body[field];

            if (value === undefined) {
                continue;
            }

            if (value !== null && typeof value !== "string") {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be a string or null`,
                });
            }

            const normalizedValue =
                typeof value === "string" ? value.trim() || null : null;

            if (
                typeof normalizedValue === "string" &&
                normalizedValue.length > maxLength
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must not exceed ${maxLength} characters`,
                });
            }

            data[field as keyof typeof nullableTextFields] = normalizedValue;
        }

        if (typeof data.website === "string") {
            try {
                const websiteUrl = new URL(data.website);

                if (!["http:", "https:"].includes(websiteUrl.protocol)) {
                    throw new Error("Invalid protocol");
                }
            } catch {
                return res.status(400).json({
                    success: false,
                    message: "website must be a valid HTTP or HTTPS URL",
                });
            }
        }

        if (body.birthday !== undefined) {
            if (body.birthday === null || body.birthday === "") {
                data.birthday = null;
            } else if (
                typeof body.birthday === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(body.birthday)
            ) {
                const birthday = new Date(`${body.birthday}T00:00:00.000Z`);

                if (
                    Number.isNaN(birthday.getTime()) ||
                    birthday.toISOString().slice(0, 10) !== body.birthday
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "birthday is not a valid date",
                    });
                }

                data.birthday = birthday;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "birthday must use YYYY-MM-DD format or be null",
                });
            }
        }

        const profile = await userService.updateMyProfile(req.userId, data);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: {
                ...profile,
                id: profile.id.toString(),
                user_id: profile.user_id.toString(),
            },
        });
    } catch (error) {
        console.error("UPDATE MY PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const updateProfileImage = async (
    req: AuthRequest,
    res: Response,
    imageType: "avatar" | "cover"
) => {
    const userId = req.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Image file is required",
        });
    }

    let uploadedUrl: string | null = null;

    try {
        const objectKey = await storageService.uploadProfileImage(
            userId,
            imageType,
            req.file
        );
        uploadedUrl = storageService.getPublicMediaUrl(objectKey);

        const result = await userService.updateMyProfileImage(
            userId,
            imageType,
            uploadedUrl
        );

        if (!result) {
            await storageService.deleteMediaByPublicUrl(uploadedUrl);

            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        try {
            await storageService.deleteMediaByPublicUrl(
                result.previousImageUrl
            );
        } catch (deleteError) {
            console.error("DELETE OLD PROFILE IMAGE ERROR:", deleteError);
        }

        return res.status(200).json({
            success: true,
            message: imageType === "avatar"
                ? "Avatar updated successfully"
                : "Cover image updated successfully",
            data: {
                imageUrl: uploadedUrl,
            },
        });
    } catch (error) {
        if (uploadedUrl) {
            try {
                await storageService.deleteMediaByPublicUrl(uploadedUrl);
            } catch (cleanupError) {
                console.error("CLEANUP PROFILE IMAGE ERROR:", cleanupError);
            }
        }

        console.error("UPDATE PROFILE IMAGE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const updateMyAvatar = async (req: AuthRequest, res: Response) => {
    return updateProfileImage(req, res, "avatar");
};

export const updateMyCoverImage = async (
    req: AuthRequest,
    res: Response
) => {
    return updateProfileImage(req, res, "cover");
};

export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await userService.getAllUser();
        const data = users.map((user) => ({
            ...user,
            id: user.id.toString(),
        }));

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getUser = async (req: Request, res: Response) => {
    try {
        const {id} = req.params;
        if (!id || Array.isArray(id)) {
            return res.status(400).json({
                success: false,
                message: "User ID is required",
            });
        }
        const user = await userService.getUserById(BigInt(id));
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...user,
                id: user.id.toString(),
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const createUser = async (req: Request, res: Response) => {
    try {
        const { email, password, firstName, lastName, userName, avatar } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const existingUser = await userService.getUserByEmail(email);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already exists",
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await userService.createUser(
            email,
            passwordHash,
            firstName,
            lastName,
            userName,
            avatar
        );

        return res.status(201).json({
            success: true,
            message: "User created successfully",
            data: {
                ...user,
                id: user.id.toString(),
            },
        });
    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { email, status, firstName, lastName, userName, avatar } = req.body;

        if (!id || Array.isArray(id) || !/^\d+$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        if (
            status !== undefined &&
            !["active", "inactive"].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid status",
            });
        }

        const existingUser =
            await userService.getUserById(BigInt(id));

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const user = await userService.updateUser(
            BigInt(id),
            {
                email,
                status,
                firstName,
                lastName,
                userName,
                avatar,
            }
        );

        return res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: {
                ...user,
                id: user.id.toString(),
            },
        });
    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!id || Array.isArray(id) || !/^\d+$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        const existingUser = await userService.getUserById(BigInt(id));

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        await userService.deleteUser(BigInt(id));

        return res.status(200).json({
            success: true,
            message: "User deleted successfully",
        });
    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getUserMedia = async (req: AuthRequest, res: Response) => {
    try {
        const viewerId = req.userId;
        const userIdParam = req.params.userId;
        const userId = typeof userIdParam === 'string' ? userIdParam : Array.isArray(userIdParam) ? userIdParam[0] : '';

        if (!viewerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        if (!userId || !/^\d+$/.test(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }

        const type = req.query.type as 'image' | 'video' | undefined;
        const limitQuery = req.query.limit as string | undefined;
        const limit = limitQuery && /^\d+$/.test(limitQuery) ? Math.min(Number(limitQuery), 50) : 20;

        const attachments = await userService.getUserMedia({
            userId: BigInt(userId),
            viewerId,
            type,
            limit,
        });

        const data = attachments.map((att) => ({
            id: att.id.toString(),
            post_id: att.owner_id.toString(),
            file_url: storageService.getPublicMediaUrl(att.file_url),
            file_type: att.file_type,
            file_name: att.file_name,
            created_at: att.created_at,
        }));

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('GET USER MEDIA ERROR:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};