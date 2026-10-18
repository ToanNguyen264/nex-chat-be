import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../utils/token";
import {
    addUserSocket,
    getOnlineUserIds,
    removeUserSocket,
} from "./presence";

let io: SocketIOServer | null = null;

export const initializeSocket = (
    httpServer: HttpServer
) => {
    const clientUrl = process.env.CLIENT_URL;

    if (!clientUrl) {
        throw new Error("CLIENT_URL is missing");
    }

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: clientUrl,
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    // Middleware xác thực mọi kết nối socket
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (typeof token !== "string" || !token) 
            {
                return next(
                    new Error("Access token is required")
                );
            }

            const payload = verifyAccessToken(token);

            if (
                typeof payload === "string" ||
                payload.type !== "access" ||
                typeof payload.userId !== "string" ||
                !/^[1-9]\d*$/.test(payload.userId)
            ) {
                return next(
                    new Error("Invalid access token")
                );
            }

            // Lưu userId vào kết nối socket
            socket.data.userId = payload.userId;

            next();
        } catch {
            next(
                new Error(
                    "Invalid or expired access token"
                )
            );
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        const userRoom = `user:${userId}`;

        // Đưa kết nối vào room riêng của user
        socket.join(userRoom);

        const connectionResult = addUserSocket(
            userId,
            socket.id
        );

        console.log(
            `User ${userId} connected with socket ${socket.id}`
        );

        console.log(
            `User ${userId} has ${connectionResult.connectionCount} active socket(s)`
        );

        if (connectionResult.becameOnline) {
            socket.nsp.emit("presence:online", {
                userId,
            });
        }

        socket.emit("presence:snapshot", {
            userIds: getOnlineUserIds(),
        });

        socket.on("disconnect", (reason) => {
            const disconnectResult = removeUserSocket(
                userId,
                socket.id
            );

            console.log(
                `User ${userId} disconnected socket ${socket.id}: ${reason}`
            );

            console.log(
                `User ${userId} has ${disconnectResult.connectionCount} active socket(s)`
            );

            if (disconnectResult.becameOffline) {
                socket.nsp.emit("presence:offline", {
                    userId,
                });
            }
        });
    });

    return io;
};

// Dùng ở các service để phát sự kiện
export const getIO = () => {
    if (!io) {
        throw new Error(
            "Socket.IO has not been initialized"
        );
    }

    return io;
};
