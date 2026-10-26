export type PostPrivacy =
    | "public"
    | "friends"
    | "private";

export type FriendshipStatus =
    | "pending"
    | "accepted"
    | "rejected"
    | "blocked";

export type FriendshipPair = {
    requester_id: bigint;
    addressee_id: bigint;
    status: FriendshipStatus;
    deleted_at: Date | null;
};

export const getProfileVisibility = (
    viewerId: bigint,
    ownerId: bigint,
    relationshipStatus: FriendshipStatus | null
): PostPrivacy[] | null => {
    if (viewerId === ownerId) {
        return ["public", "friends", "private"];
    }

    if (relationshipStatus === "blocked") {
        return null;
    }

    if (relationshipStatus === "accepted") {
        return ["public", "friends"];
    }

    return ["public"];
};

export const extractAcceptedFriendIds = (
    userId: bigint,
    relationships: FriendshipPair[]
): bigint[] => {
    const friendIds = new Set<bigint>();

    for (const relationship of relationships) {
        if ( relationship.status !== "accepted" || relationship.deleted_at !== null) 
        {
            continue;
        }

        if (relationship.requester_id === userId) {
            friendIds.add(relationship.addressee_id);
        } else if (relationship.addressee_id === userId) {
            friendIds.add(relationship.requester_id);
        }
    }

    return Array.from(friendIds);
};
