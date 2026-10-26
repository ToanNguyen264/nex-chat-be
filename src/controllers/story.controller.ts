import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import * as storyService from "../services/story.service";

export const createStory = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn 1 file hình ảnh hoặc video để đăng tin",
            });
        }

        const content = typeof req.body.content === "string" ? req.body.content : null;

        const story = await storyService.createStory({
            userId,
            file: req.file,
            content,
        });

        return res.status(201).json({
            success: true,
            message: "Đăng tin thành công",
            data: {
                ...story,
                id: story.id.toString(),
                user_id: story.user_id.toString(),
            },
        });
    } catch (error) {
        console.error("CREATE STORY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Internal server error",
        });
    }
};

export const getFeedStories = async (req: AuthRequest, res: Response) => {
    try {
        const viewerId = req.userId;
        if (!viewerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const stories = await storyService.getFeedStories(viewerId); /* lấy toàn bộ danh sách Story dành riêng cho người dùng đang đăng nhập */

        return res.status(200).json({
            success: true,
            data: stories,
        });
    } catch (error) {
        console.error("GET STORIES ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const deleteStory = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!id || Array.isArray(id) || !/^\d+$/.test(id)) {
            return res.status(400).json({ success: false, message: "Invalid story ID" });
        }

        const deleted = await storyService.deleteStory(BigInt(id), userId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Tin không tồn tại hoặc bạn không có quyền xóa",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Xóa tin thành công",
        });
    } catch (error) {
        console.error("DELETE STORY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};