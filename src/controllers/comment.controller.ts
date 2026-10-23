import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import * as commentService from "../services/comment.service";

const isValidId = (id: unknown): id is string =>
    typeof id === "string" && /^\d+$/.test(id);

const serializeComment = <T extends {
    id: bigint;
    post_id: bigint;
    user_id: bigint;
    parent_comment_id: bigint | null;
}>(comment: T) => ({
    ...comment,
    id: comment.id.toString(),
    post_id: comment.post_id.toString(),
    user_id: comment.user_id.toString(),
    parent_comment_id:
        comment.parent_comment_id?.toString() ?? null,
});

export const getPostComments = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID",
            });
        }

        const comments = await commentService.getCommentsByPostId(
            BigInt(id),
            userId
        );

        if (!comments) {
            return res.status(404).json({
                success: false,
                message: "Post not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: comments.map(serializeComment),
        });
    } catch (error) {
        console.error("GET POST COMMENTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const createPostComment = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const content =
            typeof req.body.content === "string"
                ? req.body.content.trim()
                : "";

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID",
            });
        }

        if (!content) {
            return res.status(400).json({
                success: false,
                message: "Comment content is required",
            });
        }

        if (content.length > 2000) {
            return res.status(400).json({
                success: false,
                message: "Comment is too long",
            });
        }

        const comment = await commentService.createComment(
            BigInt(id),
            userId,
            content
        );

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Post not found",
            });
        }

        return res.status(201).json({
            success: true,
            message: "Comment created successfully",
            data: serializeComment(comment),
        });
    } catch (error) {
        console.error("CREATE POST COMMENT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
