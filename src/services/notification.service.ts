import type { Prisma } from "@prisma/client";
import prisma from "../configs/prisma";
import { getIO } from "../socket/socket";
type FriendNotificationType =
    | "friend_request"
    | "friend_accept";

type CreateFriendNotificationInput = {
    recipientId: bigint;
    actorId: bigint;
    type: FriendNotificationType;
    friendshipId: bigint;
};

export const createFriendNotification = async (
    transaction: Prisma.TransactionClient,
    input: CreateFriendNotificationInput
) => {
    return transaction.notifications.create({
        data: {
            user_id: input.recipientId,
            actor_id: input.actorId,
            type: input.type,
            reference_id: input.friendshipId,
            is_read: false,
        },
        select: {
            id: true,
            user_id: true,
            actor_id: true,
            type: true,
            reference_id: true,
            is_read: true,
            created_at: true,

            users_notifications_actor_idTousers: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                },
            },
        },
    });
};

type CreatedFriendNotification = Awaited< ReturnType<typeof createFriendNotification> >;
/* 
ReturnType<typeof createFriendNotification> => trả về promise của hàm createFriendNotification, tức là Promise<CreatedFriendNotification>
Awaited để gỡ promise, lấy ra kiểu dữ liệu bên trong promise và không chạy hàm createFriendNotification, tức là CreatedFriendNotification
*/

export const emitNewNotification = (
    notification: CreatedFriendNotification
) => {
    try {
        const io = getIO();

        const actor = notification.users_notifications_actor_idTousers;

        const payload = {
            id: notification.id.toString(),
            user_id:
                notification.user_id.toString(),
            actor_id:
                notification.actor_id?.toString() ??
                null,
            type: notification.type,
            reference_id:
                notification.reference_id?.toString() ??
                null,
            is_read: notification.is_read,
            created_at: notification.created_at,
            actor: actor
                ? {
                      ...actor,
                      id: actor.id.toString(),
                  }
                : null,
        };

        io.to(`user:${notification.user_id.toString()}`).emit("notification:new", payload);

    } catch (error) {
        console.error(
            "EMIT NEW NOTIFICATION ERROR:",
            error
        );
    }
};

export const getNotifications = async (
    userId: bigint,
    cursorId?: bigint,
    requestedLimit = 20
) => {
    // Không cho limit nhỏ hơn 1 hoặc lớn hơn 50
    const limit = Math.min(
        Math.max(requestedLimit, 1),
        50
    );

    const notifications =
        await prisma.notifications.findMany({
            where: {
                user_id: userId,

                ...(cursorId && {
                    id: {
                        lt: cursorId,
                    },
                }),
            },

            select: {
                id: true,
                user_id: true,
                actor_id: true,
                type: true,
                reference_id: true,
                is_read: true,
                created_at: true,

                users_notifications_actor_idTousers: {
                    select: {
                        id: true,
                        user_name: true,
                        first_name: true,
                        last_name: true,
                        avatar: true,
                    },
                },
            },

            orderBy: {
                id: "desc",
            },

            take: limit + 1,
        });

    const hasNextPage =
        notifications.length > limit;

    const items = hasNextPage
        ? notifications.slice(0, limit)
        : notifications;

    const lastNotification =
        items[items.length - 1];

    const nextCursor =
        hasNextPage && lastNotification
            ? lastNotification.id
            : null;

    return {
        notifications: items,
        nextCursor,
        hasNextPage,
    };
};

export const markNotificationAsRead = async (
    userId: bigint,
    notificationId: bigint
) => {
    const notification =
        await prisma.notifications.findFirst({
            where: {
                id: notificationId,
                user_id: userId,
            },
            select: {
                id: true,
                user_id: true,
                is_read: true,
            },
        });

    if (!notification) {
        return null;
    }

    if (notification.is_read) {
        return notification;
    }

    return prisma.notifications.update({
        where: {
            id: notificationId,
        },
        data: {
            is_read: true,
        },
        select: {
            id: true,
            user_id: true,
            is_read: true,
        },
    });
};

export const markAllNotificationsAsRead = async (
    userId: bigint
) => {
    const result = await prisma.notifications.updateMany({
        where: {
            user_id: userId,
            is_read: false,
        },
        data: {
            is_read: true,
        },
    });

    return result.count;
};

export const getUnreadNotificationCount = async (
    userId: bigint
) => {
    return prisma.notifications.count({
        where: {
            user_id: userId,
            is_read: false,
        },
    });
};
