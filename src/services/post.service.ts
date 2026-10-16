import prisma from "../configs/prisma";

export const createPost = async (
    userId: bigint,
    content: string
) => {
    const post = await prisma.posts.create({
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

    return post;
};

export const getPosts = async () => {
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
        },
    });

    return posts;
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
