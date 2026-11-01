import prisma from "../configs/prisma";
import * as storageService from "./storage.service";

/*
 * Service xử lý logic Follow / Unfollow (Sử dụng Soft Delete: is_deleted = "Yes" | "No")
 */

export class FollowError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/*
 * Thực hiện hành động theo dõi (Follow) một người dùng
 */
export const followUser = async (followerId: bigint, followingId: bigint) => {
    // 1. Chặn tự theo dõi chính mình
    if (followerId === followingId) {
        throw new FollowError("Bạn không thể tự theo dõi chính mình", 400);
    }

    // 2. Kiểm tra tài khoản đích có tồn tại và đang hoạt động không
    const targetUser = await prisma.users.findUnique({
        where: { id: followingId },
        select: { id: true, status: true, deleted: true },
    });

    if (!targetUser || targetUser.deleted === "YES" || targetUser.status !== "active") {
        throw new FollowError("Người dùng không tồn tại hoặc tài khoản đã bị khóa", 404);
    }

    // 3. Kiểm tra xem có bị block (chặn) nhau không
    const blockedRelationship = await prisma.friendships.findFirst({
        where: {
            status: "blocked",
            deleted_at: null,
            OR: [
                { requester_id: followerId, addressee_id: followingId },
                { requester_id: followingId, addressee_id: followerId },
            ],
        },
    });

    if (blockedRelationship) {
        throw new FollowError("Không thể theo dõi người dùng này", 403);
    }

    // 4. Dùng upsert: nếu chưa có thì tạo mới (is_deleted: "No"), nếu đã có (từng bị hủy follow = "Yes") thì hồi sinh lại ("No")
    await prisma.follows.upsert({
        where: {
            follower_id_following_id: {
                follower_id: followerId,
                following_id: followingId,
            },
        },
        create: {
            follower_id: followerId,
            following_id: followingId,
            is_deleted: "No",
        },
        update: {
            is_deleted: "No",
        },
    });

    // 5. Đếm số lượng follower còn active (is_deleted: "No")
    const [followerCount, followingCount] = await Promise.all([
        prisma.follows.count({ where: { following_id: followingId, is_deleted: "No" } }),
        prisma.follows.count({ where: { follower_id: followingId, is_deleted: "No" } }),
    ]);

    return {
        isFollowing: true,
        followerCount,
        followingCount,
    };
};

/*
 * Bỏ theo dõi (Unfollow) một người dùng bằng Soft Delete (đánh dấu is_deleted = "Yes")
 */
export const unfollowUser = async (followerId: bigint, followingId: bigint) => {
    if (followerId === followingId) {
        throw new FollowError("Thao tác không hợp lệ", 400);
    }

    // Cập nhật mềm: đánh dấu is_deleted = "Yes" thay vì xóa cứng khỏi DB
    await prisma.follows.updateMany({
        where: {
            follower_id: followerId,
            following_id: followingId,
            is_deleted: "No",
        },
        data: {
            is_deleted: "Yes",
        },
    });

    // Đếm lại số follower đang active (is_deleted: "No")
    const [followerCount, followingCount] = await Promise.all([
        prisma.follows.count({ where: { following_id: followingId, is_deleted: "No" } }),
        prisma.follows.count({ where: { follower_id: followingId, is_deleted: "No" } }),
    ]);

    return {
        isFollowing: false,
        followerCount,
        followingCount,
    };
};

/*
 * Kiểm tra trạng thái: viewer có đang theo dõi targetUser không
 */
export const getFollowStatus = async (viewerId: bigint, targetUserId: bigint) => {
    const existing = await prisma.follows.findFirst({
        where: {
            follower_id: viewerId,
            following_id: targetUserId,
            is_deleted: "No",
        },
    });

    return {
        isFollowing: Boolean(existing),
    };
};

export const getFollowers = async (
    targetUserId: bigint,
    cursor?: bigint,
    limit: number = 20
) => {
    let safeLimit = limit;
    if (safeLimit < 1) safeLimit = 1;
    if (safeLimit > 50) safeLimit = 50;

    const rows = await prisma.follows.findMany({
        where: {
            following_id: targetUserId,
            is_deleted: "No",
        },
        orderBy: { id: "desc" },
        take: safeLimit + 1,
        ...(cursor && {
            cursor: { id: cursor },
            skip: 1,
        }),
        include: {
            users_follows_follower_idTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    user_name: true,
                    avatar: true,
                },
            },
        },
    });

    const hasNextPage = rows.length > safeLimit;

    let items;
    if (hasNextPage) {
        // Trường hợp 1: CÒN trang sau (đang có 21 người bị thừa 1 người)
        items = rows.slice(0, safeLimit);
    } else {
        // Trường hợp 2: HẾT trang sau
        items = rows;
    }

    const lastItem = items[items.length - 1];

    let nextCursor;
    if (hasNextPage && lastItem) {
        nextCursor = lastItem.id.toString(); // Nếu CÒN trang sau: Lấy ID người cuối làm mốc
    } else {
        nextCursor = null;                   // Nếu HẾT RỒI: Gán bằng null
    }

    const users = items.map((row) => { /*items chứa danh sách người theo dõi */
        const u = row.users_follows_follower_idTousers;
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
        return {
            followId: row.id.toString(),
            followedAt: row.created_at.toISOString(),
            id: u.id.toString(),
            name: fullName || u.user_name || "Người dùng",
            userName: u.user_name,
            avatar: u.avatar ? storageService.getPublicMediaUrl(u.avatar) : null,
        };
    });

    return {
        users,
        nextCursor,
        hasNextPage,
    };
};

export const getFollowing = async (
    targetUserId: bigint,
    cursor?: bigint,
    limit: number = 20
) => {
    let safeLimit = limit;
    if (safeLimit < 1) safeLimit = 1;
    if (safeLimit > 50) safeLimit = 50;

    const rows = await prisma.follows.findMany({
        where: {
            follower_id: targetUserId,
            is_deleted: "No",
        },
        orderBy: { id: "desc" },
        take: safeLimit + 1,
        ...(cursor && {
            cursor: { id: cursor },
            skip: 1,
        }),
        include: {
            users_follows_following_idTousers: {
                select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    user_name: true,
                    avatar: true,
                },
            },
        },
    });

    const hasNextPage = rows.length > safeLimit;
    const items = hasNextPage ? rows.slice(0, safeLimit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasNextPage && lastItem ? lastItem.id.toString() : null;

    const users = items.map((row) => {
        const u = row.users_follows_following_idTousers;
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
        return {
            followId: row.id.toString(),
            followedAt: row.created_at.toISOString(),
            id: u.id.toString(),
            name: fullName || u.user_name || "Người dùng",
            userName: u.user_name,
            avatar: u.avatar ? storageService.getPublicMediaUrl(u.avatar) : null,
        };
    });

    return {
        users,
        nextCursor,
        hasNextPage,
    };
};
