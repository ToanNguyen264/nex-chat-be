import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import * as postService from "../services/post.service";

export const createPost = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { content } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (typeof content !== "string" || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: "Content is required",
            });
        }

        const post = await postService.createPost(
            userId,
            content.trim()
        );

        return res.status(201).json({
            success: true,
            message: "Post created successfully",
            data: {
                ...post,
                id: post.id.toString(),
                user_id: post.user_id.toString(),
            },
        });
    } catch (error) {
        console.error("CREATE POST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};


export const getPosts = async (
    _req: AuthRequest,
    res: Response
) => {
    try {
        const posts = await postService.getPosts();

        const data = posts.map((post) => ({
            ...post,
            id: post.id.toString(),
            user_id: post.user_id.toString(),
        }));

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("GET POSTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const deletePost = async (
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

        if (!id || Array.isArray(id) || !/^\d+$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID",
            });
        }

        const result = await postService.deletePost(
            BigInt(id),
            userId
        );

        if (result.count === 0) {
            return res.status(404).json({
                success: false,
                message: "Post not found or you cannot delete it",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Post deleted successfully",
        });
    } catch (error) {
        console.error("DELETE POST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
