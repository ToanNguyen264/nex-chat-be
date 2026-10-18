import { Router } from "express";

import * as notificationController from "../controllers/notification.controller";
import { auth } from "../middlewares/auth.middleware";

const router = Router();

router.get(
    "/",
    auth,
    notificationController.getNotifications
);

router.get(
    "/unread-count",
    auth,
    notificationController.getUnreadNotificationCount
);

router.patch(
    "/read-all",
    auth,
    notificationController.markAllNotificationsAsRead
);

router.patch(
    "/:notificationId/read",
    auth,
    notificationController.markNotificationAsRead
);

export default router;
