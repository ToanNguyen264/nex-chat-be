const userSockets = new Map<string, Set<string>>();

// Lưu bộ hẹn giờ chờ 5 giây trước khi xác nhận user thực sự offline (chống F5)
const pendingOfflineTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
>();

// Lưu thời điểm ghi DB gần nhất của mỗi user để giới hạn tối thiểu 60 giây mới ghi DB 1 lần
const lastDbWriteByUser = new Map<string, number>();

const OFFLINE_GRACE_PERIOD_MS = 5_000;
const DB_WRITE_THROTTLE_MS = 60_000;

export const shouldWriteLastSeenToDb = (
    userId: string,
    nowMs = Date.now()
) => {
    const lastWriteMs = lastDbWriteByUser.get(userId);

    if (
        lastWriteMs !== undefined &&
        nowMs - lastWriteMs < DB_WRITE_THROTTLE_MS
    ) {
        return false;
    }

    lastDbWriteByUser.set(userId, nowMs);
    return true;
};

export const markLastSeenWrittenToDb = (
    userId: string,
    nowMs = Date.now()
) => {
    lastDbWriteByUser.set(userId, nowMs);
};

export const addUserSocket = (
    userId: string,
    socketId: string
) => {
    // Nếu user vừa F5 và kết nối lại trong vòng 5 giây, hủy bộ hẹn giờ offline ngay
    const pendingTimer = pendingOfflineTimers.get(userId);
    const wasReconnectingWithinGrace =
        pendingTimer !== undefined;

    if (pendingTimer !== undefined) {
        clearTimeout(pendingTimer);
        pendingOfflineTimers.delete(userId);
    }

    let socketIds = userSockets.get(userId);
    const wasOffline = !wasReconnectingWithinGrace && (!socketIds || socketIds.size === 0);

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
    socketId: string,
    onConfirmedOffline?: () => void
) => {
    const socketIds = userSockets.get(userId);

    if (!socketIds) {
        return {
            scheduledOffline: false,
            connectionCount: 0,
        };
    }

    socketIds.delete(socketId);

    // Nếu vẫn còn tab khác đang mở thì chưa offline
    if (socketIds.size > 0) {
        return {
            scheduledOffline: false,
            connectionCount: socketIds.size,
        };
    }

    // Khi đóng tab cuối cùng: chờ 5 giây xem có phải F5 không
    const existingTimer = pendingOfflineTimers.get(userId);
    if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        pendingOfflineTimers.delete(userId);

        const currentSockets = userSockets.get(userId);
        if (currentSockets && currentSockets.size > 0) {
            return;
        }

        userSockets.delete(userId);
        onConfirmedOffline?.();
    }, OFFLINE_GRACE_PERIOD_MS);

    pendingOfflineTimers.set(userId, timer);

    return {
        scheduledOffline: true,
        connectionCount: 0,
    };
};

export const isUserOnline = (userId: string) => {
    return (userSockets.get(userId)?.size ?? 0) > 0;
};

export const getOnlineUserIds = () => {
    return Array.from(userSockets.keys());
};