import prisma from "../configs/prisma";

const commentAuthorSelect = {
    first_name: true,
    last_name: true,
    user_name: true,
    avatar: true,
} as const;

export const getCommentsByPostId = async (postId: bigint) => {
    const post = await prisma.posts.findFirst({
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

    return prisma.comments.findMany({
        where: {
            post_id: postId,
            deleted_at: null,
        },
        orderBy: {
            created_at: "asc",
        },
        include: {
            users: {
                select: commentAuthorSelect,
            },
        },
    });
};

export const createComment = async (
    postId: bigint,
    userId: bigint,
    content: string
) => {
    const post = await prisma.posts.findFirst({
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

    return prisma.comments.create({
        data: {
            post_id: postId,
            user_id: userId,
            content,
        },
        include: {
            users: {
                select: commentAuthorSelect,
            },
        },
    });
};
