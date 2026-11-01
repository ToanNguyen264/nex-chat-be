import { Router } from "express";
import * as followController from "../controllers/follow.controller";
import { auth } from "../middlewares/auth.middleware";

const router = Router();

router.post("/:targetUserId", auth, followController.follow);
router.delete("/:targetUserId", auth, followController.unfollow);
router.get("/:targetUserId/status", auth, followController.getStatus);
router.get("/:targetUserId/followers", auth, followController.getFollowers);
router.get("/:targetUserId/following", auth, followController.getFollowing);

export default router;

