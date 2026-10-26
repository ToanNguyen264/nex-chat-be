import type {
    calls_call_type,
    calls_status,
} from "@prisma/client";
import prisma from "../../configs/prisma";

type CallEndUpdate = {
    status: "cancelled" | "ended";
    ended_at: Date;
    active_key: null;
};

export const buildCallEndUpdate = (
    status: calls_status,
    endedAt: Date
): CallEndUpdate | null => {
    if (status !== "ringing" && status !== "ongoing") {
        return null;
    }

    return {
        status: status === "ringing"
            ? "cancelled"
            : "ended",
        ended_at: endedAt,
        active_key: null,
    };
};

const formatCallDuration = (
    answeredAt: Date | null,
    endedAt: Date | null
): string => {
    if (!answeredAt || !endedAt) {
        return "00:00";
    }

    const totalSeconds = Math.max(
        1,
        Math.round(
            (endedAt.getTime() - answeredAt.getTime()) / 1000
        )
    );
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const buildCallSystemMessageContent = (call: {
    call_type: calls_call_type;
    status: calls_status;
    answered_at: Date | null;
    ended_at: Date | null;
}): string => {
    const typeLabel =
        call.call_type === "video"
            ? "Cuộc gọi video"
            : "Cuộc gọi thoại";

    switch (call.status) {
        case "ended":
            return `${typeLabel} • ${formatCallDuration(
                call.answered_at,
                call.ended_at
            )}`;
        case "missed":
            return `${typeLabel} bị nhỡ`;
        case "rejected":
            return `${typeLabel} bị từ chối`;
        case "cancelled":
            return `${typeLabel} đã huỷ`;
        default:
            return typeLabel;
    }
};

export const createCallSystemMessage = async (call: {
    conversation_id: bigint;
    caller_id: bigint;
    callee_id: bigint;
    call_type: calls_call_type;
    status: calls_status;
    answered_at: Date | null;
    ended_at: Date | null;
}) => {
    const content = buildCallSystemMessageContent(call);

    const message = await prisma.$transaction(
        async (transaction) => {
            const createdMessage =
                await transaction.messages.create({
                    data: {
                        conversation_id:
                            call.conversation_id,
                        sender_id: call.caller_id,
                        content,
                        message_type: "system",
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
                });

            await transaction.conversations.update({
                where: {
                    id: call.conversation_id,
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
        message,
        recipientUserIds: [call.caller_id, call.callee_id],
    };
};
