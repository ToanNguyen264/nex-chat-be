import prisma from "../configs/prisma";
import type { reactions_reaction_type } from "@prisma/client";
import type { UploadedMedia } from "./storage.service";

export const createPost = async (
    userId: bigint,
    content: string,
    media: UploadedMedia[] = []
) => {
    return prisma.$transaction(async (transaction) => {
        const post = await transaction.posts.create({
            data: {
                user_id: userId,
                content,
            },
            include: {
                users: {
                    select: {
                        first_name: true,
                        last_name: true,
                        user_name: true,
                        avatar: true,
                    },
                },
            },
        });

        const attachments = await Promise.all(
            media.map((file) =>
                transaction.attachments.create({
                data: {
                    owner_type: "post",
                    owner_id: post.id,
                    file_url: file.objectKey,
                    file_type: file.fileType,
                    file_name: file.fileName,
                    file_size: BigInt(file.fileSize),
                },
                })
            )
        );

        return {
            ...post,
            attachments,
        };
    });
};

export const getPosts = async (userId: bigint) => {
    const posts = await prisma.posts.findMany({
        where: {
            deleted_at: null,
        },
        orderBy: {
            created_at: "desc",
        },
        include: {
            users: {
                select: {
                    first_name: true,
                    last_name: true,
                    user_name: true,
                    avatar: true,
                },
            },
            _count: {
                select: {
                    comments: {
                        where: {
                            deleted_at: null,
                        },
                    },
                },
            },
        },
    });

    const postIds = posts.map((post) => post.id);

    const attachments = postIds.length > 0
        ? await prisma.attachments.findMany({
            where: {
                owner_type: "post",
                owner_id: {
                    in: postIds,
                },
            },
        })
        : [];

    const reactions = postIds.length > 0
        ? await prisma.reactions.findMany({
            where: {
                target_type: "post",
                target_id: {
                    in: postIds,
                },
            },
            select: {
                user_id: true,
                target_id: true,
                reaction_type: true,
            },
        })
        : [];

    return posts.map((post) => {
        const { _count, ...postData } = post;

        return {
            ...postData,
            attachments: attachments.filter(
                (attachment) => attachment.owner_id === post.id
            ),
            reactionCount: reactions.filter(
                (reaction) => reaction.target_id === post.id
            ).length,
            currentReaction: reactions.find(
                (reaction) =>
                    reaction.target_id === post.id &&
                    reaction.user_id === userId
            )?.reaction_type ?? null,
            commentCount: _count.comments,
        };
    });
};

export const setPostReaction = async (
    postId: bigint,
    userId: bigint,
    reactionType: reactions_reaction_type
) => {
    return prisma.$transaction(async (transaction) => {
        const post = await transaction.posts.findFirst({
            where: {
                id: postId,
                deleted_at: null,
            },
            select: {
                id: true,
            },
        });

        if (!post) {
            return null;
        }

        const existingReaction = await transaction.reactions.findFirst({
            where: {
                user_id: userId,
                target_type: "post",
                target_id: postId,
            },
        });

        let currentReaction: reactions_reaction_type | null;

        if (existingReaction?.reaction_type === reactionType) {
            await transaction.reactions.delete({
                where: {
                    id: existingReaction.id,
                },
            });
            currentReaction = null;
        } else if (existingReaction) {
            await transaction.reactions.update({
                where: {
                    id: existingReaction.id,
                },
                data: {
                    reaction_type: reactionType,
                },
            });
            currentReaction = reactionType;
        } else {
            await transaction.reactions.create({
                data: {
                    user_id: userId,
                    target_type: "post",
                    target_id: postId,
                    reaction_type: reactionType,
                },
            });
            currentReaction = reactionType;
        }

        const reactionCount = await transaction.reactions.count({
            where: {
                target_type: "post",
                target_id: postId,
            },
        });

        return {
            currentReaction,
            reactionCount,
        };
    });
};

export const deletePost = async (
    postId: bigint,
    userId: bigint
) => {
    return prisma.posts.updateMany({
        where: {
            id: postId,
            user_id: userId,
            deleted_at: null,
        },
        data: {
            deleted_at: new Date(),
        },
    });
};
