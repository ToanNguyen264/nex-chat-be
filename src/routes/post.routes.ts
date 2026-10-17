import { Router } from "express";
import * as postController from "../controllers/post.controller";
import { auth } from "../middlewares/auth.middleware";
import { uploadPostMedia } from "../middlewares/upload.middleware";

const router = Router();

router.get("/", auth, postController.getPosts);
router.post("/", auth, uploadPostMedia, postController.createPost);
router.delete("/:id", auth, postController.deletePost);

export default router;
