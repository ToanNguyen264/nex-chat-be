import prisma from "../configs/prisma";
import type {
    Prisma,
    reactions_reaction_type,
} from "@prisma/client";
import type { UploadedMedia } from "./storage.service";
import {
    extractAcceptedFriendIds,
    getProfileVisibility,
} from "./post/post-visibility";
import type { PostPrivacy } from "./post/post-visibility";
import { canViewPost } from "./post/post-access.service";
import { buildPostReactionStates } from "./post/post-reaction-summary";

export const createPost = async (
    userId: bigint,
    content: string,
    privacy: PostPrivacy,
    media: UploadedMedia[] = []
) => {
    return prisma.$transaction(async (transaction) => {
        const post = await transaction.posts.create({
            data: {
                user_id: userId,
                content,
                privacy,
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

type GetPostsInput = {
    viewerId: bigint;
    cursor: bigint | null;
    limit: number;
};

type GetUserPostsInput = GetPostsInput & {
    ownerId: bigint;
};

const getPaginatedPosts = async (
    where: Prisma.postsWhereInput,
    viewerId: bigint,
    cursor: bigint | null,
    limit: number
) => {
    const posts = await prisma.posts.findMany({
        where,
        orderBy: {
            id: "desc",
        },
        take: limit + 1,
        ...(cursor !== null
            ? {
                  cursor: {
                      id: cursor,
                  },
                  skip: 1,
              }
            : {}),
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

    const hasNextPage = posts.length > limit;
    const pagePosts = hasNextPage
        ? posts.slice(0, limit)
        : posts;
    const postIds = pagePosts.map((post) => post.id);

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

    const groupedReactions = postIds.length > 0
        ? await prisma.reactions.groupBy({
            by: ["target_id", "reaction_type"],
            where: {
                target_type: "post",
                target_id: {
                    in: postIds,
                },
            },
            _count: {
                _all: true,
            },
        })
        : [];

    const viewerReactions = postIds.length > 0
        ? await prisma.reactions.findMany({
            where: {
                user_id: viewerId,
                target_type: "post",
                target_id: {
                    in: postIds,
                },
            },
            select: {
                target_id: true,
                reaction_type: true,
            },
        })
        : [];

    const reactionStates = buildPostReactionStates(
        postIds,
        groupedReactions,
        viewerReactions
    );

    const hydratedPosts = pagePosts.map((post) => {
        const { _count, ...postData } = post;
        const reactionState = reactionStates.get(
            post.id.toString()
        );

        return {
            ...postData,
            attachments: attachments.filter(
                (attachment) => attachment.owner_id === post.id
            ),
            reactionCount:
                reactionState?.reactionCount ?? 0,
            reactionSummary:
                reactionState?.reactionSummary ?? [],
            currentReaction:
                reactionState?.currentReaction ?? null,
            commentCount: _count.comments,
        };
    });

    return {
        posts: hydratedPosts,
        nextCursor: hasNextPage
            ? pagePosts[pagePosts.length - 1]?.id ?? null
            : null,
        hasNextPage,
    };
};

export const getHomePosts = async ({
    viewerId,
    cursor,
    limit,
}: GetPostsInput) => {
    const relationships = await prisma.friendships.findMany({
        where: {
            status: "accepted",
            deleted_at: null,
            OR: [
                {
                    requester_id: viewerId,
                },
                {
                    addressee_id: viewerId,
                },
            ],
        },
        select: {
            requester_id: true,
            addressee_id: true,
            status: true,
            deleted_at: true,
        },
    });

    const friendIds = extractAcceptedFriendIds(
        viewerId,
        relationships
    );
    const visibilityRules: Prisma.postsWhereInput[] = [
        {
            user_id: viewerId,
        },
    ];

    if (friendIds.length > 0) {
        visibilityRules.push({
            user_id: {
                in: friendIds,
            },
            privacy: {
                in: ["public", "friends"],
            },
        });
    }

    return getPaginatedPosts(
        {
            deleted_at: null,
            users: {
                status: "active",
                deleted: "NO",
                deleted_at: null,
            },
            OR: visibilityRules,
        },
        viewerId,
        cursor,
        limit
    );
};

export const getUserPosts = async ({
    viewerId,
    ownerId,
    cursor,
    limit,
}: GetUserPostsInput) => {
    const owner = await prisma.users.findFirst({
        where: {
            id: ownerId,
            status: "active",
            deleted: "NO",
            deleted_at: null,
        },
        select: {
            id: true,
        },
    });

    if (!owner) {
        return null;
    }

    const relationship =
        viewerId === ownerId
            ? null
            : await prisma.friendships.findFirst({
                  where: {
                      deleted_at: null,
                      OR: [
                          {
                              requester_id: viewerId,
                              addressee_id: ownerId,
                          },
                          {
                              requester_id: ownerId,
                              addressee_id: viewerId,
                          },
                      ],
                  },
                  select: {
                      status: true,
                  },
              });

    const allowedPrivacy = getProfileVisibility(
        viewerId,
        ownerId,
        relationship?.status ?? null
    );

    if (allowedPrivacy === null) {
        return {
            posts: [],
            nextCursor: null,
            hasNextPage: false,
        };
    }

    return getPaginatedPosts(
        {
            user_id: ownerId,
            deleted_at: null,
            privacy: {
                in: allowedPrivacy,
            },
        },
        viewerId,
        cursor,
        limit
    );
};

export const setPostReaction = async (
    postId: bigint,
    userId: bigint,
    reactionType: reactions_reaction_type | null
) => {
    if (!(await canViewPost(userId, postId))) {
        return null;
    }

    const post = await prisma.posts.findFirst({
        where: {
            id: postId,
            deleted_at: null,
        },
        select: {
            id: true,
            user_id: true,
            privacy: true,
        },
    });

    if (!post) {
        return null;
    }

    const reactionState = await prisma.$transaction(
        async (transaction) => {
            const existingReaction =
                await transaction.reactions.findFirst({
                    where: {
                        user_id: userId,
                        target_type: "post",
                        target_id: postId,
                    },
                });

            let currentReaction: reactions_reaction_type | null;

            if (reactionType === null) {
                if (existingReaction) {
                    await transaction.reactions.delete({
                        where: {
                            id: existingReaction.id,
                        },
                    });
                }
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

            const groupedReactions =
                await transaction.reactions.groupBy({
                    by: ["target_id", "reaction_type"],
                    where: {
                        target_type: "post",
                        target_id: postId,
                    },
                    _count: {
                        _all: true,
                    },
                });

            const viewerReactions = currentReaction
                ? [
                      {
                          target_id: postId,
                          reaction_type: currentReaction,
                      },
                  ]
                : [];

            const states = buildPostReactionStates(
                [postId],
                groupedReactions,
                viewerReactions
            );

            return (
                states.get(postId.toString()) ?? {
                    currentReaction,
                    reactionCount: 0,
                    reactionSummary: [],
                }
            );
        }
    );

    return {
        ...reactionState,
        postId: post.id,
        ownerId: post.user_id,
        privacy: post.privacy,
    };
};

export const deletePost = async (
    postId: bigint,
    userId: bigint
) => {
    return prisma.$transaction(async (transaction) => {
        const post = await transaction.posts.findFirst({
            where: {
                id: postId,
                user_id: userId,
                deleted_at: null,
            },
            select: {
                id: true,
                privacy: true,
            },
        });

        if (!post) {
            return null;
        }

        await transaction.posts.update({
            where: {
                id: postId,
            },
            data: {
                deleted_at: new Date(),
            },
        });

        return post;
    });
};

export const updatePost = async (
    postId: bigint,
    userId: bigint,
    content: string,
    privacy: PostPrivacy
) => {
    return prisma.$transaction(async (transaction) => {
        const post = await transaction.posts.findFirst({
            where: {
                id: postId,
                user_id: userId,
                deleted_at: null,
            },
            select: {
                id: true,
            },
        });

        if (!post) {
            return {
                status: "not_found" as const,
            };
        }

        if (!content) {
            const attachmentCount =
                await transaction.attachments.count({
                    where: {
                        owner_type: "post",
                        owner_id: postId,
                    },
                });

            if (attachmentCount === 0) {
                return {
                    status: "content_required" as const,
                };
            }
        }

        const updatedPost = await transaction.posts.update({
            where: {
                id: postId,
            },
            data: {
                content,
                privacy,
            },
            select: {
                id: true,
                content: true,
                privacy: true,
                updated_at: true,
            },
        });

        return {
            status: "updated" as const,
            post: updatedPost,
        };
    });
};
