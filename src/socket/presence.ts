const userSockets = new Map<string, Set<string>>();

export const addUserSocket = (
    userId: string,
    socketId: string
) => {
    let socketIds = userSockets.get(userId);
    const wasOffline = !socketIds || socketIds.size === 0;

    if (!socketIds) {
        socketIds = new Set<string>();
        userSockets.set(userId, socketIds);
    }

    socketIds.add(socketId);

    return {
        becameOnline: wasOffline,
        connectionCount: socketIds.size,
    };
};

export const removeUserSocket = (
    userId: string,
    socketId: string
) => {
    const socketIds = userSockets.get(userId);

    if (!socketIds) {
        return {
            becameOffline: false,
            connectionCount: 0,
        };
    }

    socketIds.delete(socketId);

    if (socketIds.size === 0) {
        userSockets.delete(userId);

        return {
            becameOffline: true,
            connectionCount: 0,
        };
    }

    return {
        becameOffline: false,
        connectionCount: socketIds.size,
    };
};

export const isUserOnline = (userId: string) => {
    return (userSockets.get(userId)?.size ?? 0) > 0;
};

export const getOnlineUserIds = () => {
    return Array.from(userSockets.keys());
};
