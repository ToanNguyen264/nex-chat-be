# Feed Infinite Scroll and Realtime Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển Feed sang tải dần bằng cursor, giảm chi phí đếm reaction và đồng bộ `reactionCount` theo thời gian thực chỉ cho các client đang xem bài.

**Architecture:** MySQL/Prisma tiếp tục là nguồn dữ liệu chính xác; TanStack Query giữ các trang Feed; `IntersectionObserver` kích hoạt tải trang và theo dõi card; Socket.IO room `post:<id>` truyền reaction trực tiếp. BullMQ/Redis tiếp tục phục vụ thay đổi Feed tạo/sửa/xóa, không nằm trên đường realtime của reaction.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, React 19, TanStack Query 5, Zustand, Socket.IO, BullMQ, Redis.

**Spec:** `docs/feed-infinite-scroll-realtime-reactions-design.md`

## Global Constraints

- Không commit thay đổi.
- Không làm mất các thay đổi chưa commit hiện có.
- Mỗi trang mặc định 10 bài và backend tiếp tục giới hạn `limit` hiện có.
- Database là nguồn dữ liệu chính xác cuối cùng.
- Socket event không được ghi đè `currentReaction` của người xem; nó chỉ cập nhật `reactionCount` và `reactionSummary`.
- Backend phải xác minh quyền trước khi cho socket join room bài viết.
- Một socket theo dõi tối đa 50 post ID hợp lệ.
- Không phát reaction public tới toàn bộ user room.
- Không thêm Socket.IO Redis Adapter trong phiên bản này; ghi rõ đây là bước mở rộng khi chạy nhiều backend instance.
- Không giữ lại test case hoặc file test sau khi kiểm chứng, theo yêu cầu hiện tại của dự án.

## Review Focus

- Cursor cuối trang, request tải trùng và `hasNextPage = false` phải không tạo thêm request.
- Reaction event từ người A chỉ đổi tổng số và danh sách loại cảm xúc, không đổi reaction cá nhân của người B.
- ID sai và ID trùng phải được chuẩn hóa; payload chứa hơn 50 ID phải bị từ chối toàn bộ.
- Bài đổi quyền riêng tư hoặc bị xóa phải làm room cũ mất quyền nhận event.
- Reconnect phải join lại các bài còn nhìn thấy và lấy snapshot mới từ API.

---

### Task 1: Tối ưu dữ liệu reaction của một trang Feed

**Files:**
- Modify: `src/services/post.service.ts`
- Temporary test: `tests/post-reaction-aggregation.test.ts` (xóa sau khi kiểm chứng)

**Interfaces:**
- Consumes: `pagePosts: posts[]`, `viewerId: bigint`
- Produces: mỗi post có `reactionCount: number`, `reactionSummary: ReactionSummaryItem[]` và `currentReaction: reactions_reaction_type | null`

- [ ] **Step 1: Viết test tạm thời cho phép ánh xạ aggregate**

Kiểm tra bài không có reaction trả `0/[]/null`; bài có nhiều loại reaction trả đủ từng loại và tổng đúng; reaction của viewer được gắn đúng bài; summary được sắp xếp ổn định.

- [ ] **Step 2: Chạy test và xác nhận cách cũ chưa có helper aggregate độc lập**

Run: `npx tsx --test tests/post-reaction-aggregation.test.ts`

- [ ] **Step 3: Tách helper ánh xạ reaction summary có kiểu rõ ràng**

Helper nhận post IDs, kết quả `groupBy` và reaction của viewer; trả map theo `postId` để vòng lặp hydrate không dùng `.filter()` lặp lại.

- [ ] **Step 4: Thay `reactions.findMany` toàn bộ bằng hai query**

Dùng `prisma.reactions.groupBy({ by: ["target_id", "reaction_type"], ... _count })` cho summary và một `findMany` có `user_id: viewerId` cho `currentReaction`. `reactionCount` là tổng các count trong summary.

- [ ] **Step 5: Chạy test tạm thời và build backend**

Run: `npx tsx --test tests/post-reaction-aggregation.test.ts`

Run: `npm run build`

- [ ] **Step 6: Xóa file test tạm thời sau khi đã pass**

---

### Task 2: Tạo nền TanStack Query cho Feed phân trang

**Files:**
- Create: `nex-chat-fe/src/lib/query-client.ts`
- Create: `nex-chat-fe/src/features/feed/feed-query.ts`
- Modify: `nex-chat-fe/src/main.tsx`
- Modify: `nex-chat-fe/src/features/feed/Feed.tsx`
- Modify: `nex-chat-fe/src/features/feed/types.ts`
- Modify: `nex-chat-fe/src/api/post.api.ts`
- Temporary test: `nex-chat-fe/src/features/feed/feed-query.test.ts` (xóa sau khi kiểm chứng)

**Interfaces:**
- Produces: `queryClient: QueryClient`
- Produces: `feedQueryKeys.home()`, `feedQueryKeys.profile(ownerId)`
- Produces: `createFeedInfiniteQueryOptions(onlyUserId?: string)` với `initialPageParam: null`
- Produces: helper duyệt và cập nhật một post trong mọi page cache
- Produces: `ReactionSummaryItem = { reactionType: ReactionType; count: number }`

- [ ] **Step 1: Viết test tạm thời cho query key, cursor kế tiếp và cập nhật post trong nhiều page**

- [ ] **Step 2: Chạy test và xác nhận thất bại vì module chưa tồn tại**

Run: `npx tsx --test src/features/feed/feed-query.test.ts`

- [ ] **Step 3: Tạo QueryClient dùng chung và bọc App bằng `QueryClientProvider`**

- [ ] **Step 4: Tạo query options cho home/profile Feed**

`queryFn` gọi `getPosts` hoặc `getUserPosts`; `getNextPageParam` chỉ trả cursor khi còn trang.

- [ ] **Step 5: Chuyển tải dữ liệu trong `Feed.tsx` sang `useInfiniteQuery`**

Giữ nguyên chức năng tạo, sửa, xóa và reaction, nhưng thay cập nhật mảng `useState` bằng helper cập nhật cache.

- [ ] **Step 6: Chạy test tạm thời, ESLint file liên quan và build frontend**

Run: `npx tsx --test src/features/feed/feed-query.test.ts`

Run: `npx eslint src/main.tsx src/lib/query-client.ts src/features/feed/feed-query.ts src/features/feed/Feed.tsx`

Run: `npm run build`

- [ ] **Step 7: Xóa file test tạm thời sau khi đã pass**

---

### Task 3: Tự tải trang sau khi người dùng cuộn

**Files:**
- Create: `nex-chat-fe/src/features/feed/hooks/useInfiniteScroll.ts`
- Modify: `nex-chat-fe/src/features/feed/Feed.tsx`

**Interfaces:**
- Produces: `useInfiniteScroll({ enabled, onLoadMore, rootMargin }): RefObject<HTMLDivElement | null>`
- Consumes: `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`

- [ ] **Step 1: Viết một probe tạm cho trạng thái observer**

Xác minh callback không chạy khi disabled, đang tải hoặc sentinel chưa giao viewport.

- [ ] **Step 2: Tạo hook sở hữu vòng đời `IntersectionObserver`**

Observer dùng `rootMargin` để tải sớm trước khi người dùng chạm đáy và phải disconnect trong cleanup.

- [ ] **Step 3: Thay nút `Xem thêm` bằng sentinel và trạng thái tải/thử lại**

Nếu request lỗi, hiển thị nút thử lại thay vì tự lặp vô hạn.

- [ ] **Step 4: Chạy ESLint và build frontend**

Run: `npx eslint src/features/feed/hooks/useInfiniteScroll.ts src/features/feed/Feed.tsx`

Run: `npm run build`

---

### Task 4: Theo dõi những PostCard đang nằm trong viewport

**Files:**
- Create: `nex-chat-fe/src/features/feed/post-room.store.ts`
- Create: `nex-chat-fe/src/features/feed/hooks/usePostVisibility.ts`
- Modify: `nex-chat-fe/src/features/feed/components/PostCard.tsx`
- Temporary test: `nex-chat-fe/src/features/feed/post-room.store.test.ts` (xóa sau khi kiểm chứng)

**Interfaces:**
- Produces: `visiblePostIds: Set<string>`
- Produces: `setPostVisible(postId: string, visible: boolean): void`
- Produces: `resetVisiblePosts(): void`
- Produces: `usePostVisibility(postId: string)` trả ref gắn vào `<article>`

- [ ] **Step 1: Viết test tạm thời cho thêm, xóa, chống trùng và reset ID**

- [ ] **Step 2: Chạy test và xác nhận thất bại vì store chưa tồn tại**

- [ ] **Step 3: Tạo Zustand store với Set bất biến**

Mỗi action phải tạo `Set` mới để selector React nhận ra thay đổi.

- [ ] **Step 4: Tạo hook IntersectionObserver riêng cho PostCard**

Dùng vùng đệm nhỏ để đăng ký room trước khi card hoàn toàn xuất hiện và hủy đăng ký khi unmount.

- [ ] **Step 5: Gắn ref vào phần tử `<article>` của PostCard**

- [ ] **Step 6: Chạy test, lint và build rồi xóa test tạm thời**

---

### Task 5: Xác thực và quản lý Socket.IO room của bài viết

**Files:**
- Create: `src/services/post/post-room-access.service.ts`
- Create: `src/socket/post-room.handlers.ts`
- Modify: `src/socket/socket.ts`
- Temporary test: `tests/post-room-access.test.ts` (xóa sau khi kiểm chứng)

**Interfaces:**
- Produces: `getWatchablePostIds(userId: bigint, postIds: bigint[]): Promise<bigint[]>`
- Produces: `registerPostRoomHandlers(socket: Socket): void`
- Socket consumes: `post:watch` và `post:unwatch` với `{ postIds: string[] }`
- Room format: `post:<positiveId>`

- [ ] **Step 1: Viết test tạm cho owner, accepted friend, public, friends, private, deleted post và user không hợp lệ**

- [ ] **Step 2: Chạy test và xác nhận thất bại vì access service chưa tồn tại**

- [ ] **Step 3: Viết parser payload dùng chung**

Parser chỉ nhận ID nguyên dương, loại trùng và từ chối toàn bộ payload vượt giới hạn 50; không bao giờ nhận room name từ client.

- [ ] **Step 4: Cài đặt truy vấn quyền theo lô**

Không gọi `canViewPost` tuần tự 50 lần; lấy posts và quan hệ friendship cần thiết theo số query cố định.

- [ ] **Step 5: Đăng ký handler watch/unwatch trên mỗi socket đã xác thực**

`watch` chỉ join ID do access service trả về; `unwatch` chỉ leave room post hợp lệ.

- [ ] **Step 6: Chạy test, build backend rồi xóa test tạm thời**

---

### Task 6: Đồng bộ danh sách room từ frontend

**Files:**
- Modify: `nex-chat-fe/src/socket/SocketManager.tsx`
- Modify: `nex-chat-fe/src/features/feed/post-room.store.ts`

**Interfaces:**
- Consumes: `visiblePostIds`
- Emits: `post:watch { postIds }`, `post:unwatch { postIds }`

- [ ] **Step 1: Thêm effect debounce đồng bộ hiệu giữa tập room mong muốn và tập đã gửi**

- [ ] **Step 2: Khi connect/reconnect, xóa tập đã gửi và watch lại toàn bộ bài còn visible**

- [ ] **Step 3: Khi logout/disconnect chủ động, reset store và trạng thái đồng bộ**

- [ ] **Step 4: Chạy ESLint và build frontend**

---

### Task 7: Phát và nhận cập nhật reaction realtime

**Files:**
- Create: `src/services/post/post-reaction.types.ts`
- Modify: `src/socket/feed.events.ts` hoặc tạo `src/socket/post.events.ts`
- Modify: `src/controllers/post.controller.ts`
- Create: `nex-chat-fe/src/features/feed/post-reaction-realtime.ts`
- Modify: `nex-chat-fe/src/socket/SocketManager.tsx`
- Modify: `nex-chat-fe/src/features/feed/feed-query.ts`
- Modify: `nex-chat-fe/src/features/feed/components/PostCard.tsx`
- Temporary tests: parser/cache helper tương ứng ở BE và FE, xóa sau khi kiểm chứng

**Interfaces:**
- Produces event: `post:reaction-updated`
- Payload: `{ postId: string; reactionCount: number; reactionSummary: ReactionSummaryItem[]; occurredAt: string }`
- Produces FE parser: `parsePostReactionUpdatedPayload(value: unknown): PostReactionUpdatedPayload | null`
- Produces FE cache patch: chỉ đổi `reactionCount` và `reactionSummary` của post trùng ID

- [ ] **Step 1: Viết test tạm cho payload parser và cache patch nhiều page**

- [ ] **Step 2: Định nghĩa payload tối thiểu và emitter tới `post:<postId>`**

- [ ] **Step 3: Chỉ emit sau khi `setPostReaction` transaction thành công**

REST response vẫn trả `currentReaction`, `reactionCount` và `reactionSummary` cho actor.

- [ ] **Step 4: Nhận event trong SocketManager và patch tất cả query Feed chứa post**

Không invalidate/refetch Feed và không đụng đến `currentReaction`.

- [ ] **Step 5: Sửa khu vực tổng hợp cảm xúc trong PostCard**

Hiển thị một icon cho mọi loại có `count > 0`, sắp xếp theo count giảm dần và thứ tự cố định khi bằng nhau. Nút hành động phía dưới tiếp tục hiển thị `currentReaction`; khi người dùng chưa bày tỏ thì nút mới mặc định là `Thích`.

- [ ] **Step 6: Chạy test tạm, build BE/FE rồi xóa test tạm thời**

---

### Task 8: Thu hồi room khi bài đổi quyền hoặc bị xóa

**Files:**
- Modify: `src/socket/post-room.handlers.ts`
- Modify: `src/workers/post-feed.worker.ts`
- Modify: `src/services/post/post-feed.types.ts` nếu cần event kiểm tra lại quyền
- Modify: `nex-chat-fe/src/socket/SocketManager.tsx`

**Interfaces:**
- Produces: tín hiệu `post:access-invalidated { postId }`
- Produces: server operation loại socket khỏi `post:<postId>` sau khi báo invalidation

- [ ] **Step 1: Phát invalidation cho action `updated` và `deleted` trước khi đóng room cũ**

- [ ] **Step 2: Frontend nhận invalidation, refetch/invalidate Feed phù hợp và để card còn tồn tại đăng ký lại**

- [ ] **Step 3: Backend xác minh lại quyền khi client watch lại**

- [ ] **Step 4: Kiểm tra bài private/deleted không tiếp tục nhận reaction event**

- [ ] **Step 5: Chạy build backend và frontend**

---

### Task 9: Đồng bộ Feed realtime với cache mới và kiểm tra toàn luồng

**Files:**
- Modify: `nex-chat-fe/src/features/feed/feed-realtime.store.ts` hoặc loại bỏ nếu không còn cần
- Modify: `nex-chat-fe/src/features/feed/feed-realtime.ts`
- Modify: `nex-chat-fe/src/socket/SocketManager.tsx`
- Modify: `nex-chat-fe/src/features/feed/Feed.tsx`
- Modify: `docs/feed-infinite-scroll-realtime-reactions-design.md` nếu triển khai thực tế khác thiết kế

**Interfaces:**
- `feed:changed` cập nhật/invalidate cache Feed; không điều khiển reaction realtime
- Reconnect khôi phục snapshot Feed và post rooms

- [ ] **Step 1: Chuyển cơ chế revision/refetch thủ công sang cache trang đầu**

Khi nhận `feed:changed`, loại các page cũ khỏi query tương ứng, giữ/tải lại đúng trang đầu và cho phép infinite scroll lấy lại trang sau bằng cursor mới. `deleted` được loại khỏi cache ngay theo `postId`. Không để một event reaction refetch Feed; không để event profile không liên quan làm home/profile fetch sai.

- [ ] **Step 2: Kiểm tra thủ công hai tài khoản**

Các case: tải 10 bài đầu, cuộn tải tiếp, bấm reaction đồng bộ hai máy, currentReaction độc lập, friends/private, sửa privacy, xóa bài và reconnect.

- [ ] **Step 3: Chạy kiểm tra cuối**

BE: `npm run build`

FE: `npm run lint`

FE: `npm run build`

- [ ] **Step 4: Kiểm tra `git diff` và xác nhận không có test/file tạm, không có commit**
