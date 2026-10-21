import { Router } from "express";

import * as callController from "../../controllers/call/call.controller";
import { auth } from "../../middlewares/auth.middleware";

const router = Router();


// Lấy token để tham gia phòng LiveKit
router.post(
    "/:callId/token",
    auth,
    callController.createCallToken
);

// Tạo một cuộc gọi mới

router.post(
    "/conversations/:conversationId",
    auth,
    callController.startCall
);

router.post(
    "/:callId/respond",
    auth,
    callController.respondToIncomingCall
);

router.post(
    "/:callId/end",
    auth,
    callController.endCall
);

export default router;
