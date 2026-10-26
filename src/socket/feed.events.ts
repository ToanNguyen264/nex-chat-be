import type { FeedChangedPayload } from "../services/post/post-feed.types";
import type { ReactionSummaryItem } from "../services/post/post-reaction-summary";
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

type EmitPostReactionInput = {
    postId: string;
    reactionCount: number;
    reactionSummary: ReactionSummaryItem[];
    recipientIds: string[];
};

export const emitPostReactionUpdated = (
    input: EmitPostReactionInput
) => {
    try {
        if (input.recipientIds.length === 0) {
            return;
        }

        const userRooms = input.recipientIds.map(
            (userId) => `user:${userId}`
        );

        getIO().to(userRooms).emit("post:reaction-updated", {
            postId: input.postId,
            reactionCount: input.reactionCount,
            reactionSummary: input.reactionSummary,
        });
    } catch (error) {
        console.error(
            "EMIT POST REACTION ERROR:",
            error
        );
    }
};
