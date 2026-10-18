import { Router } from "express";

import * as friendController from "../controllers/friend.controller";
import { auth } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", auth, friendController.getFriends);
router.get(
    "/relationship/:otherUserId",
    auth,
    friendController.getRelationshipWithUser
);
router.get(
    "/requests/incoming",
    auth,
    friendController.getIncomingFriendRequests
);
router.get(
    "/requests/outgoing",
    auth,
    friendController.getOutgoingFriendRequests
);
router.post(
    "/blocks/:targetUserId",
    auth,
    friendController.blockUser
);
router.delete(
    "/blocks/:targetUserId",
    auth,
    friendController.unblockUser
);
router.post(
    "/requests/:addresseeId",
    auth,
    friendController.sendFriendRequest
);
router.patch(
    "/requests/:friendshipId/accept",
    auth,
    friendController.acceptFriendRequest
);
router.patch(
    "/requests/:friendshipId/reject",
    auth,
    friendController.rejectFriendRequest
);
router.delete(
    "/requests/:friendshipId",
    auth,
    friendController.cancelFriendRequest
);
router.delete(
    "/:friendshipId",
    auth,
    friendController.removeFriend
);

router.get(
    "/suggestions",
    auth,
    friendController.getFriendSuggestions
);

export default router;
