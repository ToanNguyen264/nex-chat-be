import { getIO } from "./socket";

export type FriendshipChangeAction =
    | "requested"
    | "accepted"
    | "rejected"
    | "cancelled"
    | "removed";

type EmitFriendshipChangedInput = {
    friendshipId: bigint;
    requesterId: bigint;
    addresseeId: bigint;
    action: FriendshipChangeAction;
};

export const emitFriendshipChanged = (
    input: EmitFriendshipChangedInput
) => {
    try {
        const io = getIO();

        const payload = {
            friendshipId:
                input.friendshipId.toString(),
            requesterId:
                input.requesterId.toString(),
            addresseeId:
                input.addresseeId.toString(),
            action: input.action,
        };

        io.to(
            `user:${payload.requesterId}`
        )
            .to(`user:${payload.addresseeId}`)
            .emit(
                "friendship:changed",
                payload
            );
    } catch (error) {
        console.error(
            "EMIT FRIENDSHIP CHANGED ERROR:",
            error
        );
    }
};