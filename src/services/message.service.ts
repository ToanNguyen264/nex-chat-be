import prisma from "../configs/prisma";
import type { reactions_reaction_type } from "@prisma/client";
import type { UploadedMedia } from "./storage.service";

type CreateTextMessageInput = {
    userId: bigint;
    conversationId: bigint;
    content: string;
    replyToMessageId: bigint | null;
};

type CreateMediaMessageInput = {
    userId: bigint;
    conversationId: bigint;
    content: string | null;
    replyToMessageId: bigint | null;
    messageType: "image" | "file";
    media: UploadedMedia;
};

const resolveReplyMessageId = async (
    conversationId: bigint,
    replyToMessageId: bigint | null
) => {
    if (replyToMessageId === null) {
        return {
            success: true,
            replyToMessageId: null,
        } as const;
    }

    const repliedMessage = await prisma.messages.findFirst({
        where: {
            id: replyToMessageId,
            conversation_id: conversationId,
            deleted_at: null,
        },
        select: {
            id: true,
            reply_to_message_id: true,
        },
    });

    if (!repliedMessage) {
        return {
            success: false,
            reason: "REPLY_MESSAGE_NOT_FOUND",
        } as const;
    }

    return {
        success: true,
        // Reply một cấp: nếu chọn một reply thì vẫn trỏ về tin gốc.
        replyToMessageId:
            repliedMessage.reply_to_message_id ??
            repliedMessage.id,
    } as const;
};

const repliedMessageSelect = {
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
} as const;

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

    const replyResult = await resolveReplyMessageId(
        input.conversationId,
        input.replyToMessageId
    );

    if (!replyResult.success) {
        return replyResult;
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
                            replyResult.replyToMessageId,
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
                        messages: {
                            select: repliedMessageSelect,
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

            return {
                ...createdMessage,
                attachments: [],
                reactionSummary: [],
                reactionCount: 0,
                currentReaction: null,
            };
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

export const createMediaMessage = async (
    input: CreateMediaMessageInput
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

    const replyResult = await resolveReplyMessageId(
        input.conversationId,
        input.replyToMessageId
    );

    if (!replyResult.success) {
        return replyResult;
    }

    const message = await prisma.$transaction(
        async (transaction) => {
            const createdMessage =
                await transaction.messages.create({
                    data: {
                        conversation_id: input.conversationId,
                        sender_id: input.userId,
                        content: input.content,
                        message_type: input.messageType,
                        reply_to_message_id:
                            replyResult.replyToMessageId,
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
                        messages: {
                            select: repliedMessageSelect,
                        },
                    },
                });

            const attachment =
                await transaction.attachments.create({
                    data: {
                        owner_type: "message",
                        owner_id: createdMessage.id,
                        file_url: input.media.objectKey,
                        file_type: input.media.fileType,
                        file_name: input.media.fileName,
                        file_size: BigInt(input.media.fileSize),
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

            return {
                ...createdMessage,
                attachments: [attachment],
                reactionSummary: [],
                reactionCount: 0,
                currentReaction: null,
            };
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
            messages: {
                select: repliedMessageSelect,
            },
        },
        orderBy: {
            id: "desc",
        },
        take: limit + 1,
    });

    const hasNextPage = messages.length > limit;
    const pageItems = hasNextPage
        ? messages.slice(0, limit)
        : messages;

    const messageIds = pageItems.map((message) => message.id);
    const attachments = messageIds.length
        ? await prisma.attachments.findMany({
              where: {
                  owner_type: "message",
                  owner_id: {
                      in: messageIds,
                  },
              },
              orderBy: {
                  id: "asc",
              },
          })
        : [];

    const reactions = messageIds.length
        ? await prisma.reactions.findMany({
              where: {
                  target_type: "message",
                  target_id: {
                      in: messageIds,
                  },
              },
              select: {
                  user_id: true,
                  target_id: true,
                  reaction_type: true,
              },
          })
        : [];

    const items = pageItems.map((message) => {
        const messageReactions = reactions.filter(
            (reaction) => reaction.target_id === message.id
        );
        const counts = new Map<
            reactions_reaction_type,
            number
        >();

        for (const reaction of messageReactions) {
            counts.set(
                reaction.reaction_type,
                (counts.get(reaction.reaction_type) ?? 0) + 1
            );
        }

        return {
            ...message,
            attachments: attachments.filter(
                (attachment) =>
                    attachment.owner_id === message.id
            ),
            reactionSummary: Array.from(
                counts,
                ([type, count]) => ({ type, count })
            ),
            reactionCount: messageReactions.length,
            currentReaction:
                messageReactions.find(
                    (reaction) =>
                        reaction.user_id === userId
                )?.reaction_type ?? null,
        };
    });

    return {
        success: true,
        messages: items,
        hasNextPage,
        nextCursor: hasNextPage
            ? pageItems.at(-1)?.id ?? null
            : null,
    } as const;
};

export const setMessageReaction = async (
    userId: bigint,
    conversationId: bigint,
    messageId: bigint,
    reactionType: reactions_reaction_type
) => {
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

    const message = await prisma.messages.findFirst({
        where: {
            id: messageId,
            conversation_id: conversationId,
            deleted_at: null,
        },
        select: {
            id: true,
        },
    });

    if (!message) {
        return {
            success: false,
            reason: "MESSAGE_NOT_FOUND",
        } as const;
    }

    const reactionResult = await prisma.$transaction(
        async (transaction) => {
            const existingReaction =
                await transaction.reactions.findFirst({
                    where: {
                        user_id: userId,
                        target_type: "message",
                        target_id: messageId,
                    },
                });

            let currentReaction: reactions_reaction_type | null;

            if (
                existingReaction?.reaction_type === reactionType
            ) {
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
                        target_type: "message",
                        target_id: messageId,
                        reaction_type: reactionType,
                    },
                });
                currentReaction = reactionType;
            }

            const allReactions =
                await transaction.reactions.findMany({
                    where: {
                        target_type: "message",
                        target_id: messageId,
                    },
                    select: {
                        reaction_type: true,
                    },
                });
            const counts = new Map<
                reactions_reaction_type,
                number
            >();

            for (const reaction of allReactions) {
                counts.set(
                    reaction.reaction_type,
                    (counts.get(reaction.reaction_type) ?? 0) +
                        1
                );
            }

            return {
                currentReaction,
                reactionSummary: Array.from(
                    counts,
                    ([type, count]) => ({ type, count })
                ),
                reactionCount: allReactions.length,
            };
        }
    );

    return {
        success: true,
        messageId,
        ...reactionResult,
        recipientUserIds:
            conversation.conversation_members.map(
                (member) => member.user_id
            ),
    } as const;
};
