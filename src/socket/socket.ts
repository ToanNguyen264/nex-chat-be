import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../utils/token";

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

        console.log(
            `User ${userId} connected with socket ${socket.id}`
        );

        console.log("Socket rooms:", socket.rooms);

        socket.on("disconnect", (reason) => {
            console.log(
                `User ${userId} disconnected: ${reason}`
            );
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