import type { Response } from "express";

import type { AuthRequest } from "../middlewares/auth.middleware";
import * as conversationService from "../services/conversation.service";
import * as messageService from "../services/message.service";
import * as storageService from "../services/storage.service";
import {
    emitMessageReactionUpdated,
    emitNewMessage,
    serializeMessage,
} from "../socket/message.events";
import type { reactions_reaction_type } from "@prisma/client";

const MESSAGE_REACTIONS = new Set<reactions_reaction_type>([
    "like",
    "love",
    "haha",
    "wow",
    "sad",
    "angry",
]);

export const getConversations = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const cursorQuery = req.query.cursor;
        const limitQuery = req.query.limit;

        if (
            cursorQuery !== undefined &&
            (typeof cursorQuery !== "string" ||
                !/^[1-9]\d*$/.test(cursorQuery))
        ) {
            return res.status(400).json({
                success: false,
                message: "cursor must be a positive integer",
            });
        }

        if (
            limitQuery !== undefined &&
            (typeof limitQuery !== "string" ||
                !/^[1-9]\d*$/.test(limitQuery))
        ) {
            return res.status(400).json({
                success: false,
                message: "limit must be a positive integer",
            });
        }

        const result =
            await conversationService.getConversations(
                req.userId,
                typeof cursorQuery === "string"
                    ? BigInt(cursorQuery)
                    : undefined,
                typeof limitQuery === "string"
                    ? Number(limitQuery)
                    : 20
            );

        const conversations = result.conversations.map(
            (conversation) => ({
                ...conversation,
                id: conversation.id.toString(),
                created_by:
                    conversation.created_by?.toString() ??
                    null,
                conversation_members:
                    conversation.conversation_members.map(
                        (member) => ({
                            ...member,
                            id: member.id.toString(),
                            conversation_id:
                                member.conversation_id.toString(),
                            user_id: member.user_id.toString(),
                            users: {
                                ...member.users,
                                id: member.users.id.toString(),
                            },
                        })
                    ),
                messages: conversation.messages.map(
                    (message) =>
                        serializeMessage({
                            ...message,
                            attachments: message.attachments,
                        })
                ),
            })
        );

        return res.status(200).json({
            success: true,
            data: conversations,
            pagination: {
                nextCursor:
                    result.nextCursor?.toString() ?? null,
                hasNextPage: result.hasNextPage,
            },
        });
    } catch (error) {
        console.error("GET CONVERSATIONS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getConversationMessages = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { conversationId } = req.params;
        const cursorQuery = req.query.cursor;
        const limitQuery = req.query.limit;

        if (
            !conversationId ||
            Array.isArray(conversationId) ||
            !/^[1-9]\d*$/.test(conversationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID",
            });
        }

        if (
            cursorQuery !== undefined &&
            (typeof cursorQuery !== "string" ||
                !/^[1-9]\d*$/.test(cursorQuery))
        ) {
            return res.status(400).json({
                success: false,
                message: "cursor must be a positive integer",
            });
        }

        if (
            limitQuery !== undefined &&
            (typeof limitQuery !== "string" ||
                !/^[1-9]\d*$/.test(limitQuery))
        ) {
            return res.status(400).json({
                success: false,
                message: "limit must be a positive integer",
            });
        }

        const result =
            await messageService.getConversationMessages(
                req.userId,
                BigInt(conversationId),
                typeof cursorQuery === "string"
                    ? BigInt(cursorQuery)
                    : undefined,
                typeof limitQuery === "string"
                    ? Number(limitQuery)
                    : 30
            );

        if (!result.success) {
            return res.status(404).json({
                success: false,
                message:
                    "Conversation not found or you are not a member",
            });
        }

        const messages = result.messages.map(serializeMessage);

        return res.status(200).json({
            success: true,
            data: messages,
            pagination: {
                nextCursor:
                    result.nextCursor?.toString() ?? null,
                hasNextPage: result.hasNextPage,
            },
        });
    } catch (error) {
        console.error(
            "GET CONVERSATION MESSAGES ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const sendTextMessage = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { conversationId } = req.params;

        if (
            !conversationId ||
            Array.isArray(conversationId) ||
            !/^[1-9]\d*$/.test(conversationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID",
            });
        }

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                success: false,
                message: "Request body must be an object",
            });
        }

        const body = req.body as Record<string, unknown>;

        if (typeof body.content !== "string") {
            return res.status(400).json({
                success: false,
                message: "content must be a string",
            });
        }

        const content = body.content.trim();

        if (!content || content.length > 5000) {
            return res.status(400).json({
                success: false,
                message:
                    "content must contain 1 to 5000 characters",
            });
        }

        const replyToMessageId = body.replyToMessageId;

        if (
            replyToMessageId !== undefined &&
            replyToMessageId !== null &&
            (typeof replyToMessageId !== "string" ||
                !/^[1-9]\d*$/.test(replyToMessageId))
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "replyToMessageId must be a positive integer string or null",
            });
        }

        const result = await messageService.createTextMessage({
            userId: req.userId,
            conversationId: BigInt(conversationId),
            content,
            replyToMessageId:
                typeof replyToMessageId === "string"
                    ? BigInt(replyToMessageId)
                    : null,
        });

        if (!result.success) {
            switch (result.reason) {
                case "CONVERSATION_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message:
                            "Conversation not found or you are not a member",
                    });

                case "CHAT_NOT_ALLOWED":
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not allowed to send messages in this conversation",
                    });

                case "REPLY_MESSAGE_NOT_FOUND":
                    return res.status(400).json({
                        success: false,
                        message:
                            "Reply message does not exist in this conversation",
                    });
            }
        }

        const message = result.message;
        const serializedMessage = serializeMessage(message);

        emitNewMessage({
            message,
            recipientUserIds: result.recipientUserIds,
        });

        return res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: serializedMessage,
        });
    } catch (error) {
        console.error("SEND TEXT MESSAGE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const sendMediaMessage = async (
    req: AuthRequest,
    res: Response
) => {
    let uploadedObjectKey: string | null = null;
    let messagePersisted = false;

    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { conversationId } = req.params;

        if (
            !conversationId ||
            Array.isArray(conversationId) ||
            !/^[1-9]\d*$/.test(conversationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Image or audio file is required",
            });
        }

        const isImage = req.file.mimetype.startsWith("image/");
        const isAudio = req.file.mimetype.startsWith("audio/");

        if (!isImage && !isAudio) {
            return res.status(400).json({
                success: false,
                message: "Only image and audio files are allowed",
            });
        }

        if (isImage && req.file.size > 10 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                message: "Image must not exceed 10 MB",
            });
        }

        const content =
            typeof req.body.content === "string"
                ? req.body.content.trim()
                : "";

        if (content.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "content must not exceed 5000 characters",
            });
        }

        const replyToMessageId = req.body.replyToMessageId;

        if (
            replyToMessageId !== undefined &&
            replyToMessageId !== null &&
            replyToMessageId !== "" &&
            (typeof replyToMessageId !== "string" ||
                !/^[1-9]\d*$/.test(replyToMessageId))
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "replyToMessageId must be a positive integer string or null",
            });
        }

        const media =
            await storageService.uploadMessageMedia(req.file);
        uploadedObjectKey = media.objectKey;

        const result = await messageService.createMediaMessage({
            userId: req.userId,
            conversationId: BigInt(conversationId),
            content: content || null,
            replyToMessageId:
                typeof replyToMessageId === "string" &&
                replyToMessageId !== ""
                    ? BigInt(replyToMessageId)
                    : null,
            messageType: isImage ? "image" : "file",
            media,
        });

        if (!result.success) {
            await storageService.deleteMessageMedia(
                media.objectKey
            );
            uploadedObjectKey = null;

            switch (result.reason) {
                case "CONVERSATION_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message:
                            "Conversation not found or you are not a member",
                    });

                case "CHAT_NOT_ALLOWED":
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not allowed to send messages in this conversation",
                    });

                case "REPLY_MESSAGE_NOT_FOUND":
                    return res.status(400).json({
                        success: false,
                        message:
                            "Reply message does not exist in this conversation",
                    });
            }
        }

        messagePersisted = true;
        const serializedMessage = serializeMessage(
            result.message
        );

        emitNewMessage({
            message: result.message,
            recipientUserIds: result.recipientUserIds,
        });

        return res.status(201).json({
            success: true,
            message: "Media message sent successfully",
            data: serializedMessage,
        });
    } catch (error) {
        if (uploadedObjectKey && !messagePersisted) {
            try {
                await storageService.deleteMessageMedia(
                    uploadedObjectKey
                );
            } catch (cleanupError) {
                console.error(
                    "DELETE ORPHAN MESSAGE MEDIA ERROR:",
                    cleanupError
                );
            }
        }

        console.error("SEND MEDIA MESSAGE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const setMessageReaction = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { conversationId, messageId } = req.params;

        if (
            !conversationId ||
            Array.isArray(conversationId) ||
            !/^[1-9]\d*$/.test(conversationId) ||
            !messageId ||
            Array.isArray(messageId) ||
            !/^[1-9]\d*$/.test(messageId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation or message ID",
            });
        }

        const reactionType = req.body?.reactionType;

        if (
            typeof reactionType !== "string" ||
            !MESSAGE_REACTIONS.has(
                reactionType as reactions_reaction_type
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid reaction type",
            });
        }

        const result = await messageService.setMessageReaction(
            req.userId,
            BigInt(conversationId),
            BigInt(messageId),
            reactionType as reactions_reaction_type
        );

        if (!result.success) {
            const isChatForbidden =
                result.reason === "CHAT_NOT_ALLOWED";

            return res.status(isChatForbidden ? 403 : 404).json({
                success: false,
                message:
                    isChatForbidden
                        ? "You are not allowed to react in this conversation"
                        : result.reason === "MESSAGE_NOT_FOUND"
                        ? "Message not found"
                        : "Conversation not found or you are not a member",
            });
        }

        const data = {
            conversationId,
            messageId,
            currentReaction: result.currentReaction,
            reactionSummary: result.reactionSummary,
            reactionCount: result.reactionCount,
        };

        emitMessageReactionUpdated({
            conversationId: BigInt(conversationId),
            messageId: BigInt(messageId),
            actorUserId: req.userId,
            currentReaction: result.currentReaction,
            reactionSummary: result.reactionSummary,
            reactionCount: result.reactionCount,
            recipientUserIds: result.recipientUserIds,
        });

        return res.status(200).json({
            success: true,
            message: "Message reaction updated successfully",
            data,
        });
    } catch (error) {
        console.error("SET MESSAGE REACTION ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getOrCreateDirectConversation = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const currentUserId = req.userId;
        const { otherUserId } = req.params;

        if (!currentUserId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (
            !otherUserId ||
            Array.isArray(otherUserId) ||
            !/^[1-9]\d*$/.test(otherUserId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        const result =
            await conversationService.getOrCreateDirectConversation(
                currentUserId,
                BigInt(otherUserId)
            );

        if (!result.success) {
            switch (result.reason) {
                case "CANNOT_CHAT_WITH_YOURSELF":
                    return res.status(400).json({
                        success: false,
                        message:
                            "Bạn không thể tạo cuộc trò chuyện với chính mình",
                    });

                case "USER_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Không tìm thấy người dùng",
                    });

                case "USER_BLOCKED":
                    return res.status(403).json({
                        success: false,
                        message:
                            "Không thể mở cuộc trò chuyện do quan hệ đã bị chặn",
                    });

                case "NOT_FRIENDS":
                    return res.status(403).json({
                        success: false,
                        message:
                            "Chỉ có thể nhắn tin với bạn bè",
                    });
            }
        }

        const conversation = result.conversation;
        const data = {
            ...conversation,
            id: conversation.id.toString(),
            created_by:
                conversation.created_by?.toString() ?? null,
            conversation_members:
                conversation.conversation_members.map(
                    (member) => ({
                        ...member,
                        id: member.id.toString(),
                        conversation_id:
                            member.conversation_id.toString(),
                        user_id: member.user_id.toString(),
                        users: {
                            ...member.users,
                            id: member.users.id.toString(),
                        },
                    })
                ),
        };

        return res.status(result.created ? 201 : 200).json({
            success: true,
            created: result.created,
            message: result.created
                ? "Tạo cuộc trò chuyện thành công"
                : "Lấy cuộc trò chuyện thành công",
            data,
        });
    } catch (error) {
        console.error(
            "GET OR CREATE DIRECT CONVERSATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
