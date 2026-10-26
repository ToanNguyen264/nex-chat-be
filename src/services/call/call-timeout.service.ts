import prisma from "../../configs/prisma";
import { createCallSystemMessage } from "./call.lifecycle";

export const markRingingCallAsMissed = async (
    callId: bigint
) => {
    const endedAt = new Date();

    const updateResult =
        await prisma.calls.updateMany({
            where: {
                id: callId,
                status: "ringing",
            },

            data: {
                status: "missed",
                ended_at: endedAt,
                active_key: null,
            },
        });

    if (updateResult.count === 0) {
        return {
            expired: false,
            reason: "CALL_NOT_RINGING_OR_NOT_FOUND",
        } as const;
    }

    const call = await prisma.calls.findUnique({
        where: {
            id: callId,
        },

        select: {
            id: true,
            conversation_id: true,
            caller_id: true,
            callee_id: true,
            call_type: true,
            status: true,
            answered_at: true,
            ended_at: true,
        },
    });

    if (!call) {
        return {
            expired: false,
            reason: "CALL_NOT_FOUND_AFTER_UPDATE",
        } as const;
    }

    const systemMessage =
        await createCallSystemMessage(call);

    return {
        expired: true,
        call,
        systemMessage,
    } as const;
};