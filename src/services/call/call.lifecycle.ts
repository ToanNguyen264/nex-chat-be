import type { calls_status } from "@prisma/client";

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
