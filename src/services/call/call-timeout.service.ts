import prisma from "../../configs/prisma";

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
            status: true,
            ended_at: true,
        },
    });

    if (!call) {
        return {
            expired: false,
            reason: "CALL_NOT_FOUND_AFTER_UPDATE",
        } as const;
    }

    return {
        expired: true,
        call,
    } as const;
};