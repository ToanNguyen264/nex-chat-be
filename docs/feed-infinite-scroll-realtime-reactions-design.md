# Thiết kế Feed tải dần và đồng bộ cảm xúc thời gian thực

## 1. Mục tiêu

Hệ thống chỉ tải một nhóm nhỏ bài viết mới nhất khi người dùng mở Feed. Khi người dùng cuộn gần cuối danh sách, frontend mới tải trang tiếp theo. Các bài đang xuất hiện trên màn hình sẽ nhận cập nhật tổng số cảm xúc theo thời gian thực mà không tải lại toàn bộ Feed.

Thiết kế phải bảo đảm:

- Không đọc toàn bộ bảng `posts` hoặc toàn bộ reaction của một bài lên bộ nhớ ứng dụng.
- Không phát một reaction công khai đến mọi người dùng trong hệ thống.
- Quyền `public`, `friends`, `private` luôn được backend kiểm tra.
- Database là nguồn dữ liệu chính xác cuối cùng.
- Redis, BullMQ và Socket.IO được dùng đúng loại công việc của chúng.
- Người dùng mất kết nối rồi kết nối lại vẫn nhận được trạng thái đúng qua REST API.

## 2. Trạng thái hiện tại

Backend đã có cursor pagination:

```text
GET /api/posts?cursor=<postId>&limit=10
GET /api/posts/users/:userId?cursor=<postId>&limit=10
```

Mỗi lần backend lấy `limit + 1` bài để xác định còn trang sau hay không. Cách này đã tránh đọc toàn bộ bảng `posts`.

Frontend hiện vẫn:

- Quản lý `posts`, `nextCursor`, `hasNextPage` bằng nhiều `useState`.
- Yêu cầu người dùng nhấn nút `Xem thêm`.
- Tải lại trang đầu khi nhận `feed:changed`.

Backend hiện lấy tất cả các dòng reaction thuộc các bài trong một trang, sau đó dùng JavaScript để đếm. Nếu một bài có rất nhiều reaction thì lượng dữ liệu truyền từ MySQL sang Node.js sẽ tăng không cần thiết.

## 3. Kiến trúc được chọn

Thiết kế dùng bốn thành phần, mỗi thành phần có một trách nhiệm riêng:

| Thành phần | Trách nhiệm |
| --- | --- |
| MySQL + Prisma | Lưu bài viết, quyền riêng tư và reaction; trả snapshot chính xác |
| TanStack Query | Quản lý các trang Feed, cursor, cache và trạng thái tải ở frontend |
| Socket.IO room `post:<id>` | Đồng bộ reaction có độ trễ thấp cho người đang xem bài |
| BullMQ + Redis | Tiếp tục xử lý sự kiện Feed tạo/sửa/xóa và các tác vụ nền có retry |

Reaction không đi qua BullMQ trên đường cập nhật giao diện. Đây là thao tác tần suất cao và người dùng cần nhìn thấy kết quả ngay. Đưa từng reaction vào hàng đợi sẽ tăng độ trễ và số job trong Redis mà không đem lại lợi ích cho giao diện.

BullMQ vẫn phù hợp với công việc không cần phản hồi tức thời, ví dụ:

- Phát tín hiệu Feed thay đổi sau khi tạo, sửa hoặc xóa bài.
- Tạo thông báo “A đã bày tỏ cảm xúc với bài của bạn”.
- Ghi analytics hoặc tổng hợp dữ liệu nền trong tương lai.

## 4. Luồng tải Feed

```text
Người dùng mở Feed
    -> useInfiniteQuery gọi trang đầu với limit = 10
    -> Backend kiểm tra quyền và lấy tối đa 11 bản ghi
    -> Backend trả 10 bài + nextCursor + hasNextPage
    -> Frontend render 10 bài
    -> IntersectionObserver quan sát sentinel ở cuối danh sách
    -> Người dùng cuộn gần sentinel
    -> fetchNextPage(nextCursor)
    -> TanStack Query ghép trang mới vào cache
    -> Lặp lại cho đến khi hasNextPage = false
```

Cursor tiếp tục dùng `posts.id` giảm dần. Không chuyển sang offset pagination vì offset càng lớn thì database càng phải bỏ qua nhiều dòng, đồng thời dễ bị trùng hoặc hụt bài khi có bài mới được tạo trong lúc người dùng đang cuộn.

### Quy tắc tải

- Kích thước mặc định của một trang là 10 bài.
- Chỉ gọi trang sau khi có `nextCursor` và `hasNextPage = true`.
- Không gửi hai request tải trang sau cùng lúc.
- Nếu tải trang sau thất bại, giữ nguyên các trang đã có và hiển thị nút thử lại.
- Khi không còn trang sau, ngừng quan sát sentinel.
- Bản đầu chưa triển khai DOM virtualization; đây là tối ưu tiếp theo khi một phiên có thể giữ hàng trăm bài.

## 5. Tối ưu truy vấn reaction

Với danh sách `postIds` của đúng một trang, backend chạy hai truy vấn nhỏ:

1. `groupBy target_id, reaction_type` để lấy số lượng của mọi loại cảm xúc trên từng bài ngay trong MySQL.
2. Lấy reaction của riêng `viewerId` trên các bài đó để xác định `currentReaction`.

```text
Trang có 10 bài
    -> MySQL đếm theo target_id + reaction_type
    -> Kết quả tối đa 60 dòng tổng hợp (10 bài x 6 loại)
    -> MySQL lấy reaction của người đang xem
    -> Kết quả tối đa 10 dòng
```

Ví dụ bài số 25 có 100.000 reaction:

- Cách cũ có thể chuyển 100.000 dòng reaction từ MySQL sang Node.js chỉ để đếm.
- Cách mới để MySQL thực hiện `COUNT`, Node.js chỉ nhận tối đa sáu dòng tổng hợp của bài, ví dụ `{ target_id: 25, reaction_type: "love", count: 60000 }`.

Mỗi bài trả ba trường độc lập:

```ts
type ReactionSummaryItem = {
    reactionType: "like" | "love" | "haha" | "wow" | "sad" | "angry";
    count: number;
};

type PostReactionState = {
    currentReaction: ReactionType | null;
    reactionCount: number;
    reactionSummary: ReactionSummaryItem[];
};
```

- `currentReaction` là cảm xúc của riêng người đang xem và chỉ điều khiển nút hành động phía dưới.
- `reactionSummary` chứa mọi loại cảm xúc thực sự đã xuất hiện trên bài. Mỗi loại chỉ có một icon và kèm số lượng.
- `reactionCount` là tổng `count` của toàn bộ phần tử trong `reactionSummary`.

Ví dụ một bài có ba Love, hai Haha và một Like sẽ hiển thị các icon `❤️ 😂 👍` cùng dòng `6 lượt bày tỏ cảm xúc`. Không dùng `currentReaction` và không fallback về Like để chọn icon cho khu vực tổng hợp.

Các phần tử summary được sắp xếp theo `count` giảm dần; nếu bằng nhau thì dùng thứ tự cố định `like, love, haha, wow, sad, angry` để giao diện không đổi vị trí ngẫu nhiên giữa các lần render. Vì hệ thống chỉ có sáu loại, giao diện hiển thị đủ mọi loại đã xuất hiện.

Index hiện có `@@index([target_type, target_id])` phục vụ bộ lọc và phép nhóm này. Unique index `(user_id, target_type, target_id)` bảo đảm mỗi người chỉ có một reaction trên một bài.

## 6. Luồng theo dõi bài đang hiển thị

Mỗi `PostCard` dùng `IntersectionObserver` để xác định bài có đang nằm trong vùng nhìn thấy hay không.

```text
PostCard đi vào vùng nhìn thấy
    -> Frontend thêm postId vào tập visiblePostIds
    -> Gửi post:watch theo lô
    -> Backend xác thực user có quyền xem từng bài
    -> Socket được join room post:<postId>

PostCard rời vùng nhìn thấy
    -> Frontend xóa postId khỏi visiblePostIds
    -> Gửi post:unwatch theo lô
    -> Socket rời room post:<postId>
```

Frontend debounce thay đổi danh sách trong một khoảng ngắn để nhiều card xuất hiện cùng lúc chỉ tạo một lần gửi socket, thay vì một event cho mỗi card.

Backend áp dụng các giới hạn:

- Payload chỉ nhận một mảng ID nguyên dương, không nhận tên room do client tự tạo.
- Loại bỏ ID trùng.
- Giới hạn tối đa 50 bài đang theo dõi trên một socket.
- `post:watch` phải kiểm tra quyền xem theo lô trước khi `join`.
- `post:unwatch` chỉ cho phép rời các room có dạng `post:<id>`.
- Khi socket disconnect, Socket.IO tự loại socket khỏi toàn bộ room.

### Ý nghĩa của quyền riêng tư

- `public`: người đã được phép lấy bài qua API có thể theo dõi room của bài đó.
- `friends`: chỉ chủ bài và bạn bè có trạng thái `accepted` được theo dõi.
- `private`: chỉ chủ bài được theo dõi.

`public` không có nghĩa backend phát event đến room của tất cả user. Event chỉ được gửi tới `post:<id>`, tức những socket đang xem bài đó và đã qua kiểm tra quyền.

## 7. Luồng cập nhật reaction

```text
Người A bấm Love ở bài 25
    -> POST /api/posts/25/reaction
    -> Backend kiểm tra A có quyền xem bài
    -> Transaction tạo/sửa/xóa reaction
    -> Transaction GROUP BY lấy reaction summary mới
    -> REST trả currentReaction + reactionCount + reactionSummary cho A
    -> Sau khi transaction thành công, backend emit post:reaction-updated
       tới room post:25
    -> Các client đang xem bài 25 cập nhật reactionCount trong cache
```

Payload realtime tối thiểu:

```ts
type PostReactionUpdatedPayload = {
    postId: string;
    reactionCount: number;
    reactionSummary: ReactionSummaryItem[];
    occurredAt: string;
};
```

Event realtime không mang `currentReaction`, vì giá trị đó khác nhau theo từng người xem. Nó mang `reactionSummary` vì đây là dữ liệu tổng hợp chung của bài. Chỉ response REST của chính thao tác bấm reaction được phép cập nhật `currentReaction` của người thực hiện.

Quy tắc cập nhật cache:

- Response REST cập nhật `currentReaction`, `reactionCount` và `reactionSummary` của người bấm.
- Socket event chỉ cập nhật `reactionCount` và `reactionSummary` ở mọi trang cache có chứa `postId`.
- Không refetch toàn bộ Feed cho một reaction.
- Nếu cache không chứa `postId`, bỏ qua event.

## 8. Feed realtime và reaction realtime là hai luồng khác nhau

### Tạo, sửa, xóa bài

```text
MySQL commit
    -> BullMQ job
    -> Redis giữ job
    -> Worker tìm audience
    -> feed:changed tới user:<id>
    -> Frontend invalidate/refetch trang đầu phù hợp
```

Đây là công việc phù hợp với BullMQ vì có thể retry và chậm vài trăm mili giây mà không ảnh hưởng thao tác trực tiếp của người dùng.

### Thả cảm xúc

```text
MySQL transaction commit
    -> Socket.IO emit trực tiếp tới post:<id>
    -> Patch reactionCount trong cache
```

Đây là đường truyền ngắn để giảm độ trễ và không tạo một job Redis cho mỗi lần bấm.

## 9. TanStack Query và cấu trúc cache

Frontend tạo query key ổn định:

```ts
["feed", "home"]
["feed", "profile", ownerId]
```

Mỗi query lưu nhiều page:

```ts
type FeedPage = {
    posts: PostFromApi[];
    pagination: {
        nextCursor: string | null;
        hasNextPage: boolean;
    };
};
```

`getNextPageParam` trả `nextCursor` khi `hasNextPage` là `true`; nếu không thì trả `undefined`.

Create, edit, delete và reaction dùng `queryClient.setQueryData` để cập nhật đúng bài trong cache. `feed:changed` dùng invalidate/refetch trang đầu theo query phù hợp, còn `post:reaction-updated` chỉ patch `reactionCount`.

## 10. Mất kết nối và nhiều instance backend

Socket event là tín hiệu thời gian thực, không phải nguồn dữ liệu vĩnh viễn. Nếu client offline trong lúc reaction thay đổi, lần fetch REST tiếp theo sẽ trả tổng đúng từ MySQL.

Khi socket reconnect:

1. Frontend gửi lại danh sách `visiblePostIds` để join lại room.
2. Frontend invalidate các query Feed đang hoạt động để lấy snapshot mới nhất.

Ở cấu hình một backend instance, Socket.IO room trong bộ nhớ là đủ. Khi chạy nhiều backend instance, phải thêm Socket.IO Redis Adapter:

```text
Backend A emit post:reaction-updated
    -> Redis Pub/Sub
    -> Backend B nhận event
    -> Socket đang nối vào Backend B nhận cập nhật
```

Redis dùng cho Socket.IO adapter là Pub/Sub; BullMQ dùng Redis làm kho trạng thái job. Cả hai có thể dùng cùng máy Redis ở quy mô học tập, nhưng cần namespace/prefix rõ ràng và nên tách khi tải lớn.

## 11. Xử lý lỗi và tính nhất quán

- Chỉ emit reaction sau khi transaction MySQL thành công.
- Nếu emit socket thất bại, REST vẫn thành công vì dữ liệu đã được lưu; client sẽ tự sửa khi refetch/reconnect.
- Không cập nhật UI theo socket trước khi database commit.
- Frontend chặn bấm reaction lặp trong lúc request hiện tại chưa xong.
- Payload socket sai kiểu hoặc `postId` không tồn tại bị bỏ qua.
- Backend không tin danh sách room do client gửi và luôn tự tạo tên room từ ID đã kiểm tra.
- Khi bài đổi từ `public/friends` sang `private` hoặc bị xóa, `feed:changed` làm client refetch; backend cũng phải loại các socket không còn quyền khỏi room của bài để ngăn nhận event tiếp theo.

## 12. Các bước triển khai dự kiến

1. Tối ưu truy vấn reaction bằng aggregate trong database.
2. Cài `QueryClientProvider` và chuyển Feed sang `useInfiniteQuery`.
3. Thêm sentinel với `IntersectionObserver` để tự tải trang sau.
4. Tạo store quản lý tập `visiblePostIds` và gửi watch/unwatch theo lô.
5. Thêm handler Socket.IO phía backend để xác thực và join/leave room bài viết.
6. Emit `post:reaction-updated` sau transaction reaction.
7. Patch TanStack Query cache khi frontend nhận event.
8. Rejoin room và refetch snapshot khi reconnect.
9. Kiểm tra build, quyền riêng tư, tải trang, reaction đồng thời và reconnect.

## 13. Tiêu chí hoàn thành

- Mở Feed chỉ tải 10 bài đầu.
- Cuộn gần cuối tự tải đúng trang tiếp theo và không tạo request trùng.
- Không xuất hiện bài trùng hoặc mất bài do cursor pagination.
- Backend không tải toàn bộ reaction rows chỉ để đếm.
- Hai tài khoản cùng nhìn một bài thấy `reactionCount` và toàn bộ icon trong `reactionSummary` thay đổi gần như ngay lập tức.
- `currentReaction` của người B không bị event của người A ghi đè.
- Khu vực tổng hợp hiển thị đủ mọi loại cảm xúc đã xuất hiện, không mặc định Like và không lấy icon từ `currentReaction`.
- Người không có quyền không thể join room của bài `friends` hoặc `private`.
- Reaction của một bài không làm refetch toàn bộ Feed.
- Reconnect khôi phục room đang xem và đồng bộ lại snapshot.
- Build TypeScript của cả backend và frontend thành công.

## 14. Ngoài phạm vi phiên bản đầu

- Virtualization cho danh sách hàng trăm hoặc hàng nghìn card.
- Fan-out toàn bộ bài public đến mọi tài khoản.
- Lưu reaction count thành một cột counter riêng trong bảng `posts`.
- Exactly-once delivery cho socket event.
- Analytics reaction và notification reaction qua BullMQ.
- Triển khai Socket.IO Redis Adapter trước khi hệ thống thực sự chạy nhiều backend instance.

## 15. Kiến thức cần nắm

### Cursor pagination

Dùng ID cuối trang làm mốc lấy trang sau. Nó ổn định hơn offset khi dữ liệu liên tục có bản ghi mới và hiệu quả hơn ở trang sâu.

### Infinite query

`useInfiniteQuery` lưu từng page trong một cache chung, biết cursor của trang sau và chống các request trùng. Nó không tự đọc hết dữ liệu; chỉ tải khi ứng dụng gọi `fetchNextPage`.

### IntersectionObserver

Trình duyệt thông báo khi một phần tử đi vào hoặc rời viewport. Ta dùng nó cho hai việc: quan sát sentinel để tải trang sau và quan sát `PostCard` để chỉ đăng ký realtime cho bài đang được xem.

### Database aggregation

`COUNT` và `GROUP BY` chạy gần dữ liệu trong MySQL. Node.js chỉ nhận kết quả tổng hợp nhỏ thay vì hàng nghìn dòng thô.

### Socket.IO room

Room là nhóm socket tạm thời ở server. Emit vào `post:25` chỉ gửi cho các socket đã join room đó; room không phải bảng database và tự mất khi process dừng.

### Redis, BullMQ và Pub/Sub

- Redis là kho dữ liệu trong bộ nhớ được BullMQ và adapter sử dụng.
- BullMQ quản lý job bền hơn, delay, retry và worker.
- Redis Pub/Sub giúp nhiều Socket.IO server chuyển tiếp event cho nhau nhưng không lưu lịch sử để client offline đọc lại.

### Snapshot và event

REST trả snapshot đầy đủ, có kiểm tra quyền và dùng để phục hồi trạng thái. Socket chỉ gửi event nhỏ để UI thay đổi nhanh. Khi hai nguồn khác nhau, snapshot từ database là nguồn đáng tin cậy cuối cùng.
