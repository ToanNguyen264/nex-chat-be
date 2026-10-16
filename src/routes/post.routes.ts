import { Router } from "express";
import * as postController from "../controllers/post.controller";
import { auth } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", auth, postController.getPosts);
router.post("/", auth, postController.createPost);
router.delete("/:id", auth, postController.deletePost);

export default router;
