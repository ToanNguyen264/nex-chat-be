import express from "express";
import dotenv from "dotenv";
import userRouters from "./routes/user.routes";
import authRouters from "./routes/auth.routes";
import postRouters from "./routes/post.routes";
import cookieParser from "cookie-parser";
import friendRouters from "./routes/friend.routes";
import notificationRouters from "./routes/notification.routes";
import conversationRouters from "./routes/conversation.routes";
import { createServer } from "http";
import { initializeSocket } from "./socket/socket";
import callRouters from "./routes/call/call.routes";
import { startCallTimeoutWorker } from "./workers/call-timeout.worker";
import { startPostFeedWorker } from "./workers/post-feed.worker";
import storyRouters from "./routes/story.routes";
import tagRouters from "./routes/tag.routes";
import { initTagTrie } from "./services/tag.service";
dotenv.config();

const app = express();
//Tạo HTTP server sau khi tạo Express app
const httpServer = createServer(app);

initializeSocket(httpServer);

app.use(express.json());
app.use(cookieParser());
app.use("/api/users", userRouters);
app.use("/api/auth", authRouters);
app.use("/api/posts", postRouters);
app.use("/api/friends", friendRouters);
app.use("/api/notifications", notificationRouters);
app.use("/api/conversations", conversationRouters);
app.use("/api/calls", callRouters);
app.use("/api/stories", storyRouters);
app.use("/api/tags", tagRouters);

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startCallTimeoutWorker();
    startPostFeedWorker();
    void initTagTrie(); // Tự động nạp sẵn các tag hot vào Cây Trie trên RAM ngay khi bật server
});
