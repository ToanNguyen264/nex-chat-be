import type { FeedChangedPayload } from "../services/post/post-feed.types";
import { getIO } from "./socket";

type EmitFeedChangedInput = {
    recipientIds: string[];
    payload: FeedChangedPayload;
};

export const emitFeedChanged = ({
    recipientIds,
    payload,
}: EmitFeedChangedInput) => {
    if (recipientIds.length === 0) {
        return;
    }

    const userRooms = recipientIds.map(
        (userId) => `user:${userId}`
    );

    getIO().to(userRooms).emit("feed:changed", payload);
};
