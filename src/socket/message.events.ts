import { getIO } from "./socket";
import { getPublicMediaUrl } from "../services/storage.service";

type MessageUser = {
    id: bigint;
    user_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
};

type MessageForSocket = {
    id: bigint;
    conversation_id: bigint;
    sender_id: bigint | null;
    content: string | null;
    message_type: "text" | "image" | "file" | "system";
    reply_to_message_id: bigint | null;
    created_at: Date;
    updated_at: Date;
    users: MessageUser | null;
    messages: {
        id: bigint;
        sender_id: bigint | null;
        content: string | null;
        message_type: "text" | "image" | "file" | "system";
        deleted_at: Date | null;
        users: MessageUser | null;
    } | null;
    attachments: Array<{
        id: bigint;
        owner_type: "message" | "post" | "comment";
        owner_id: bigint;
        file_url: string;
        file_type: string | null;
        file_name: string | null;
        file_size: bigint | null;
        created_at: Date;
    }>;
    reactionSummary: Array<{
        type: "like" | "love" | "haha" | "wow" | "sad" | "angry";
        count: number;
    }>;
    reactionCount: number;
    currentReaction: "like" | "love" | "haha" | "wow" | "sad" | "angry" | null;
};

type EmitNewMessageInput = {
    message: MessageForSocket;
    recipientUserIds: bigint[];
};

export const serializeMessage = (
    message: MessageForSocket
) => {
    const { messages: repliedMessage, ...messageData } = message;

    return {
        ...messageData,
        id: message.id.toString(),
        conversation_id:
            message.conversation_id.toString(),
        sender_id: message.sender_id?.toString() ?? null,
        reply_to_message_id:
            message.reply_to_message_id?.toString() ?? null,
        users: message.users
            ? {
                  ...message.users,
                  id: message.users.id.toString(),
              }
            : null,
        reply_to: repliedMessage
            ? {
                  ...repliedMessage,
                  id: repliedMessage.id.toString(),
                  sender_id:
                      repliedMessage.sender_id?.toString() ??
                      null,
                  users: repliedMessage.users
                      ? {
                            ...repliedMessage.users,
                            id: repliedMessage.users.id.toString(),
                        }
                      : null,
              }
            : null,
        attachments: message.attachments.map((attachment) => ({
            ...attachment,
            id: attachment.id.toString(),
            owner_id: attachment.owner_id.toString(),
            file_url: getPublicMediaUrl(attachment.file_url),
            file_size: attachment.file_size?.toString() ?? null,
        })),
    };
};

export const emitNewMessage = (
    input: EmitNewMessageInput
) => {
    try {
        const io = getIO();
        const userRooms = Array.from(
            new Set(
                input.recipientUserIds.map(
                    (userId) => `user:${userId.toString()}`
                )
            )
        );

        if (userRooms.length === 0) {
            return;
        }

        io.to(userRooms).emit(
            "message:new",
            serializeMessage(input.message)
        );
    } catch (error) {
        // Socket lỗi không được làm request REST đã lưu DB thất bại.
        console.error("EMIT NEW MESSAGE ERROR:", error);
    }
};

type EmitMessageReactionInput = {
    conversationId: bigint;
    messageId: bigint;
    actorUserId: bigint;
    currentReaction: "like" | "love" | "haha" | "wow" | "sad" | "angry" | null;
    reactionSummary: Array<{
        type: "like" | "love" | "haha" | "wow" | "sad" | "angry";
        count: number;
    }>;
    reactionCount: number;
    recipientUserIds: bigint[];
};

export const emitMessageReactionUpdated = (
    input: EmitMessageReactionInput
) => {
    try {
        const io = getIO();
        const userRooms = Array.from(
            new Set(
                input.recipientUserIds.map(
                    (userId) => `user:${userId.toString()}`
                )
            )
        );

        io.to(userRooms).emit("message:reaction-updated", {
            conversationId: input.conversationId.toString(),
            messageId: input.messageId.toString(),
            actorUserId: input.actorUserId.toString(),
            currentReaction: input.currentReaction,
            reactionSummary: input.reactionSummary,
            reactionCount: input.reactionCount,
        });
    } catch (error) {
        console.error(
            "EMIT MESSAGE REACTION ERROR:",
            error
        );
    }
};
