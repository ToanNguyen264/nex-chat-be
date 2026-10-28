import { OAuth2Client } from "google-auth-library";
import axios from "axios";

export const verifyGoogleToken = async ({
    credential,
    accessToken,
}: {
    credential?: string | undefined;
    accessToken?: string | undefined;
}) => {
    if (credential) {
        const googleClientId = process.env.GOOGLE_CLIENT_ID;
        const client = new OAuth2Client(googleClientId);
        const options: { idToken: string; audience?: string } = {
            idToken: credential,
        };
        if (googleClientId) {
            options.audience = googleClientId;
        }
        const ticket = await client.verifyIdToken(options);
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            throw new Error("INVALID_GOOGLE_TOKEN");
        }
        return {
            googleId: payload.sub,
            email: payload.email.toLowerCase().trim(),
            name: payload.name || "User",
            firstName: payload.given_name || payload.name || "User",
            lastName: payload.family_name || "",
            avatar: payload.picture || null,
        };
    }

    if (accessToken) {
        const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = response.data;
        if (!data || !data.email) {
            throw new Error("INVALID_GOOGLE_TOKEN");
        }
        return {
            googleId: data.sub,
            email: data.email.toLowerCase().trim(),
            name: data.name || "User",
            firstName: data.given_name || data.name || "User",
            lastName: data.family_name || "",
            avatar: data.picture || null,
        };
    }

    throw new Error("MISSING_GOOGLE_TOKEN");
};

export const loginOrRegisterWithGoogle = async ({
    credential,
    accessToken,
}: {
    credential?: string | undefined;
    accessToken?: string | undefined;
}) => {
    const googleProfile = await verifyGoogleToken({
        ...(credential ? { credential } : {}),
        ...(accessToken ? { accessToken } : {}),
    });

    // 1. Tìm user theo google_id
    let user = await prisma.users.findUnique({
        where: { google_id: googleProfile.googleId },
    });

    // 2. Nếu chưa có, tìm theo email để liên kết tài khoản
    if (!user) {
        user = await prisma.users.findUnique({
            where: { email: googleProfile.email },
        });

        if (user) {
            user = await prisma.users.update({
                where: { id: user.id },
                data: {
                    google_id: googleProfile.googleId,
                    ...(googleProfile.avatar && !user.avatar && { avatar: googleProfile.avatar }),
                },
            });
        }
    }

    // 3. Nếu chưa từng tồn tại, tạo mới user
    if (!user) {
        const rawUsername = googleProfile.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
        let username = rawUsername || `user_${Date.now()}`;
        const existingUsername = await prisma.users.findUnique({
            where: { user_name: username },
        });

        if (existingUsername) {
            username = `${rawUsername.slice(0, 20)}_${Math.floor(1000 + Math.random() * 9000)}`;
        }

        user = await prisma.users.create({
            data: {
                email: googleProfile.email,
                google_id: googleProfile.googleId,
                user_name: username,
                first_name: googleProfile.firstName,
                last_name: googleProfile.lastName,
                avatar: googleProfile.avatar,
                status: "active",
                deleted: "NO",
            },
        });

        // Tạo profile hiển thị
        await prisma.profiles.create({
            data: {
                user_id: user.id,
                display_name: googleProfile.name || `${googleProfile.firstName} ${googleProfile.lastName}`.trim(),
                avatar_url: googleProfile.avatar,
            },
        });
    }

    if (user.status === "blocked" || user.deleted === "YES") {
        throw new Error("ACCOUNT_BLOCKED");
    }

    return user;
};

import prisma from "../configs/prisma";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const hashPassword = async (password: string) => {
    return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password: string, passwordHash: string) => {
    return await bcrypt.compare(password, passwordHash);
};

export const hashToken = (token: string) => {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
};

export const saveRefreshToken = async (userId: bigint, token: string) => {
    const tokenHash = hashToken(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return prisma.refresh_tokens.create({
        data: {
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
        },
    });
};

export const findRefreshToken = async (token: string) => {
    const tokenHash = hashToken(token);

    return prisma.refresh_tokens.findFirst({
        where: {
            token_hash: tokenHash,
            revoked_at: null,
            expires_at: {
                gt: new Date(),
            },
        },
    });
};

export const revokeRefreshToken = async (token: string) => {
    const tokenHash = hashToken(token);

    return prisma.refresh_tokens.updateMany({
        where: {
            token_hash: tokenHash,
            revoked_at: null,
        },
        data: {
            revoked_at: new Date(),
        },
    });
};

export const getTwoFactor = async (userId: bigint) => {
    return prisma.user_two_factor_auth.findUnique({
        where: {
            user_id: userId,
        },
    });
};