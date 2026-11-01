import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import * as followService from "../services/follow.service";
import { FollowError } from "../services/follow.service";

/*
 * Controller tiếp nhận HTTP Request cho phân hệ Follow
 */

const getParamUserId = (param: string | string[] | undefined): string | null => {
    if (!param) return null;
    const value = Array.isArray(param) ? param[0] : param;
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    return value;
};

export const follow = async (req: AuthRequest, res: Response) => {
    try {
        const viewerId = req.userId;
        if (!viewerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const targetUserId = getParamUserId(req.params.targetUserId);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Invalid target user ID" });
        }

        const result = await followService.followUser(viewerId, BigInt(targetUserId));

        return res.status(200).json({
            success: true,
            message: "Đã theo dõi người dùng",
            data: result,
        });
    } catch (error: any) {
        if (error instanceof FollowError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("FOLLOW ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const unfollow = async (req: AuthRequest, res: Response) => {
    try {
        const viewerId = req.userId;
        if (!viewerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const targetUserId = getParamUserId(req.params.targetUserId);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Invalid target user ID" });
        }

        const result = await followService.unfollowUser(viewerId, BigInt(targetUserId));

        return res.status(200).json({
            success: true,
            message: "Đã hủy theo dõi người dùng",
            data: result,
        });
    } catch (error: any) {
        if (error instanceof FollowError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("UNFOLLOW ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};
/* check xem mình đã theo dõi người dùng này chưa */
export const getStatus = async (req: AuthRequest, res: Response) => {
    try {
        const viewerId = req.userId;
        if (!viewerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const targetUserId = getParamUserId(req.params.targetUserId);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Invalid target user ID" });
        }

        const result = await followService.getFollowStatus(viewerId, BigInt(targetUserId));

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("GET FOLLOW STATUS ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getFollowers = async (req: AuthRequest, res: Response) => {
    try {
        const targetUserId = getParamUserId(req.params.targetUserId);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Invalid target user ID" });
        }

        const cursor = req.query.cursor ? BigInt(String(req.query.cursor)) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 20;

        const result = await followService.getFollowers(BigInt(targetUserId), cursor, limit);

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("GET FOLLOWERS ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getFollowing = async (req: AuthRequest, res: Response) => {
    try {
        const targetUserId = getParamUserId(req.params.targetUserId);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Invalid target user ID" });
        }

        const cursor = req.query.cursor ? BigInt(String(req.query.cursor)) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 20;

        const result = await followService.getFollowing(BigInt(targetUserId), cursor, limit);

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("GET FOLLOWING ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};
