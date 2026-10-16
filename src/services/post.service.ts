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