import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import * as notificationService from "../services/notification.service";

export const getNotifications = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const cursorQuery = req.query.cursor;
        const limitQuery = req.query.limit;

        if (cursorQuery !== undefined && (typeof cursorQuery !== "string" || !/^[1-9]\d*$/.test(cursorQuery))) 
        {
            return res.status(400).json({
                success: false,
                message: "cursor must be a positive integer",
            });
        }

        if (limitQuery !== undefined &&
            (typeof limitQuery !== "string" ||
                !/^[1-9]\d*$/.test(limitQuery))
        ) {
            return res.status(400).json({
                success: false,
                message: "limit must be a positive integer",
            });
        }

        const cursorId = typeof cursorQuery === "string"
                ? BigInt(cursorQuery)
                : undefined;

        const limit = typeof limitQuery === "string"
                ? Number(limitQuery)
                : 20;

        const result = await notificationService.getNotifications(
                req.userId,
                cursorId,
                limit
            );

        const notifications = result.notifications.map(
            (notification) => {
                const actor =notification.users_notifications_actor_idTousers;

                return {
                    id: notification.id.toString(),
                    user_id: notification.user_id.toString(),
                    actor_id: notification.actor_id?.toString() ?? null,
                    type: notification.type,
                    reference_id: notification.reference_id?.toString() ?? null,
                    is_read: notification.is_read,
                    created_at: notification.created_at,
                    actor: actor
                        ? {
                              ...actor,
                              id: actor.id.toString(),
                          }
                        : null,
                };
            }
        );

        return res.status(200).json({
            success: true,
            data: notifications,
            pagination: {
                nextCursor:
                    result.nextCursor?.toString() ?? null,
                hasNextPage: result.hasNextPage,
            },
        });
    } catch (error) {
        console.error("GET NOTIFICATIONS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const markNotificationAsRead = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { notificationId } = req.params;

        if (
            typeof notificationId !== "string" ||
            !/^[1-9]\d*$/.test(notificationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "notificationId must be a positive integer",
            });
        }

        const notification =
            await notificationService.markNotificationAsRead(
                req.userId,
                BigInt(notificationId)
            );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            data: {
                id: notification.id.toString(),
                user_id: notification.user_id.toString(),
                is_read: notification.is_read,
            },
        });
    } catch (error) {
        console.error("MARK NOTIFICATION AS READ ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const markAllNotificationsAsRead = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const updatedCount =
            await notificationService.markAllNotificationsAsRead(
                req.userId
            );

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read",
            data: {
                updatedCount,
            },
        });
    } catch (error) {
        console.error("MARK ALL NOTIFICATIONS AS READ ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const getUnreadNotificationCount = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const unreadCount =
            await notificationService.getUnreadNotificationCount(
                req.userId
            );

        return res.status(200).json({
            success: true,
            data: {
                unreadCount,
            },
        });
    } catch (error) {
        console.error("GET UNREAD NOTIFICATION COUNT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
