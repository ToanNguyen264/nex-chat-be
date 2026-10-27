import prisma from "../configs/prisma";
import { tagTrie, type TagSuggestion } from "../utils/trie";

/**
 * 1. Khởi tạo cây Trie khi Server bật lên (Chiến lược - Nạp sẵn Top tag hot)
 */
export const initTagTrie = async (): Promise<void> => {
    try {
        // Chỉ lấy 1.000 tag phổ biến nhất để server khởi động siêu nhẹ
        const popularTags = await prisma.tags.findMany({
            where: {
                is_deleted: "No",
                post_count: { gt: 0 },
            },
            orderBy: {
                post_count: "desc",
            },
            take: 1000,
            select: {
                name: true,
                post_count: true,
            },
        });

        // Nạp từng tag vào Cây Trie trên RAM
        for (const tag of popularTags) {
            tagTrie.insert(tag.name, tag.post_count);
        }

        console.log(`[TagService] Đã nạp sẵn ${popularTags.length} tag hot vào Cây Trie.`);
    } catch (error) {
        console.error("[TagService] Lỗi khi nạp tag vào Trie:", error);
    }
};

/**
 * 2. Gợi ý Hashtag theo Chiến lược Cache-Aside (Hỏi RAM trước -> Thiếu thì query MySQL -> Tự nạp bù vào RAM)
 */
export const suggestTags = async (query: string, limit: number = 5): Promise<TagSuggestion[]> => {
    const cleanQuery = query.trim().toLowerCase().replace(/^#+/, ""); /* xóa đi dấu # */
    if (!cleanQuery) return [];

    // BƯỚC 1: Hỏi Cây Trie trên RAM trước
    const ramSuggestions = tagTrie.searchPrefix(cleanQuery, limit);

    // Nếu trên RAM đã có đủ kết quả theo limit yêu cầu -> Trả về luôn
    if (ramSuggestions.length >= limit) {
        return ramSuggestions;
    }

    // BƯỚC 2 (Cache Miss): Nếu trên RAM chưa có hoặc chưa đủ kết quả -> Query bù từ MySQL
    try {
        const dbTags = await prisma.tags.findMany({
            where: {
                name: {
                    startsWith: cleanQuery,
                },
                is_deleted: "No",
            },
            orderBy: {
                post_count: "desc",
            },
            take: limit,
            select: {
                name: true,
                post_count: true,
            },
        });

        // BƯỚC 3: Nạp bù các tag vừa tìm được từ MySQL vào Cây Trie để lần sau có sẵn trên RAM
        for (const tag of dbTags) {
            tagTrie.insert(tag.name, tag.post_count);
        }

        // BƯỚC 4: Lấy lại từ Cây Trie sau khi đã nạp bù
        return tagTrie.searchPrefix(cleanQuery, limit);
    } catch (error) {
        console.error("[TagService] Lỗi khi tìm kiếm tag trong DB:", error);
        return ramSuggestions;
    }
};

/**
 * 3. Tự động bóc tách các hashtag trong nội dung văn bản bài viết
 * Ví dụ: "Hôm nay đi biển #dulich #phuot thật vui" -> ['dulich', 'phuot']
 */
export const extractHashtags = (content: string): string[] => {
    if (!content) return [];

    const hashtagRegex = /#([\p{L}\p{N}_]+)/gu; /* nhận diện từ có dấu # phía trước có hỗ trợ VI */
    const matches = content.matchAll(hashtagRegex); /*Quét toàn bộ văn bản bài viết để gom tất cả các từ có gắn # lại */
    const tagsSet = new Set<string>(); /* tập hợp chứa các giá trị k trùng nhau {'dulich', 'phuot'} */

    for (const match of matches) {
        if (!match[1]) continue;
        const tag = match[1].toLowerCase().trim();
        if (tag.length >= 2 && tag.length <= 50) {
            tagsSet.add(tag);
        }
    }

    return Array.from(tagsSet);
};

/**
 * 4. Xử lý lưu Tag khi người dùng đăng bài viết:
 * - Lưu vào bảng `tags` (nếu chưa có thì tạo mới, nếu có rồi thì tăng số lượng post_count)
 * - Nối vào bảng `post_tags`
 * - Cập nhật điểm gu sở thích cho tác giả trong bảng `user_interests`
 * - Cập nhật vào Cây Trie trên RAM
 */
export const attachTagsToPost = async (
    postId: bigint,
    userId: bigint,
    tagNames: string[]
): Promise<void> => {
    if (!tagNames || tagNames.length === 0) return;

    for (const name of tagNames) {
        try {
            // Bọc toàn bộ quá trình vào một Transaction 1 là done 2 là lỗi
            // 1. Transaction chạy xong sẽ RETURN kết quả tagRecord ra ngoài
            const savedTag = await prisma.$transaction(async (tx) => {
                // A. Tạo hoặc lấy tag
                const tagRecord = await tx.tags.upsert({
                    where: { name },
                    create: { name, post_count: 1, is_deleted: "No" },
                    update: { post_count: { increment: 1 }, is_deleted: "No" },
                });
                // B. Chạy song song cả post_tags và user_interests
                await Promise.all([
                    tx.post_tags.upsert({
                        where: {
                            post_id_tag_id: { post_id: postId, tag_id: tagRecord.id },
                        },
                        create: { post_id: postId, tag_id: tagRecord.id, is_deleted: "No" },
                        update: { is_deleted: "No" },
                    }),
                    tx.user_interests.upsert({
                        where: {
                            user_id_tag_id: { user_id: userId, tag_id: tagRecord.id },
                        },
                        create: { user_id: userId, tag_id: tagRecord.id, score: 1, is_deleted: "No" },
                        update: { score: { increment: 1 }, is_deleted: "No" },
                    }),
                ]);
                // Trả biến tagRecord ra ngoài cho savedTag hứng lấy
                return tagRecord;
            });

            // Cập nhật cây Trie trên RAM
            tagTrie.insert(savedTag.name, savedTag.post_count);
        } catch (error) {
            console.error(`[TagService] Lỗi khi gắn tag "${name}" vào bài viết:`, error);
        }
    }
};