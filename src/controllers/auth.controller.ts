import prisma from "../configs/prisma";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as userService from "../services/user.service";
import * as authService from "../services/auth.service";
import {
    createAccessToken,
    createRefreshToken,
    createTwoFactorToken,
    verifyRefreshToken,
    verifyTwoFactorToken,
} from "../utils/token";
import {
    generateSecret,
    verify,
    generateURI
} from "otplib";
import type { AuthRequest } from "../middlewares/auth.middleware";

export const register = async (req: Request, res: Response) => {
    try {
        const { 
            email,
            password,
            firstName,
            lastName,
            userName,
            phoneNumber,
        } = req.body;

        if (!email || !password || !firstName || !lastName || !phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        //const normalizedUserName = userName.trim().toLowerCase();
        const normalizedPhoneNumber = phoneNumber.replace(/\s/g, "");

        const existingUser = await userService.getUserByEmail(normalizedEmail);
        const existinguserName = await userService.getUserByUserName(userName);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already exists",
            });
        }
        if (existinguserName) {
            return res.status(409).json({
                success: false,
                message: "Username already exists",
            });
        }

        const passwordHash = await authService.hashPassword(password);

        const user = await userService.createUser(normalizedEmail, passwordHash, firstName, lastName, userName, normalizedPhoneNumber);

        return res.status(201).json({
            success: true,
            message: "Register successfully",
            data: {
                id: user.id.toString(),
                email: user.email,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const user = await userService.getUserByEmail(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        if (!user.password) {
            return res.status(401).json({
                success: false,
                message: "Tài khoản này được đăng nhập bằng Google. Vui lòng bấm Đăng nhập với Google.",
            });
        }

        const passwordValid =
            await authService.comparePassword(
                password,
                user.password
            );

        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const twoFactor = await authService.getTwoFactor(user.id);

        if (twoFactor?.is_enabled) {
            const challengeToken = createTwoFactorToken(user.id);

            return res.status(200).json({
                success: true,
                requires2FA: true,
                challengeToken,
            });
        }

        const accessToken = createAccessToken(user.id);
        const refreshToken = createRefreshToken(user.id);

        await authService.saveRefreshToken(user.id, refreshToken);

        res.cookie(
            "refreshToken",
            refreshToken,
            {
                httpOnly: true,
                secure:
                    process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge:
                    7 *
                    24 *
                    60 *
                    60 *
                    1000,
            }
        );

        return res.status(200).json({
            success: true,
            requires2FA: false,
            accessToken,
            user: {
                id: user.id.toString(),
                email: user.email,
                userName: user.user_name,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const refresh = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: "Refresh token missing",
            });
        }

        const payload = verifyRefreshToken(refreshToken) as {
            userId: string;
            type: string;
        };

        if (payload.type !== "refresh") {
            return res.status(401).json({
                success: false,
                message: "Invalid refresh token",
            });
        }

        const savedToken = await authService.findRefreshToken(refreshToken);

        if (!savedToken) {
            return res.status(401).json({
                success: false,
                message: "Refresh token not found",
            });
        }

        const user = await userService.getUserById(BigInt(payload.userId));

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        const accessToken = createAccessToken(user.id);

        return res.status(200).json({
            success: true,
            accessToken,
            user: {
                id: user.id.toString(),
                email: user.email,
                userName: user.user_name,
            },
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired refresh token",
        });
    }
};

export const setup2FA = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        const secret = generateSecret();

        await prisma.user_two_factor_auth.upsert({
            where: {
                user_id: userId,
            },
            update: {
                secret,
                is_enabled: false,
                enabled_at: null,
            },
            create: {
                user_id: userId,
                secret,
                is_enabled: false,
            },
        });

        const otpauth = generateURI({
            secret,
            issuer: "NexChat",
            label: userId.toString(),
        });

        return res.status(200).json({
            success: true,
            otpauth,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const enable2FA = async (req: AuthRequest, res: Response) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "OTP code is required",
            });
        }

        const config =
            await prisma.user_two_factor_auth.findUnique({
                where: {
                    user_id: req.userId!,
                },
            });

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "2FA not configured",
            });
        }

        const result = await verify({
            token: code,
            secret: config.secret,
        });

        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        await prisma.user_two_factor_auth.update({
            where: {
                user_id: req.userId!,
            },
            data: {
                is_enabled: true,
                enabled_at: new Date(),
            },
        });

        return res.status(200).json({
            success: true,
            message: "2FA enabled successfully",
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const verify2FA = async (req: Request, res: Response) => {
    try {
        const {
            challengeToken,
            code,
        } = req.body;

        const payload = verifyTwoFactorToken(challengeToken) as {
            userId: string;
            type: string;
        };

        if (payload.type !== "2fa") {
            return res.status(401).json({
                success: false,
                message: "Invalid 2FA challenge",
            });
        }

        const userId = BigInt(payload.userId);

        const config =
            await authService.getTwoFactor(userId);

        if (!config || !config.is_enabled) {
            return res.status(400).json({
                success: false,
                message: "2FA not enabled",
            });
        }

        const result = await verify({
            token: code,
            secret: config.secret,
        });

        if (!result.valid) {
            return res.status(401).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        const accessToken = createAccessToken(userId);

        const refreshToken = createRefreshToken(userId);

        await authService.saveRefreshToken(
            userId,
            refreshToken
        );

        res.cookie(
            "refreshToken",
            refreshToken,
            {
                httpOnly: true,
                secure:
                    process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge:
                    7 *
                    24 *
                    60 *
                    60 *
                    1000,
            }
        );

        return res.status(200).json({
            success: true,
            accessToken,
        });
    } catch (error) {
        console.error("VERIFY 2FA ERROR:", error);

        return res.status(401).json({
            success: false,
            message: "Invalid 2FA challenge",
        });
    }
};

export const logout = async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
    }

    res.clearCookie("refreshToken");

    return res.status(200).json({
        success: true,
        message: "Logout successfully",
    });
};
export const googleLogin = async (req: Request, res: Response) => {
    try {
        const { credential, accessToken: googleAccessToken } = req.body;

        if (!credential && !googleAccessToken) {
            return res.status(400).json({
                success: false,
                message: "Google token is required",
            });
        }

        const user = await authService.loginOrRegisterWithGoogle({
            credential,
            accessToken: googleAccessToken,
        });

        const accessToken = createAccessToken(user.id);
        const refreshToken = createRefreshToken(user.id);

        await authService.saveRefreshToken(user.id, refreshToken);

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            requires2FA: false,
            accessToken,
            user: {
                id: user.id.toString(),
                email: user.email,
                userName: user.user_name,
                firstName: user.first_name,
                lastName: user.last_name,
                avatar: user.avatar,
            },
        });
    } catch (error: any) {
        console.error("Google login error:", error);
        if (error.message === "ACCOUNT_BLOCKED") {
            return res.status(403).json({
                success: false,
                message: "Tài khoản của bạn đã bị khóa",
            });
        }
        return res.status(401).json({
            success: false,
            message: "Xác thực Google không thành công",
        });
    }
};
