import { Router } from "express";

import * as conversationController from "../controllers/conversation.controller";
import { auth } from "../middlewares/auth.middleware";
import { uploadMessageMedia } from "../middlewares/upload.middleware";

const router = Router();

router.get(
    "/",
    auth,
    conversationController.getConversations
);

router.get(
    "/:conversationId/messages",
    auth,
    conversationController.getConversationMessages
);

router.post(
    "/:conversationId/messages",
    auth,
    conversationController.sendTextMessage
);

router.post(
    "/:conversationId/messages/media",
    auth,
    uploadMessageMedia,
    conversationController.sendMediaMessage
);

router.put(
    "/:conversationId/messages/:messageId/reaction",
    auth,
    conversationController.setMessageReaction
);

router.post(
    "/direct/:otherUserId",
    auth,
    conversationController.getOrCreateDirectConversation
);

export default router;
