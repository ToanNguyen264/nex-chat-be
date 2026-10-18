import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { auth } from "../middlewares/auth.middleware";
import {
    uploadProfileAvatar,
    uploadProfileCover,
} from "../middlewares/upload.middleware";

const router = Router();

router.get("/", userController.getUsers);
router.get("/me", auth, userController.getCurrentUser);
router.patch("/me/profile", auth, userController.updateMyProfile);
router.patch(
    "/me/avatar",
    auth,
    uploadProfileAvatar,
    userController.updateMyAvatar
);
router.patch(
    "/me/cover-image",
    auth,
    uploadProfileCover,
    userController.updateMyCoverImage
);
router.get("/:userId/profile", auth, userController.getUserProfile);
router.get("/:id", userController.getUser);
router.post("/", userController.createUser);
router.patch("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

export default router;
