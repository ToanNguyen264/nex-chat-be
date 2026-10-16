import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { auth } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", userController.getUsers);
router.get("/me", auth, userController.getCurrentUser);
router.get("/:id", userController.getUser);
router.post("/", userController.createUser);
router.patch("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

export default router;
