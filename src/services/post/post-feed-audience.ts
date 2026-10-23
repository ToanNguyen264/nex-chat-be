import type {
    PostFeedAction,
} from "./post-feed.types";
import type { PostPrivacy } from "./post-visibility";

type GetPostFeedRecipientIdsInput = {
    ownerId: string;
    friendIds: string[];
    action: PostFeedAction;
    privacy: PostPrivacy;
};

export const getPostFeedRecipientIds = ({
    ownerId,
    friendIds,
    action,
    privacy,
}: GetPostFeedRecipientIdsInput): string[] => {
    if (action === "created" && privacy === "private") {
        return [ownerId];
    }

    return Array.from(new Set([ownerId, ...friendIds]));
};
