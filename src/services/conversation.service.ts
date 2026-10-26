import { Prisma } from "@prisma/client";
import prisma from "../configs/prisma";

const directConversationInclude = {
    conversation_members: {
        where: {
            left_at: null,
        },
        include: {
            users: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                    last_seen_at: true,
                },
            },
        },
    },
} satisfies Prisma.conversationsInclude;

const conversationListInclude = {
    conversation_members: {
        where: {
            left_at: null,
        },
        include: {
            users: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                    last_seen_at: true,
                },
            },
        },
    },
    messages: {
        where: {
            deleted_at: null,
        },
        orderBy: {
            id: "desc" as const,
        },
        take: 1,
        include: {
            users: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                },
            },
            messages: {
                select: {
                    id: true,
                    sender_id: true,
                    content: true,
                    message_type: true,
                    deleted_at: true,
                    users: {
                        select: {
                            id: true,
                            user_name: true,
                            first_name: true,
                            last_name: true,
                            avatar: true,
                        },
                    },
                },
            },
        },
    },
} satisfies Prisma.conversationsInclude;

/**
 * Tạo khóa duy nhất cho cuộc trò chuyện trực tiếp giữa hai người dùng.
 *
 * ID nhỏ hơn luôn đứng trước để (A, B) và (B, A) tạo cùng một khóa.
 */
export const createDirectKey = (
    firstUserId: bigint,
    secondUserId: bigint
) => {
    const smallerUserId =
        firstUserId < secondUserId
            ? firstUserId
            : secondUserId;
    const largerUserId =
        firstUserId < secondUserId
            ? secondUserId
            : firstUserId;

    return `${smallerUserId}:${largerUserId}`;
};

export const getOrCreateDirectConversation = async (
    currentUserId: bigint,
    otherUserId: bigint
) => {
    if (currentUserId === otherUserId) {
        return {
            success: false,
            reason: "CANNOT_CHAT_WITH_YOURSELF",
        } as const;
    }

    const otherUser = await prisma.users.findFirst({
        where: {
            id: otherUserId,
            deleted: "NO",
            status: "active",
        },
        select: {
            id: true,
        },
    });

    if (!otherUser) {
        return {
            success: false,
            reason: "USER_NOT_FOUND",
        } as const;
    }

    const directKey = createDirectKey(
        currentUserId,
        otherUserId
    );

    const friendship = await prisma.friendships.findUnique({
        where: {
            pair_key: directKey,
        },
        select: {
            status: true,
            deleted_at: true,
        },
    });

    if (
        friendship?.status === "blocked" &&
        friendship.deleted_at === null
    ) {
        return {
            success: false,
            reason: "USER_BLOCKED",
        } as const;
    }

    if (
        friendship?.status !== "accepted" ||
        friendship.deleted_at !== null
    ) {
        return {
            success: false,
            reason: "NOT_FRIENDS",
        } as const;
    }

    const existingConversation =
        await prisma.conversations.findUnique({
            where: {
                direct_key: directKey,
            },
            include: directConversationInclude,
        });

    if (existingConversation) {
        return {
            success: true,
            created: false,
            conversation: existingConversation,
        } as const;
    }

    try {
        const conversation =
            await prisma.conversations.create({
                data: {
                    type: "direct",
                    direct_key: directKey,
                    created_by: currentUserId,
                    conversation_members: {
                        create: [
                            {
                                user_id: currentUserId,
                            },
                            {
                                user_id: otherUserId,
                            },
                        ],
                    },
                },
                include: directConversationInclude,
            });

        return {
            success: true,
            created: true,
            conversation,
        } as const;
    } catch (error) {
        if (
            error instanceof
                Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const conversation =
                await prisma.conversations.findUnique({
                    where: {
                        direct_key: directKey,
                    },
                    include: directConversationInclude,
                });

            if (conversation) {
                return {
                    success: true,
                    created: false,
                    conversation,
                } as const;
            }
        }

        throw error;
    }
};

export const getConversations = async (
    userId: bigint,
    cursorId?: bigint,
    requestedLimit = 20
) => {
    const limit = Math.min(
        Math.max(requestedLimit, 1),
        50
    );

    const conversations =
        await prisma.conversations.findMany({
            where: {
                conversation_members: {
                    some: {
                        user_id: userId,
                        left_at: null,
                    },
                },
            },
            include: conversationListInclude,
            orderBy: [
                {
                    updated_at: "desc",
                },
                {
                    id: "desc",
                },
            ],
            ...(cursorId
                ? {
                      cursor: {
                          id: cursorId,
                      },
                      skip: 1,
                  }
                : {}),
            take: limit + 1,
        });

    const hasNextPage = conversations.length > limit;
    const pageItems = hasNextPage
        ? conversations.slice(0, limit)
        : conversations;

    const latestMessageIds = pageItems.flatMap((conversation) =>
        conversation.messages.map((message) => message.id)
    );
    const attachments = latestMessageIds.length
        ? await prisma.attachments.findMany({
              where: {
                  owner_type: "message",
                  owner_id: {
                      in: latestMessageIds,
                  },
              },
          })
        : [];
    const items = pageItems.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({
            ...message,
            attachments: attachments.filter(
                (attachment) =>
                    attachment.owner_id === message.id
            ),
            reactionSummary: [],
            reactionCount: 0,
            currentReaction: null,
        })),
    }));

    return {
        conversations: items,
        hasNextPage,
        nextCursor: hasNextPage
            ? pageItems.at(-1)?.id ?? null
            : null,
    };
};
