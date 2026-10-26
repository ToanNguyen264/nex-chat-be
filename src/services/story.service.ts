import prisma from "../configs/prisma";
import * as storageService from "./storage.service";
import { extractAcceptedFriendIds } from "./post/post-visibility";

type CreateStoryInput = {
    userId: bigint;
    file: {
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
    };
    content?: string | null;
};

export const createStory = async ({
    userId,
    file,
    content,
}: CreateStoryInput) => {
    // 1. Xác định loại media (image hoặc video)
    let mediaType = null;
    if (file.mimetype.startsWith("video/")) {
        mediaType = "video";
    } else if (file.mimetype.startsWith("image/")) {
        mediaType = "image";
    } else {
        mediaType = null;
    }

    if (!mediaType) {
        throw new Error("Chỉ hỗ trợ upload file hình ảnh hoặc video");
    }

    // 2. Upload file lên MinIO/S3
    const uploaded = await storageService.uploadStoryMedia(file);

    // 3. Tự động tính thời gian hết hạn sau 24 giờ
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 4. Lưu vào Database
    const story = await prisma.stories.create({ /* like insert into */
        data: {
            user_id: userId,
            media_url: uploaded.objectKey,
            media_type: mediaType,
            content: content ? content.trim() : null,
            expires_at: expiresAt,
        }
    });

    return {
        ...story,
        media_url: storageService.getPublicMediaUrl(story.media_url),
    };
};

export const getFeedStories = async (viewerId: bigint) => { /* ấy toàn bộ danh sách Story dành riêng cho user id truyền vào */
    const now = new Date();

    // 1. Lấy danh sách ID bạn bè
    const relationships = await prisma.friendships.findMany({
        where: {
            status: "accepted",
            deleted_at: null,
            OR: [
                { requester_id: viewerId },
                { addressee_id: viewerId },
            ],
        },
        select: {
            requester_id: true,
            addressee_id: true,
            status: true,       // Thêm 2 dòng này cho đủ để khi gọi extractAcceptedFriendIds không báo lỗi
            deleted_at: true,
        },
    });

    const friendIds = extractAcceptedFriendIds(viewerId, relationships); /* lấy danh sách ID bạn bè */

    const targetUserIds = [viewerId, ...friendIds];

    // 2. Lấy tất cả tin còn hạn 24 giờ
    const activeStories = await prisma.stories.findMany({
        where: {
            user_id: { in: targetUserIds },
            expires_at: { gt: now },
        },
        orderBy: {
            created_at: "asc",
        },
        include: {
            users: {
                select: {
                    id: true,
                    user_name: true,
                    first_name: true,
                    last_name: true,
                    avatar: true,
                },
            },
        },
    });

    // 3. Gom nhóm các tin theo từng người dùng
    // 3.1. Kiểu dữ liệu của 1 tin lẻ
    type StoryItem = {
        id: string;
        mediaUrl: string;
        mediaType: string;
        content: string | null;
        createdAt: string;
        expiresAt: string;
    };

    // 3.2. Kiểu dữ liệu của 1 người (kèm danh sách các tin của họ)
    type UserStoryGroup = {
        userId: string;
        userName: string | null;
        authorName: string;
        avatar: string | null;
        isOwn: boolean;
        stories: StoryItem[];
    };

    // Tạo một bảng tra cứu để gom nhóm theo userId
    const userStoriesMap = new Map<string, UserStoryGroup>();

    for (const story of activeStories) {
        const uId = story.user_id.toString();
        const fullName = [story.users.first_name, story.users.last_name]
            .filter(Boolean)
            .join(" ");

        if (!userStoriesMap.has(uId)) { /* has : có chứa */
            userStoriesMap.set(uId, {
                userId: uId,
                userName: story.users.user_name,
                authorName: fullName || story.users.user_name || "Người dùng",
                avatar: story.users.avatar,
                isOwn: story.user_id === viewerId,
                stories: [],
            });
        }

        userStoriesMap.get(uId)?.stories.push({ /* ? Nếu có thì hãy làm tiếp, còn nếu không có (null hoặc undefined) thì dừng lại, ĐỪNG làm sập chương trình */
            id: story.id.toString(),
            mediaUrl: storageService.getPublicMediaUrl(story.media_url),
            mediaType: story.media_type,
            content: story.content,
            createdAt: story.created_at?.toISOString() ?? new Date().toISOString(),
            expiresAt: story.expires_at.toISOString(),
        });
    }

    const result = Array.from(userStoriesMap.values());

    // Đưa story của chính người xem lên đầu tiên
    result.sort((a, b) => (b.isOwn ? 1 : 0) - (a.isOwn ? 1 : 0));

    return result;
};

export const deleteStory = async (storyId: bigint, userId: bigint) => {
    const story = await prisma.stories.findFirst({
        where: {
            id: storyId,
            user_id: userId,
        },
        select: {
            id: true,
            media_url: true,
        },
    });

    if (!story) {
        return null;
    }

    // Xóa file trên MinIO/S3
    await storageService.deleteStoryMedia(story.media_url);

    // Xóa dòng trong Database
    await prisma.stories.delete({
        where: { id: storyId },
    });

    return true;
};