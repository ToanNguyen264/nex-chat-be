import type {
    calls_call_type,
    calls_status,
} from "@prisma/client";

import { getIO } from "./socket";

type IncomingCallUser = {
    id: bigint;
    user_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
};

type EmitIncomingCallInput = {
    call: {
        id: bigint;
        conversation_id: bigint;
        caller_id: bigint;
        callee_id: bigint;
        call_type: calls_call_type;
        status: calls_status;
        created_at: Date;
    };
    caller: IncomingCallUser;
};

export const emitIncomingCall = (
    input: EmitIncomingCallInput
) => {
    try {
        const io = getIO();

        const payload = {
            callId: input.call.id.toString(),
            conversationId:
                input.call.conversation_id.toString(),
            callerId: input.call.caller_id.toString(),
            callType: input.call.call_type,
            status: input.call.status,
            createdAt:
                input.call.created_at.toISOString(),

            caller: {
                ...input.caller,
                id: input.caller.id.toString(),
            },
        };

        io.to(
            `user:${input.call.callee_id.toString()}`
        ).emit("call:incoming", payload);
    } catch (error) {
        console.error(
            "EMIT INCOMING CALL ERROR:",
            error
        );
    }
};

type EmitCallRespondedInput = {
    call: {
        id: bigint;
        conversation_id: bigint;
        caller_id: bigint;
        callee_id: bigint;
        status: calls_status;
        answered_at: Date | null;
        ended_at: Date | null;
    };
    action: "accept" | "reject";
};

export const emitCallResponded = (
    input: EmitCallRespondedInput
) => {
    try {
        const io = getIO();

        const payload = {
            callId: input.call.id.toString(),
            conversationId:
                input.call.conversation_id.toString(),
            callerId: input.call.caller_id.toString(),
            calleeId: input.call.callee_id.toString(),
            action: input.action,
            status: input.call.status,
            answeredAt:
                input.call.answered_at?.toISOString() ?? null,
            endedAt:
                input.call.ended_at?.toISOString() ?? null,
        };

        const userRooms = [
            `user:${payload.callerId}`,
            `user:${payload.calleeId}`,
        ];

        io.to(userRooms).emit("call:responded", payload);
    } catch (error) {
        // Socket lỗi không được làm REST request đã lưu DB thất bại.
        console.error("EMIT CALL RESPONDED ERROR:", error);
    }
};

type EmitCallEndedInput = {
    call: {
        id: bigint;
        conversation_id: bigint;
        caller_id: bigint;
        callee_id: bigint;
        status: calls_status;
        ended_at: Date | null;
    };
};

export const emitCallEnded = (
    input: EmitCallEndedInput
) => {
    try {
        const io = getIO();
        const payload = {
            callId: input.call.id.toString(),
            conversationId:
                input.call.conversation_id.toString(),
            callerId: input.call.caller_id.toString(),
            calleeId: input.call.callee_id.toString(),
            status: input.call.status,
            endedAt:
                input.call.ended_at?.toISOString() ?? null,
        };

        io.to([
            `user:${payload.callerId}`,
            `user:${payload.calleeId}`,
        ]).emit("call:ended", payload);
    } catch (error) {
        console.error("EMIT CALL ENDED ERROR:", error);
    }
};
