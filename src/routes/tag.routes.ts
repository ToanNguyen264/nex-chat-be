import { Router } from "express";
import * as tagController from "../controllers/tag.controller";
import { auth } from "../middlewares/auth.middleware";

const tagRouters = Router();

/*
 * Định tuyến
 * - auth: Middleware kiểm tra đăng nhập (xác thực token)
 * - tagController.getTagSuggestions: Hàm xử lý gợi ý tag
 */
tagRouters.get("/suggest", auth, tagController.getTagSuggestions);

export default tagRouters;