import { Router } from "express";
import * as storyController from "../controllers/story.controller";
import { auth } from "../middlewares/auth.middleware";
import { uploadStoryMedia } from "../middlewares/upload.middleware";

const storyRouters = Router();

storyRouters.get("/", auth, storyController.getFeedStories);
storyRouters.post("/", auth, uploadStoryMedia, storyController.createStory);
storyRouters.delete("/:id", auth, storyController.deleteStory);

export default storyRouters;