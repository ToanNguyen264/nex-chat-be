import prisma from "../configs/prisma";
import {
    createFriendNotification,
    emitNewNotification,
} from "./notification.service";
import { emitFriendshipChanged } from "../socket/friendship.events";


type GetFriendSuggestionCandidatesInput = {
    userId: bigint;
    limit?: number;
};

const normalizeMatchText = (
    value: string | null | undefined
) => {
    return value?.trim().toLocaleLowerCase("vi-VN") ?? "";
};

const isSameProfileValue = (
    firstValue: string | null | undefined,
    secondValue: string | null | undefined
) => {
    const first = normalizeMatchText(firstValue);
    const second = normalizeMatchText(secondValue);

    return first !== "" && first === second;
};
/* 
userId: ID người đang đăng nhập.
limit: số ứng viên tối đa cần lấy
 */


const createPairKey = (firstUserId: bigint, secondUserId: bigint) => {
    let smallerId: bigint;
    let largerId: bigint;

    if (firstUserId < secondUserId) {
        smallerId = firstUserId;
        largerId = secondUserId;
    } else {
        smallerId = secondUserId;
        largerId = firstUserId;
    }

    return `${smallerId}:${largerId}`;
};

export const sendFriendRequest = async (
    requesterId: bigint,
    addresseeId: bigint
) => {
    // Không được tự kết bạn với chính mình
    if (requesterId === addresseeId) {
        return {
            success: false,
            reason: "CANNOT_ADD_YOURSELF",
        } as const;
    }

    // Kiểm tra người nhận có tồn tại không
    const addressee = await prisma.users.findFirst({
        where: {
            id: addresseeId,
            deleted: "NO",
        },
        select: {
            id: true,
        },
    });

    if (!addressee) {
        return {
            success: false,
            reason: "USER_NOT_FOUND",
        } as const;
    }

    // Luôn đặt ID nhỏ trước để tạo pairKey duy nhất
    const pairKey = createPairKey(requesterId, addresseeId);

    // Kiểm tra hai người đã có quan hệ trước đó chưa
    const existingFriendship =
        await prisma.friendships.findUnique({
            where: {
                pair_key: pairKey,
            },
        });

    // Khôi phục quan hệ đã bị xóa mềm thay vì tạo bản ghi trùng pair_key
    if (existingFriendship?.deleted_at) {
        const result = await prisma.$transaction(
            async (transaction) => {
                const friendship =
                    await transaction.friendships.update({
                        where: {
                            id: existingFriendship.id,
                        },
                        data: {
                            requester_id: requesterId,
                            addressee_id: addresseeId,
                            status: "pending",
                            blocked_by: null,
                            deleted_at: null,
                            updated_at: new Date(),
                        },
                    });

                const notification =
                    await createFriendNotification(
                        transaction,
                        {
                            recipientId: addresseeId,
                            actorId: requesterId,
                            type: "friend_request",
                            friendshipId: friendship.id,
                        }
                    );

                return {
                    friendship,
                    notification,
                };
            }
        );

        // Đến đây transaction đã commit thành công
        emitNewNotification(result.notification);
        emitFriendshipChanged({
            friendshipId: result.friendship.id,
            requesterId:
                result.friendship.requester_id,
            addresseeId:
                result.friendship.addressee_id,
            action: "requested",
        });

        return {
            success: true,
            friendship: result.friendship,
        } as const;
    }

    if (existingFriendship?.status === "accepted") {
        return {
            success: false,
            reason: "ALREADY_FRIENDS",
        } as const;
    }

    if (existingFriendship?.status === "blocked") {
        return {
            success: false,
            reason: "RELATIONSHIP_BLOCKED",
        } as const;
    }

    if (existingFriendship?.status === "pending") {
        const reason =
            existingFriendship.requester_id === requesterId
                ? "REQUEST_ALREADY_SENT"
                : "INCOMING_REQUEST_EXISTS";

        return {
            success: false,
            reason,
        } as const;
    }

    // Nếu trước đây từng bị từ chối thì sử dụng lại bản ghi cũ
    if (existingFriendship?.status === "rejected") {
        const result = await prisma.$transaction(
            async (transaction) => {
                const friendship =
                    await transaction.friendships.update({
                        where: {
                            id: existingFriendship.id,
                        },
                        data: {
                            requester_id: requesterId,
                            addressee_id: addresseeId,
                            status: "pending",
                            blocked_by: null,
                            deleted_at: null,
                            updated_at: new Date(),
                        },
                    });

                const notification =
                    await createFriendNotification(
                        transaction,
                        {
                            recipientId: addresseeId,
                            actorId: requesterId,
                            type: "friend_request",
                            friendshipId: friendship.id,
                        }
                    );

                return {
                    friendship,
                    notification,
                };
            }
        );

        emitNewNotification(result.notification);
        emitFriendshipChanged({
            friendshipId: result.friendship.id,
            requesterId:
                result.friendship.requester_id,
            addresseeId:
                result.friendship.addressee_id,
            action: "requested",
        });

        return {
            success: true,
            friendship: result.friendship,
        } as const;
    }

    // Chưa từng có quan hệ thì tạo lời mời mới
    const result = await prisma.$transaction(
        async (transaction) => {
            const friendship =
                await transaction.friendships.create({
                    data: {
                        requester_id: requesterId,
                        addressee_id: addresseeId,
                        pair_key: pairKey,
                        status: "pending",
                    },
                });

            const notification =
                await createFriendNotification(
                    transaction,
                    {
                        recipientId: addresseeId,
                        actorId: requesterId,
                        type: "friend_request",
                        friendshipId: friendship.id,
                    }
                );

            return {
                friendship,
                notification,
            };
        }
    );

    emitNewNotification(result.notification);
    emitFriendshipChanged({
        friendshipId: result.friendship.id,
        requesterId:
            result.friendship.requester_id,
        addresseeId:
            result.friendship.addressee_id,
        action: "requested",
    });

    return {
        success: true,
        friendship: result.friendship,
    } as const;
};


export const getIncomingFriendRequests = async (
    userId: bigint
) => {
    const requests = await prisma.friendships.findMany({
        where: {
            addressee_id: userId,
            status: "pending",
            deleted_at: null,
        },
        select: {
            id: true,
            requester_id: true,
            addressee_id: true,
            status: true,
            created_at: true,

            users_friendships_requester_idTousers: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                    deleted: true,
                },
            },
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return requests.filter(
        (request) =>
            request.users_friendships_requester_idTousers?.deleted === "NO"
    );
};

//Service chấp nhận lời mời
export const acceptFriendRequest = async (
    userId: bigint,
    friendshipId: bigint
) => {
    const friendship = await prisma.friendships.findUnique({
        where: {
            id: friendshipId,
        },
    });

    if (!friendship || friendship.deleted_at) {
        return {
            success: false,
            reason: "REQUEST_NOT_FOUND",
        } as const;
    }

    // Chỉ người nhận lời mời mới được chấp nhận
    if (friendship.addressee_id !== userId) {
        return {
            success: false,
            reason: "NOT_REQUEST_RECEIVER",
        } as const;
    }

    if (friendship.status === "accepted") {
        return {
            success: false,
            reason: "ALREADY_ACCEPTED",
        } as const;
    }

    // Chỉ lời mời pending mới được chấp nhận
    if (friendship.status !== "pending") {
        return {
            success: false,
            reason: "REQUEST_NOT_PENDING",
        } as const;
    }

    const result = await prisma.$transaction(
        async (transaction) => {
            const acceptedFriendship = await transaction.friendships.update({
                where: {
                    id: friendshipId,
                },
                data: {
                    status: "accepted",
                    blocked_by: null,
                    updated_at: new Date(),
                },
            });

            const notification =
                await createFriendNotification(
                    transaction,
                    {
                        recipientId: friendship.requester_id,
                        actorId: userId,
                        type: "friend_accept",
                        friendshipId: acceptedFriendship.id,
                    }
                );

            return {
                friendship: acceptedFriendship,
                notification,
            };
        }
    );

    emitNewNotification(result.notification);
    emitFriendshipChanged({
        friendshipId: result.friendship.id,
        requesterId:
            result.friendship.requester_id,
        addresseeId:
            result.friendship.addressee_id,
        action: "accepted",
    });

    return {
        success: true,
        friendship: result.friendship,
    } as const;
};

//Service từ chối lời mời
export const rejectFriendRequest = async (
    userId: bigint,
    friendshipId: bigint
) => {
    const friendship = await prisma.friendships.findUnique({
        where: {
            id: friendshipId,
        },
    });

    if (!friendship || friendship.deleted_at) {
        return {
            success: false,
            reason: "REQUEST_NOT_FOUND",
        } as const;
    }

    // Chỉ người nhận lời mời mới được từ chối
    if (friendship.addressee_id !== userId) {
        return {
            success: false,
            reason: "NOT_REQUEST_RECEIVER",
        } as const;
    }

    if (friendship.status === "rejected") {
        return {
            success: false,
            reason: "ALREADY_REJECTED",
        } as const;
    }

    // Không thể từ chối lời mời đã accepted hoặc blocked
    if (friendship.status !== "pending") {
        return {
            success: false,
            reason: "REQUEST_NOT_PENDING",
        } as const;
    }

    const updatedFriendship =
        await prisma.friendships.update({
            where: {
                id: friendshipId,
            },
            data: {
                status: "rejected",
                blocked_by: null,
                updated_at: new Date(),
            },
        });

    emitFriendshipChanged({
        friendshipId: updatedFriendship.id,
        requesterId:
            updatedFriendship.requester_id,
        addresseeId:
            updatedFriendship.addressee_id,
        action: "rejected",
    });

    return {
        success: true,
        friendship: updatedFriendship,
    } as const;
};

export const getOutgoingFriendRequests = async (
    userId: bigint
) => {
    const requests = await prisma.friendships.findMany({
        where: {
            requester_id: userId,
            status: "pending",
            deleted_at: null,
        },
        select: {
            id: true,
            requester_id: true,
            addressee_id: true,
            status: true,
            created_at: true,
            users_friendships_addressee_idTousers: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                    deleted: true,
                },
            },
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return requests.filter(
        (request) =>
            request.users_friendships_addressee_idTousers?.deleted === "NO"
    );
};

export const cancelFriendRequest = async (
    userId: bigint,
    friendshipId: bigint
) => {
    const friendship = await prisma.friendships.findUnique({
        where: { id: friendshipId },
    });

    if (!friendship || friendship.deleted_at) {
        return { success: false, reason: "REQUEST_NOT_FOUND" } as const;
    }

    if (friendship.requester_id !== userId) {
        return { success: false, reason: "NOT_REQUEST_SENDER" } as const;
    }

    if (friendship.status !== "pending") {
        return { success: false, reason: "REQUEST_NOT_PENDING" } as const;
    }

    await prisma.friendships.update({
        where: { id: friendshipId },
        data: {
            deleted_at: new Date(),
            updated_at: new Date(),
        },
    });

    emitFriendshipChanged({
        friendshipId: friendship.id,
        requesterId: friendship.requester_id,
        addresseeId: friendship.addressee_id,
        action: "cancelled",
    });

    return { success: true } as const;
};

export const getFriends = async (userId: bigint) => {
    const friendships = await prisma.friendships.findMany({
        where: {
            status: "accepted",
            deleted_at: null,
            OR: [
                {
                    requester_id: userId,
                },
                {
                    addressee_id: userId,
                },
            ],
        },
        select: {
            id: true,
            requester_id: true,
            addressee_id: true,
            updated_at: true,
            users_friendships_requester_idTousers: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                    last_seen_at: true,
                    deleted: true,
                },
            },
            users_friendships_addressee_idTousers: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                    last_seen_at: true,
                    deleted: true,
                },
            },
        },
        orderBy: {
            updated_at: "desc",
        },
    });

    return friendships.filter((friendship) => {
        const friend =
            friendship.requester_id === userId
                ? friendship.users_friendships_addressee_idTousers
                : friendship.users_friendships_requester_idTousers;

        return friend?.deleted === "NO";
    });
};

export const getFriendCount = async (userId: bigint): Promise<number> => {
    return prisma.friendships.count({
        where: {
            status: "accepted",
            deleted_at: null,
            OR: [
                {
                    requester_id: userId,
                },
                {
                    addressee_id: userId,
                },
            ],
        },
    });
};

export const getRelationshipWithUser = async (
    userId: bigint,
    otherUserId: bigint
) => {
    if (userId === otherUserId) {
        return null;
    }

    const friendship = await prisma.friendships.findUnique({
        where: {
            pair_key: createPairKey(userId, otherUserId),
        },
    });

    return friendship?.deleted_at ? null : friendship;
};

export const removeFriend = async (
    userId: bigint,
    friendshipId: bigint
) => {
    const friendship = await prisma.friendships.findUnique({
        where: { id: friendshipId },
    });

    if (!friendship || friendship.deleted_at) {
        return { success: false, reason: "FRIENDSHIP_NOT_FOUND" } as const;
    }

    const isMember =
        friendship.requester_id === userId ||
        friendship.addressee_id === userId;

    if (!isMember) {
        return { success: false, reason: "NOT_FRIENDSHIP_MEMBER" } as const;
    }

    if (friendship.status !== "accepted") {
        return { success: false, reason: "NOT_FRIENDS" } as const;
    }

    await prisma.friendships.update({
        where: { id: friendshipId },
        data: {
            deleted_at: new Date(),
            updated_at: new Date(),
        },
    });

    emitFriendshipChanged({
        friendshipId: friendship.id,
        requesterId: friendship.requester_id,
        addresseeId: friendship.addressee_id,
        action: "removed",
    });

    return { success: true } as const;
};
//Service chặn người dùng
export const blockUser = async (
    userId: bigint,
    targetUserId: bigint
) => {
    if (userId === targetUserId) {
        return {
            success: false,
            reason: "CANNOT_BLOCK_YOURSELF",
        } as const;
    }

    const targetUser = await prisma.users.findFirst({
        where: {
            id: targetUserId,
            deleted: "NO",
        },
        select: {
            id: true,
        },
    });

    if (!targetUser) {
        return {
            success: false,
            reason: "USER_NOT_FOUND",
        } as const;
    }

    const pairKey = createPairKey(userId, targetUserId);

    const existingFriendship =
        await prisma.friendships.findUnique({
            where: {
                pair_key: pairKey,
            },
        });

    // Khôi phục bản ghi đã xóa mềm thành một quan hệ chặn mới
    if (existingFriendship?.deleted_at) {
        const friendship = await prisma.friendships.update({
            where: { id: existingFriendship.id },
            data: {
                requester_id: userId,
                addressee_id: targetUserId,
                status: "blocked",
                blocked_by: userId,
                deleted_at: null,
                updated_at: new Date(),
            },
        });

        return { success: true, friendship } as const;
    }

    if (existingFriendship?.status === "blocked") {
        if (existingFriendship.blocked_by === userId) {
            return {
                success: false,
                reason: "ALREADY_BLOCKED",
            } as const;
        }

        return {
            success: false,
            reason: "BLOCKED_BY_OTHER_USER",
        } as const;
    }

    // Hai người đã từng có quan hệ: cập nhật bản ghi cũ
    if (existingFriendship) {
        const friendship = await prisma.friendships.update({
            where: {
                id: existingFriendship.id,
            },
            data: {
                status: "blocked",
                blocked_by: userId,
                deleted_at: null,
                updated_at: new Date(),
            },
        });

        return {
            success: true,
            friendship,
        } as const;
    }

    // Chưa từng có quan hệ: tạo bản ghi blocked mới
    const friendship = await prisma.friendships.create({
        data: {
            requester_id: userId,
            addressee_id: targetUserId,
            status: "blocked",
            blocked_by: userId,
            pair_key: pairKey,
        },
    });

    return {
        success: true,
        friendship,
    } as const;
};
//bỏ chặn người dùng
export const unblockUser = async (
    userId: bigint,
    targetUserId: bigint
) => {
    if (userId === targetUserId) {
        return {
            success: false,
            reason: "CANNOT_UNBLOCK_YOURSELF",
        } as const;
    }

    const pairKey = createPairKey(userId, targetUserId);

    const friendship =
        await prisma.friendships.findUnique({
            where: {
                pair_key: pairKey,
            },
        });

    if (
        !friendship ||
        friendship.deleted_at ||
        friendship.status !== "blocked"
    ) {
        return {
            success: false,
            reason: "USER_NOT_BLOCKED",
        } as const;
    }

    // Chỉ người đã tạo lệnh chặn mới được bỏ chặn
    if (friendship.blocked_by !== userId) {
        return {
            success: false,
            reason: "NOT_BLOCK_OWNER",
        } as const;
    }

    await prisma.friendships.update({
        where: {
            id: friendship.id,
        },
        data: {
            deleted_at: new Date(),
            updated_at: new Date(),
        },
    });

    return {
        success: true,
    } as const;
};

/* hàm lấy ứng viên phù hợp để gợi ý kết bạn */
export const getFriendSuggestionCandidates = async ({
    userId,
    limit = 20,
}: GetFriendSuggestionCandidatesInput) => {
    // 1. Song song lấy profile người dùng và quan hệ hiện tại
    const [currentProfile, relationships] = await Promise.all([
        prisma.profiles.findUnique({
            where: {
                user_id: userId,
            },
            select: {
                workplace: true,
                education: true,
                location: true,
            },
        }),
        prisma.friendships.findMany({
            where: {
                deleted_at: null,
                OR: [
                    { requester_id: userId },
                    { addressee_id: userId },
                ],
            },
            select: {
                requester_id: true,
                addressee_id: true,
                status: true,
            },
        }),
    ]);

    const excludedUserIds = new Set<bigint>([userId]);
    const currentFriendIds: bigint[] = [];

    for (const relationship of relationships) {
        excludedUserIds.add(relationship.requester_id);
        excludedUserIds.add(relationship.addressee_id);

        if (relationship.status === "accepted") {
            currentFriendIds.push(
                relationship.requester_id === userId
                    ? relationship.addressee_id
                    : relationship.requester_id
            );
        }
    }

    // 2. Tìm ứng viên có bạn chung (bạn của bạn bè) trực tiếp
    const mutualCountMap = new Map<bigint, number>();

    if (currentFriendIds.length > 0) {
        const friendsOfFriends = await prisma.friendships.findMany({
            where: {
                status: "accepted",
                deleted_at: null,
                OR: [
                    { requester_id: { in: currentFriendIds } },
                    { addressee_id: { in: currentFriendIds } },
                ],
            },
            select: {
                requester_id: true,
                addressee_id: true,
            },
            take: 200,
        });

        for (const rel of friendsOfFriends) {
            const otherId = currentFriendIds.includes(rel.requester_id)
                ? rel.addressee_id
                : rel.requester_id;

            if (!excludedUserIds.has(otherId)) {
                mutualCountMap.set(
                    otherId,
                    (mutualCountMap.get(otherId) ?? 0) + 1
                );
            }
        }
    }

    const mutualCandidateIds = Array.from(mutualCountMap.keys())
        .sort((a, b) => (mutualCountMap.get(b) ?? 0) - (mutualCountMap.get(a) ?? 0))
        .slice(0, limit * 2);

    const neededGeneralCount = Math.max(limit * 3 - mutualCandidateIds.length, 10);
    const allExcluded = new Set([...excludedUserIds, ...mutualCandidateIds]);

    type CandidateWithProfile = {
        id: bigint;
        user_name: string | null;
        first_name: string | null;
        last_name: string | null;
        avatar: string | null;
        profiles: {
            display_name: string;
            avatar_url: string | null;
            workplace: string | null;
            education: string | null;
            location: string | null;
        } | null;
    };

    let candidates: CandidateWithProfile[] = [];

    if (mutualCandidateIds.length === 0) {
        // Fast path: chưa có bạn bè, lấy ngay danh sách người dùng active gần nhất cùng profile
        candidates = await prisma.users.findMany({
            where: {
                id: { notIn: Array.from(allExcluded) },
                status: "active",
                deleted: "NO",
            },
            select: {
                id: true,
                user_name: true,
                first_name: true,
                last_name: true,
                avatar: true,
                profiles: {
                    select: {
                        display_name: true,
                        avatar_url: true,
                        workplace: true,
                        education: true,
                        location: true,
                    },
                },
            },
            orderBy: { id: "desc" },
            take: limit * 2,
        });
    } else {
        // Đã có bạn bè: kết hợp ứng viên có bạn chung và người dùng active mới nhất
        const recentCandidates = await prisma.users.findMany({
            where: {
                id: { notIn: Array.from(allExcluded) },
                status: "active",
                deleted: "NO",
            },
            select: { id: true },
            orderBy: { id: "desc" },
            take: neededGeneralCount,
        });

        const finalIds = [
            ...mutualCandidateIds,
            ...recentCandidates.map((c) => c.id),
        ];

        candidates = await prisma.users.findMany({
            where: { id: { in: finalIds } },
            select: {
                id: true,
                user_name: true,
                first_name: true,
                last_name: true,
                avatar: true,
                profiles: {
                    select: {
                        display_name: true,
                        avatar_url: true,
                        workplace: true,
                        education: true,
                        location: true,
                    },
                },
            },
        });
    }

    // 3. Tính điểm phù hợp
    const scoredCandidates = candidates.map((candidate) => {
        let matchScore = 0;
        const matchReasons: string[] = [];
        const mutualFriendCount =
            mutualCountMap.get(candidate.id) ?? 0;

        if (mutualFriendCount > 0) {
            matchScore += mutualFriendCount * 10;
            matchReasons.push(`${mutualFriendCount} bạn chung`);
        }

        if (
            isSameProfileValue(
                currentProfile?.location,
                candidate.profiles?.location
            )
        ) {
            matchScore += 5;
            matchReasons.push("Cùng địa điểm");
        }

        if (
            isSameProfileValue(
                currentProfile?.education,
                candidate.profiles?.education
            )
        ) {
            matchScore += 4;
            matchReasons.push("Cùng trường học");
        }

        if (
            isSameProfileValue(
                currentProfile?.workplace,
                candidate.profiles?.workplace
            )
        ) {
            matchScore += 4;
            matchReasons.push("Cùng nơi làm việc");
        }

        return {
            ...candidate,
            matchScore,
            matchReasons,
            mutualFriendCount,
        };
    });

    return scoredCandidates
        .sort((firstCandidate, secondCandidate) => {
            return (
                secondCandidate.matchScore -
                firstCandidate.matchScore
            );
        })
        .slice(0, limit);
};
