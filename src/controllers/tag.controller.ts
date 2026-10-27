import type { Request, Response } from "express";
import * as tagService from "../services/tag.service";

/*
 * API gợi ý danh sách Hashtag khi người dùng đang gõ
 */
export const getTagSuggestions = async (req: Request, res: Response) => {
    try {
        // 1. Nhận từ khóa tìm kiếm 'q' và số lượng giới hạn 'limit' từ query URL
        const query = typeof req.query.q === "string" ? req.query.q : "";
        const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 5;

        // Nếu người dùng chưa gõ gì thì trả về mảng rỗng ngay
        if (!query.trim()) {
            return res.status(200).json({
                success: true,
                data: [],
            });
        }

        // 2. Gọi sang TagService để tìm kiếm (Hỏi Cây Trie trên RAM trước -> Nếu thiếu thì query bù MySQL)
        const suggestions = await tagService.suggestTags(query, limit);

        // 3. Trả kết quả về cho Frontend
        return res.status(200).json({
            success: true,
            data: suggestions,
        });
    } catch (error) {
        console.error("[TagController] Lỗi gợi ý tag:", error);
        return res.status(500).json({
            success: false,
            message: "Đã có lỗi xảy ra khi gợi ý hashtag",
        });
    }
};