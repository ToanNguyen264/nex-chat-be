import prisma from "../configs/prisma";

type CreateTextMessageInput = {
    userId: bigint;
    conversationId: bigint;
    content: string;
    replyToMessageId: bigint | null;
};

export const createTextMessage = async (
    input: CreateTextMessageInput
) => {
    const conversation =
        await prisma.conversations.findFirst({
            where: {
                id: input.conversationId,
                conversation_members: {
                    some: {
                        user_id: input.userId,
                        left_at: null,
                    },
                },
            },
            select: {
                id: true,
                type: true,
                direct_key: true,
                conversation_members: {
                    where: {
                        left_at: null,
                    },
                    select: {
                        user_id: true,
                    },
                },
            },
        });

    if (!conversation) {
        return {
            success: false,
            reason: "CONVERSATION_NOT_FOUND",
        } as const;
    }

    // Một cuộc trò chuyện trực tiếp không được nhận thêm tin nhắn
    // nếu hai người đã hủy kết bạn hoặc chặn nhau.
    if (conversation.type === "direct") {
        const friendship = conversation.direct_key
            ? await prisma.friendships.findUnique({
                  where: {
                      pair_key: conversation.direct_key,
                  },
                  select: {
                      status: true,
                      deleted_at: true,
                  },
              })
            : null;

        if (
            friendship?.status !== "accepted" ||
            friendship.deleted_at !== null
        ) {
            return {
                success: false,
                reason: "CHAT_NOT_ALLOWED",
            } as const;
        }
    }

    if (input.replyToMessageId !== null) {
        const repliedMessage =
            await prisma.messages.findFirst({
                where: {
                    id: input.replyToMessageId,
                    conversation_id: input.conversationId,
                    deleted_at: null,
                },
                select: {
                    id: true,
                },
            });

        if (!repliedMessage) {
            return {
                success: false,
                reason: "REPLY_MESSAGE_NOT_FOUND",
            } as const;
        }
    }

    const message = await prisma.$transaction(
        async (transaction) => {
            const createdMessage =
                await transaction.messages.create({
                    data: {
                        conversation_id:
                            input.conversationId,
                        sender_id: input.userId,
                        content: input.content,
                        message_type: "text",
                        reply_to_message_id:
                            input.replyToMessageId,
                    },
                    select: {
                        id: true,
                        conversation_id: true,
                        sender_id: true,
                        content: true,
                        message_type: true,
                        reply_to_message_id: true,
                        created_at: true,
                        updated_at: true,
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
                });

            await transaction.conversations.update({
                where: {
                    id: input.conversationId,
                },
                data: {
                    updated_at: new Date(),
                },
            });

            return createdMessage;
        }
    );

    return {
        success: true,
        message,
        recipientUserIds:
            conversation.conversation_members.map(
                (member) => member.user_id
            ),
    } as const;
};

export const getConversationMessages = async (
    userId: bigint,
    conversationId: bigint,
    cursorId?: bigint,
    requestedLimit = 30
) => {
    const limit = Math.min(
        Math.max(requestedLimit, 1),
        50
    );

    // Chỉ thành viên chưa rời phòng mới được đọc tin nhắn.
    const conversation =
        await prisma.conversations.findFirst({
            where: {
                id: conversationId,
                conversation_members: {
                    some: {
                        user_id: userId,
                        left_at: null,
                    },
                },
            },
            select: {
                id: true,
            },
        });

    if (!conversation) {
        return {
            success: false,
            reason: "CONVERSATION_NOT_FOUND",
        } as const;
    }

    const messages = await prisma.messages.findMany({
        where: {
            conversation_id: conversationId,
            deleted_at: null,
            ...(cursorId
                ? {
                      id: {
                          lt: cursorId,
                      },
                  }
                : {}),
        },
        select: {
            id: true,
            conversation_id: true,
            sender_id: true,
            content: true,
            message_type: true,
            reply_to_message_id: true,
            created_at: true,
            updated_at: true,
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
        orderBy: {
            id: "desc",
        },
        take: limit + 1,
    });

    const hasNextPage = messages.length > limit;
    const items = hasNextPage
        ? messages.slice(0, limit)
        : messages;

    return {
        success: true,
        messages: items,
        hasNextPage,
        nextCursor: hasNextPage
            ? items.at(-1)?.id ?? null
            : null,
    } as const;
};
