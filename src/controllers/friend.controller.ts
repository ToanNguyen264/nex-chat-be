import type { Response, Request } from "express";

import type { AuthRequest } from "../middlewares/auth.middleware";
import * as friendService from "../services/friend.service";


const serializeFriendship = <T extends {
    id: bigint;
    requester_id: bigint;
    addressee_id: bigint;
    blocked_by?: bigint | null;
}>(friendship: T) => ({
    ...friendship,
    id: friendship.id.toString(),
    requester_id: friendship.requester_id.toString(),
    addressee_id: friendship.addressee_id.toString(),
    blocked_by: friendship.blocked_by?.toString() ?? null,
});

export const sendFriendRequest = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        // ID người gửi được auth middleware lấy từ JWT
        const requesterId = req.userId;

        if (!requesterId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // ID người nhận được lấy từ URL
        const { addresseeId } = req.params;

        if (
            !addresseeId ||
            Array.isArray(addresseeId) ||
            !/^\d+$/.test(addresseeId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid addressee ID",
            });
        }

        const result = await friendService.sendFriendRequest(
            requesterId,
            BigInt(addresseeId)
        );

        if (!result.success) {
            switch (result.reason) {
                case "CANNOT_ADD_YOURSELF":
                    return res.status(400).json({
                        success: false,
                        message: "Bạn không thể kết bạn với chính mình",
                    });

                case "USER_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Không tìm thấy người dùng",
                    });

                case "ALREADY_FRIENDS":
                    return res.status(409).json({
                        success: false,
                        message: "Hai người đã là bạn bè",
                    });

                case "RELATIONSHIP_BLOCKED":
                    return res.status(403).json({
                        success: false,
                        message: "Không thể gửi lời mời kết bạn",
                    });

                case "REQUEST_ALREADY_SENT":
                    return res.status(409).json({
                        success: false,
                        message: "Bạn đã gửi lời mời trước đó",
                    });

                case "INCOMING_REQUEST_EXISTS":
                    return res.status(409).json({
                        success: false,
                        message:
                            "Người này đã gửi lời mời cho bạn. Hãy chấp nhận hoặc từ chối",
                    });
            }
        }

        const friendship = result.friendship;

        return res.status(201).json({
            success: true,
            message: "Gửi lời mời kết bạn thành công",
            data: serializeFriendship(friendship),
        });
    } catch (error) {
        console.error("SEND FRIEND REQUEST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
// Controller trả danh sách lời mời
export const getIncomingFriendRequests = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const requests =
            await friendService.getIncomingFriendRequests(userId);

        const data = requests.map((request) => {
            const requester = request.users_friendships_requester_idTousers;

            return {
                id: request.id.toString(),
                requester_id: request.requester_id.toString(),
                addressee_id: request.addressee_id.toString(),
                status: request.status,
                created_at: request.created_at,

                requester: {
                    ...requester,
                    id: requester.id.toString(),
                },
            };
        });

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error(
            "GET INCOMING FRIEND REQUESTS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

//Controller chấp nhận lời mời
export const acceptFriendRequest = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { friendshipId } = req.params;

        if (
            !friendshipId ||
            Array.isArray(friendshipId) ||
            !/^\d+$/.test(friendshipId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid friendship ID",
            });
        }

        const result = await friendService.acceptFriendRequest(
            userId,
            BigInt(friendshipId)
        );

        if (!result.success) {
            switch (result.reason) {
                case "REQUEST_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Không tìm thấy lời mời kết bạn",
                    });

                case "NOT_REQUEST_RECEIVER":
                    return res.status(403).json({
                        success: false,
                        message:
                            "Bạn không có quyền chấp nhận lời mời này",
                    });

                case "ALREADY_ACCEPTED":
                    return res.status(409).json({
                        success: false,
                        message: "Lời mời này đã được chấp nhận",
                    });

                case "REQUEST_NOT_PENDING":
                    return res.status(409).json({
                        success: false,
                        message:
                            "Lời mời này không còn ở trạng thái chờ",
                    });
            }
        }

        const friendship = result.friendship;

        return res.status(200).json({
            success: true,
            message: "Chấp nhận lời mời kết bạn thành công",
            data: serializeFriendship(friendship),
        });
    } catch (error) {
        console.error("ACCEPT FRIEND REQUEST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const rejectFriendRequest = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { friendshipId } = req.params;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!friendshipId || Array.isArray(friendshipId) || !/^\d+$/.test(friendshipId)) {
            return res.status(400).json({ success: false, message: "Invalid friendship ID" });
        }

        const result = await friendService.rejectFriendRequest(
            userId,
            BigInt(friendshipId)
        );

        if (!result.success) {
            const errors = {
                REQUEST_NOT_FOUND: [404, "Không tìm thấy lời mời kết bạn"],
                NOT_REQUEST_RECEIVER: [403, "Bạn không có quyền từ chối lời mời này"],
                ALREADY_REJECTED: [409, "Lời mời này đã bị từ chối"],
                REQUEST_NOT_PENDING: [409, "Lời mời này không còn ở trạng thái chờ"],
            } as const;
            const [status, message] = errors[result.reason];
            return res.status(status).json({ success: false, message });
        }

        return res.status(200).json({
            success: true,
            message: "Đã từ chối lời mời kết bạn",
            data: serializeFriendship(result.friendship),
        });
    } catch (error) {
        console.error("REJECT FRIEND REQUEST ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getOutgoingFriendRequests = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const requests = await friendService.getOutgoingFriendRequests(req.userId);
        const data = requests.map((request) => {
            const addressee = request.users_friendships_addressee_idTousers;

            return {
                id: request.id.toString(),
                requester_id: request.requester_id.toString(),
                addressee_id: request.addressee_id.toString(),
                status: request.status,
                created_at: request.created_at,
                addressee: {
                    ...addressee,
                    id: addressee.id.toString(),
                },
            };
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET OUTGOING FRIEND REQUESTS ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const cancelFriendRequest = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { friendshipId } = req.params;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!friendshipId || Array.isArray(friendshipId) || !/^\d+$/.test(friendshipId)) {
            return res.status(400).json({ success: false, message: "Invalid friendship ID" });
        }

        const result = await friendService.cancelFriendRequest(userId, BigInt(friendshipId));

        if (!result.success) {
            const errors = {
                REQUEST_NOT_FOUND: [404, "Không tìm thấy lời mời kết bạn"],
                NOT_REQUEST_SENDER: [403, "Bạn không có quyền hủy lời mời này"],
                REQUEST_NOT_PENDING: [409, "Lời mời này không còn ở trạng thái chờ"],
            } as const;
            const [status, message] = errors[result.reason];
            return res.status(status).json({ success: false, message });
        }

        return res.status(200).json({ success: true, message: "Đã hủy lời mời kết bạn" });
    } catch (error) {
        console.error("CANCEL FRIEND REQUEST ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getFriends = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const friendships = await friendService.getFriends(userId);
        const data = friendships.map((friendship) => {
            const friend = friendship.requester_id === userId
                ? friendship.users_friendships_addressee_idTousers
                : friendship.users_friendships_requester_idTousers;

            return {
                friendship_id: friendship.id.toString(),
                friends_since: friendship.updated_at,
                friend: {
                    ...friend,
                    id: friend.id.toString(),
                },
            };
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("GET FRIENDS ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getRelationshipWithUser = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const userId = req.userId;
        const { otherUserId } = req.params;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!otherUserId || Array.isArray(otherUserId) || !/^\d+$/.test(otherUserId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID" });
        }

        const relationship = await friendService.getRelationshipWithUser(
            userId,
            BigInt(otherUserId)
        );

        return res.status(200).json({
            success: true,
            data: relationship ? serializeFriendship(relationship) : null,
        });
    } catch (error) {
        console.error("GET FRIENDSHIP STATUS ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const removeFriend = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { friendshipId } = req.params;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!friendshipId || Array.isArray(friendshipId) || !/^\d+$/.test(friendshipId)) {
            return res.status(400).json({ success: false, message: "Invalid friendship ID" });
        }

        const result = await friendService.removeFriend(userId, BigInt(friendshipId));

        if (!result.success) {
            const errors = {
                FRIENDSHIP_NOT_FOUND: [404, "Không tìm thấy quan hệ bạn bè"],
                NOT_FRIENDSHIP_MEMBER: [403, "Bạn không có quyền hủy quan hệ này"],
                NOT_FRIENDS: [409, "Hai người hiện không phải bạn bè"],
            } as const;
            const [status, message] = errors[result.reason];
            return res.status(status).json({ success: false, message });
        }

        return res.status(200).json({ success: true, message: "Đã hủy kết bạn" });
    } catch (error) {
        console.error("REMOVE FRIEND ERROR:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const blockUser = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { targetUserId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (
            !targetUserId ||
            Array.isArray(targetUserId) ||
            !/^\d+$/.test(targetUserId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid target user ID",
            });
        }

        const result = await friendService.blockUser(
            userId,
            BigInt(targetUserId)
        );

        if (!result.success) {
            switch (result.reason) {
                case "CANNOT_BLOCK_YOURSELF":
                    return res.status(400).json({
                        success: false,
                        message: "Bạn không thể chặn chính mình",
                    });

                case "USER_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Không tìm thấy người dùng",
                    });

                case "ALREADY_BLOCKED":
                    return res.status(409).json({
                        success: false,
                        message: "Bạn đã chặn người dùng này",
                    });

                case "BLOCKED_BY_OTHER_USER":
                    return res.status(403).json({
                        success: false,
                        message: "Không thể thay đổi quan hệ này",
                    });
            }
        }

        return res.status(200).json({
            success: true,
            message: "Đã chặn người dùng",
            data: serializeFriendship(result.friendship),
        });
    } catch (error) {
        console.error("BLOCK USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const unblockUser = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { targetUserId } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (
            !targetUserId ||
            Array.isArray(targetUserId) ||
            !/^\d+$/.test(targetUserId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid target user ID",
            });
        }

        const result = await friendService.unblockUser(
            userId,
            BigInt(targetUserId)
        );

        if (!result.success) {
            switch (result.reason) {
                case "CANNOT_UNBLOCK_YOURSELF":
                    return res.status(400).json({
                        success: false,
                        message: "Bạn không thể bỏ chặn chính mình",
                    });

                case "USER_NOT_BLOCKED":
                    return res.status(404).json({
                        success: false,
                        message: "Người dùng này không nằm trong danh sách chặn",
                    });

                case "NOT_BLOCK_OWNER":
                    return res.status(403).json({
                        success: false,
                        message: "Bạn không có quyền bỏ chặn quan hệ này",
                    });
            }
        }

        return res.status(200).json({
            success: true,
            message: "Đã bỏ chặn người dùng",
        });
    } catch (error) {
        console.error("UNBLOCK USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};


export const getFriendSuggestions = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const requestedLimit = Number(req.query.limit ?? 20);

        const limit = Number.isInteger(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 50)
            : 20;

        const candidates =
            await friendService.getFriendSuggestionCandidates({
                userId: req.userId,
                limit,
            });

        const data = candidates.map((candidate) => ({
            ...candidate,
            id: candidate.id.toString(), /* chuyển id về dạng string để phù hợp với kiểu dữ liệu của JSON */
        }));

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error(
            "GET FRIEND SUGGESTIONS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};