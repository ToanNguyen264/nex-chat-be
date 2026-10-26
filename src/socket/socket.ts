import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../utils/token";
import {
    addUserSocket,
    getOnlineUserIds,
    markLastSeenWrittenToDb,
    removeUserSocket,
    shouldWriteLastSeenToDb,
} from "./presence";
import { getPendingIncomingCallForUser } from "../services/call/call.service";
import prisma from "../configs/prisma";

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

            if (typeof token !== "string" || !token) {
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
            if (shouldWriteLastSeenToDb(userId)) {
                void prisma.users
                    .update({
                        where: { id: BigInt(userId) },
                        data: { last_seen_at: new Date() },
                    })
                    .catch((error) => {
                        console.error(
                            "UPDATE LAST SEEN ON CONNECT ERROR:",
                            error
                        );
                    });
            }
        }


        socket.emit("presence:snapshot", {
            userIds: getOnlineUserIds(),
        });

        // Nếu người dùng vừa online (hoặc F5 lại trang) trong lúc đang có cuộc gọi đổ chuông tới họ, gửi ngay sự kiện call:incoming
        void getPendingIncomingCallForUser(BigInt(userId))
            .then((pendingCall) => {
                if (!pendingCall) {
                    return;
                }

                socket.emit("call:incoming", {
                    callId: pendingCall.call.id.toString(),
                    conversationId:
                        pendingCall.call.conversation_id.toString(),
                    callerId:
                        pendingCall.call.caller_id.toString(),
                    callType: pendingCall.call.call_type,
                    status: pendingCall.call.status,
                    createdAt:
                        pendingCall.call.created_at.toISOString(),
                    caller: {
                        ...pendingCall.caller,
                        id: pendingCall.caller.id.toString(),
                    },
                });
            })
            .catch((error) => {
                console.error(
                    "SYNC PENDING INCOMING CALL ERROR:",
                    error
                );
            });

        socket.on("disconnect", (reason) => {
            const disconnectResult = removeUserSocket(
                userId,
                socket.id,
                () => {
                    const now = new Date();
                    markLastSeenWrittenToDb(
                        userId,
                        now.getTime()
                    );

                    void prisma.users
                        .update({
                            where: { id: BigInt(userId) },
                            data: { last_seen_at: now },
                        })
                        .catch((error) => {
                            console.error(
                                "UPDATE LAST SEEN ON DISCONNECT ERROR:",
                                error
                            );
                        });

                    socket.nsp.emit("presence:offline", {
                        userId,
                        lastSeenAt: now.toISOString(),
                    });
                }
            );

            console.log(
                `User ${userId} disconnected socket ${socket.id}: ${reason}`
            );

            console.log(
                `User ${userId} has ${disconnectResult.connectionCount} active socket(s)`
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
