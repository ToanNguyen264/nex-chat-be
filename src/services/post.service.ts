import prisma from "../configs/prisma";
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

    return posts.map((post) => ({
        ...post,
        attachments: attachments.filter(
            (attachment) => attachment.owner_id === post.id
        ),
    }));
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
