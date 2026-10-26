import { AccessToken } from "livekit-server-sdk";
import prisma from "../../configs/prisma";
import { randomUUID } from "node:crypto";
import {
    Prisma,
    type calls_call_type,
} from "@prisma/client";
import {
    buildCallEndUpdate,
    createCallSystemMessage,
} from "./call.lifecycle";

import { scheduleCallTimeout } from "../../queues/call-timeout.queue";

type CreateOutgoingCallInput = {
    userId: bigint;
    conversationId: bigint;
    callType: calls_call_type;
};

type RespondToIncomingCallInput = {
    userId: bigint;
    callId: bigint;
    action: "accept" | "reject";
};

type EndCallInput = {
    userId: bigint;
    callId: bigint;
};


interface CreateCallTokenInput {
    userId: bigint;
    callId: bigint;
}

const getRequiredEnv = (name: string) => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
};

export const createCallToken = async ({
    userId,
    callId,
}: CreateCallTokenInput) => {
    const call = await prisma.calls.findUnique({
        where: {
            id: callId,
        },
        select: {
            caller_id: true,
            callee_id: true,
            room_name: true,
            status: true,
        },
    });

    if (!call) {
        return {
            success: false,
            reason: "CALL_NOT_FOUND",
        } as const;
    }

    const isCaller = call.caller_id === userId;
    const isCallee = call.callee_id === userId;

    if (!isCaller && !isCallee) {
        return {
            success: false,
            reason: "NOT_CALL_PARTICIPANT",
        } as const;
    }

    if (call.status !== "ringing" && call.status !== "ongoing") {
        return {
            success: false,
            reason: "CALL_NOT_ACTIVE",
        } as const;
    }

    if (isCallee && call.status !== "ongoing") {
        return {
            success: false,
            reason: "CALL_NOT_ACCEPTED",
        } as const;
    }

    const user = await prisma.users.findUnique({
        where: {
            id: userId,
        },
        select: {
            user_name: true,
            first_name: true,
            last_name: true,
            status: true,
            deleted_at: true,
        },
    });

    if (
        !user ||
        user.status !== "active" ||
        user.deleted_at !== null
    ) {
        return {
            success: false,
            reason: "USER_UNAVAILABLE",
        } as const;
    }

    const livekitUrl = getRequiredEnv("LIVEKIT_URL");
    const apiKey = getRequiredEnv("LIVEKIT_API_KEY");
    const apiSecret = getRequiredEnv(
        "LIVEKIT_API_SECRET"
    );

    const roomName = call.room_name;

    const displayName =
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
        user.user_name ||
        `User ${userId.toString()}`;

    const accessToken = new AccessToken(
        apiKey,
        apiSecret,
        {
            identity: userId.toString(),
            name: displayName,
        }
    );

    accessToken.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
    });

    const token = await accessToken.toJwt();

    return {
        success: true,
        token,
        roomName,
        serverUrl: livekitUrl,
    } as const;
};


/* hàm tạo cuộc gọi đi */
export const createOutgoingCall = async (
    input: CreateOutgoingCallInput
) => {
    const conversation =
        await prisma.conversations.findFirst({
            where: {
                id: input.conversationId,

                // Người gọi phải thuộc conversation
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

                        users: {
                            select: {
                                id: true,
                                user_name: true,
                                first_name: true,
                                last_name: true,
                                avatar: true,
                                status: true,
                                deleted_at: true,
                            },
                        },
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

    // Hiện tại chỉ hỗ trợ gọi 1-1
    if (conversation.type !== "direct") {
        return {
            success: false,
            reason: "GROUP_CALL_NOT_SUPPORTED",
        } as const;
    }
    /* thành viên có user_id bằng ID của người đang gửi request */
    const callerMember =
        conversation.conversation_members.find(
            (member) =>
                member.user_id === input.userId
        );

    /* thành viên còn lại, vì đây chỉ là cuộc gọi 1-1 nên trên đã lấy người tạo cuộc gọi rồi thì dưới chính là người còn lại */
    const calleeMember =
        conversation.conversation_members.find(
            (member) =>
                member.user_id !== input.userId
        );

    if (!callerMember || !calleeMember) {
        return {
            success: false,
            reason: "INVALID_DIRECT_CONVERSATION",
        } as const;
    }

    // Không gọi tới tài khoản đã bị khóa/xóa
    if (
        calleeMember.users.status !== "active" ||
        calleeMember.users.deleted_at !== null
    ) {
        return {
            success: false,
            reason: "CALLEE_UNAVAILABLE",
        } as const;
    }

    // Hai người vẫn phải là bạn bè và không chặn nhau
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
            reason: "CALL_NOT_ALLOWED",
        } as const;
    }

    const activeKey = `conversation:${conversation.id.toString()}`; /* chuỗi định danh cuộc gọi đang hoạt động dựa trên cuộc trò chuyện ví dụ conversation.id = 1=> conversation:15 */

    // UUID giúp tạo room name trước khi bản ghi có ID
    const roomName = `call:${randomUUID()}`;

    try {
        const call = await prisma.calls.create({
            data: {
                conversation_id: conversation.id,
                caller_id: input.userId,
                callee_id: calleeMember.user_id,
                room_name: roomName,
                call_type: input.callType,
                status: "ringing",
                active_key: activeKey,
            },
        });
        try {
            await scheduleCallTimeout(call.id);
        } catch (queueError) {
            // Redis/BullMQ không nhận được timeout job.
            // Hủy call vừa tạo để không bị mắc kẹt ở ringing.
            await prisma.calls.updateMany({
                where: {
                    id: call.id,
                    status: "ringing",
                },

                data: {
                    status: "cancelled",
                    ended_at: new Date(),
                    active_key: null,
                },
            });

            throw queueError;
        }
        return {
            success: true,
            call,
            caller: callerMember.users,
            callee: calleeMember.users,
        } as const;
    } catch (error) {
        if (
            error instanceof
            Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            // Kiểm tra có phải active_key bị trùng không
            const activeCall =
                await prisma.calls.findUnique({
                    where: {
                        active_key: activeKey,
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

            if (activeCall) {
                return {
                    success: false,
                    reason: "CALL_ALREADY_ACTIVE",
                    activeCall,
                } as const;
            }
        }

        throw error;
    }
};

export const respondToIncomingCall = async (
    input: RespondToIncomingCallInput
) => {
    const call = await prisma.calls.findUnique({
        where: {
            id: input.callId,
        },
    });

    if (!call) {
        return {
            success: false,
            reason: "CALL_NOT_FOUND",
        } as const;
    }

    if (call.callee_id !== input.userId) {
        return {
            success: false,
            reason: "NOT_CALL_RECIPIENT",
        } as const;
    }

    if (call.status !== "ringing") {
        return {
            success: false,
            reason: "CALL_NOT_RINGING",
        } as const;
    }

    const now = new Date();
    const updateResult = await prisma.calls.updateMany({
        where: {
            id: input.callId,
            callee_id: input.userId,
            status: "ringing",
        },
        data:
            input.action === "accept"
                ? {
                    status: "ongoing",
                    answered_at: now,
                }
                : {
                    status: "rejected",
                    ended_at: now,
                    active_key: null,
                },
    });

    if (updateResult.count === 0) {
        return {
            success: false,
            reason: "CALL_NOT_RINGING",
        } as const;
    }

    const updatedCall = await prisma.calls.findUnique({
        where: {
            id: input.callId,
        },
    });

    if (!updatedCall) {
        return {
            success: false,
            reason: "CALL_NOT_FOUND",
        } as const;
    }

    const systemMessage =
        input.action === "reject"
            ? await createCallSystemMessage(updatedCall)
            : null;

    return {
        success: true,
        call: updatedCall,
        action: input.action,
        systemMessage,
    } as const;
};

export const endCall = async (input: EndCallInput) => {
    const call = await prisma.calls.findUnique({
        where: {
            id: input.callId,
        },
    });

    if (!call) {
        return {
            success: false,
            reason: "CALL_NOT_FOUND",
        } as const;
    }

    if (
        call.caller_id !== input.userId &&
        call.callee_id !== input.userId
    ) {
        return {
            success: false,
            reason: "NOT_CALL_PARTICIPANT",
        } as const;
    }

    const endUpdate = buildCallEndUpdate(
        call.status,
        new Date()
    );

    if (!endUpdate) {
        return {
            success: false,
            reason: "CALL_NOT_ACTIVE",
        } as const;
    }

    const updateResult = await prisma.calls.updateMany({
        where: {
            id: call.id,
            status: call.status,
        },
        data: endUpdate,
    });

    if (updateResult.count === 0) {
        return {
            success: false,
            reason: "CALL_NOT_ACTIVE",
        } as const;
    }

    const updatedCall = await prisma.calls.findUnique({
        where: {
            id: call.id,
        },
    });

    if (!updatedCall) {
        return {
            success: false,
            reason: "CALL_NOT_FOUND",
        } as const;
    }

    const systemMessage =
        await createCallSystemMessage(updatedCall);

    return {
        success: true,
        call: updatedCall,
        systemMessage,
    } as const;
};

/* Lấy cuộc gọi đang đổ chuông (ringing) chờ người nhận bắt máy khi người nhận vừa online */
export const getPendingIncomingCallForUser = async (
    userId: bigint
) => {
    const ringingCall = await prisma.calls.findFirst({
        where: {
            callee_id: userId,
            status: "ringing",
            ended_at: null,
        },
        orderBy: {
            created_at: "desc",
        },
        include: {
            users_calls_caller_idTousers: {
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

    if (!ringingCall) {
        return null;
    }

    return {
        call: ringingCall,
        caller: ringingCall.users_calls_caller_idTousers,
    };
};
