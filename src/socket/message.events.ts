import { getIO } from "./socket";

type MessageUser = {
    id: bigint;
    user_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
};

type MessageForSocket = {
    id: bigint;
    conversation_id: bigint;
    sender_id: bigint | null;
    content: string | null;
    message_type: "text" | "image" | "file" | "system";
    reply_to_message_id: bigint | null;
    created_at: Date;
    updated_at: Date;
    users: MessageUser | null;
};

type EmitNewMessageInput = {
    message: MessageForSocket;
    recipientUserIds: bigint[];
};

export const serializeMessage = (
    message: MessageForSocket
) => ({
    ...message,
    id: message.id.toString(),
    conversation_id:
        message.conversation_id.toString(),
    sender_id: message.sender_id?.toString() ?? null,
    reply_to_message_id:
        message.reply_to_message_id?.toString() ?? null,
    users: message.users
        ? {
              ...message.users,
              id: message.users.id.toString(),
          }
        : null,
});

export const emitNewMessage = (
    input: EmitNewMessageInput
) => {
    try {
        const io = getIO();
        const userRooms = Array.from(
            new Set(
                input.recipientUserIds.map(
                    (userId) => `user:${userId.toString()}`
                )
            )
        );

        if (userRooms.length === 0) {
            return;
        }

        io.to(userRooms).emit(
            "message:new",
            serializeMessage(input.message)
        );
    } catch (error) {
        // Socket lỗi không được làm request REST đã lưu DB thất bại.
        console.error("EMIT NEW MESSAGE ERROR:", error);
    }
};
