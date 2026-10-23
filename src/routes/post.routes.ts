import { Router } from "express";
import * as postController from "../controllers/post.controller";
import { auth } from "../middlewares/auth.middleware";
import { uploadPostMedia } from "../middlewares/upload.middleware";
import * as commentController from "../controllers/comment.controller";

const router = Router();

router.get("/", auth, postController.getPosts);
router.get("/users/:userId", auth, postController.getUserPosts);
router.post("/", auth, uploadPostMedia, postController.createPost);
router.get("/:id/comments", auth, commentController.getPostComments);
router.post("/:id/comments", auth, commentController.createPostComment);
router.post("/:id/reaction", auth, postController.setPostReaction);
router.patch("/:id", auth, postController.updatePost);
router.delete("/:id", auth, postController.deletePost);

export default router;
