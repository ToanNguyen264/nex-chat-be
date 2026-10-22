import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import * as postService from "../services/post.service";
import * as storageService from "../services/storage.service";
import {
    parsePostListQuery,
    parsePostPrivacy,
    parsePostUpdateInput,
} from "../services/post/post-query";

type FeedPost = Awaited<
    ReturnType<typeof postService.getHomePosts>
>["posts"][number];

const serializePost = (post: FeedPost) => ({
    ...post,
    id: post.id.toString(),
    user_id: post.user_id.toString(),
    attachments: post.attachments.map((attachment) => ({
        ...attachment,
        id: attachment.id.toString(),
        owner_id: attachment.owner_id.toString(),
        file_url: storageService.getPublicMediaUrl(
            attachment.file_url
        ),
        file_size: attachment.file_size?.toString() ?? null,
    })),
});

export const createPost = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const content =
            typeof req.body.content === "string"
                ? req.body.content.trim()
                : "";

        const files = Array.isArray(req.files)
            ? req.files
            : [];
        const privacy = parsePostPrivacy(req.body.privacy);

        if (!privacy) {
            return res.status(400).json({
                success: false,
                message: "Invalid post privacy",
            });
        }

        if (!content && files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Content or media is required",
            });
        }

        const media = await Promise.all(
            files.map((file) =>
                storageService.uploadPostMedia(file)
            )
        );

        const post = await postService.createPost(
            userId,
            content,
            privacy,
            media
        );

        return res.status(201).json({
            success: true,
            message: "Post created successfully",
            data: {
                ...post,
                id: post.id.toString(),
                user_id: post.user_id.toString(),

                attachments: post.attachments.map(
                    (attachment) => ({
                        ...attachment,
                        id: attachment.id.toString(),
                        owner_id:
                            attachment.owner_id.toString(),
                        file_url:
                            storageService.getPublicMediaUrl(
                                attachment.file_url
                            ),
                        file_size:
                            attachment.file_size?.toString() ??
                            null,
                    })
                ),
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
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const query = parsePostListQuery(
            req.query.cursor,
            req.query.limit
        );

        if (!query.ok) {
            return res.status(400).json({
                success: false,
                message: query.message,
            });
        }

        const result = await postService.getHomePosts({
            viewerId: userId,
            cursor: query.cursor,
            limit: query.limit,
        });

        return res.status(200).json({
            success: true,
            data: result.posts.map(serializePost),
            pagination: {
                nextCursor:
                    result.nextCursor?.toString() ?? null,
                hasNextPage: result.hasNextPage,
            },
        });
    } catch (error) {
        console.error("GET POSTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getUserPosts = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const viewerId = req.userId;
        const { userId } = req.params;

        if (!viewerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (
            !userId ||
            Array.isArray(userId) ||
            !/^[1-9]\d*$/.test(userId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        const query = parsePostListQuery(
            req.query.cursor,
            req.query.limit
        );

        if (!query.ok) {
            return res.status(400).json({
                success: false,
                message: query.message,
            });
        }

        const result = await postService.getUserPosts({
            viewerId,
            ownerId: BigInt(userId),
            cursor: query.cursor,
            limit: query.limit,
        });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: result.posts.map(serializePost),
            pagination: {
                nextCursor:
                    result.nextCursor?.toString() ?? null,
                hasNextPage: result.hasNextPage,
            },
        });
    } catch (error) {
        console.error("GET USER POSTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const setPostReaction = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { reactionType } = req.body;

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

        const allowedReactionTypes = [
            "like",
            "love",
            "haha",
            "wow",
            "sad",
            "angry",
        ] as const;

        if (!allowedReactionTypes.includes(reactionType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reaction type",
            });
        }

        const result = await postService.setPostReaction(
            BigInt(id),
            userId,
            reactionType
        );

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Post not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("SET POST REACTION ERROR:", error);

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

export const updatePost = async (
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

        const input = parsePostUpdateInput(
            req.body.content,
            req.body.privacy
        );

        if (!input.ok) {
            return res.status(400).json({
                success: false,
                message: input.message,
            });
        }

        const result = await postService.updatePost(
            BigInt(id),
            userId,
            input.content,
            input.privacy
        );

        if (result.status === "not_found") {
            return res.status(404).json({
                success: false,
                message: "Post not found or you cannot edit it",
            });
        }

        if (result.status === "content_required") {
            return res.status(400).json({
                success: false,
                message: "Post content is required",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Post updated successfully",
            data: {
                ...result.post,
                id: result.post.id.toString(),
            },
        });
    } catch (error) {
        console.error("UPDATE POST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
