# Realtime Feed với BullMQ, Redis và Socket.IO

## 1. Mục tiêu

Khi một người tạo, sửa hoặc xóa bài viết, những người bạn đang online nhìn thấy Feed thay đổi gần như ngay lập tức mà không phải tải lại trang.

Hệ thống sử dụng mô hình hybrid:

- Database là nguồn dữ liệu chính xác cuối cùng.
- BullMQ và Redis xử lý công việc nền, retry khi có lỗi tạm thời.
- Socket.IO chỉ gửi tín hiệu rằng Feed đã thay đổi.
- REST API tải lại dữ liệu đã được backend kiểm tra quyền.
- Người dùng offline không nhận lại từng sự kiện cũ; khi online lại, frontend tải trạng thái Feed mới nhất từ database.

## 2. Phạm vi

Hỗ trợ ba hành động:

```text
created  → một bài viết mới được tạo
updated  → nội dung hoặc quyền riêng tư thay đổi
deleted  → bài viết bị xóa mềm
```

Không lưu lịch sử mọi lần sửa để phát lại cho người offline. Không gửi toàn bộ nội dung bài viết qua Redis hoặc Socket.IO.

## 3. Kiến trúc

```text
HTTP request
    ↓
Controller
    ↓
Post service cập nhật MySQL
    ↓
Thêm một job post-feed-changed vào BullMQ
    ↓
Redis lưu trạng thái job
    ↓
Feed worker nhận job
    ↓
Worker tìm danh sách bạn bè accepted của chủ bài viết
    ↓
Socket.IO phát feed:changed đến các room user:<id>
    ↓
SocketManager của frontend nhận sự kiện
    ↓
Feed debounce các thay đổi gần nhau
    ↓
GET /api/posts hoặc GET /api/posts/users/:userId
    ↓
Backend kiểm tra quyền và trả Feed mới nhất
    ↓
React thay state và render lại
```

## 4. Dữ liệu của BullMQ job

Một lần thay đổi bài viết tạo đúng một job, không tạo một job cho từng người bạn.

```ts
type PostFeedJobData = {
    eventId: string;
    action: "created" | "updated" | "deleted";
    postId: string;
    ownerId: string;
    privacy: "public" | "friends" | "private";
};
```

Ý nghĩa:

- `eventId`: định danh duy nhất để chống trùng và theo dõi log.
- `action`: loại thay đổi.
- `postId`: bài viết gây ra thay đổi.
- `ownerId`: chủ bài viết, dùng để tìm bạn bè.
- `privacy`: giúp worker bỏ qua việc thông báo bạn bè khi tạo một bài private.

BigInt được chuyển thành string vì dữ liệu job phải được tuần tự hóa để lưu trong Redis.

## 5. Quy tắc người nhận

### Khi tạo bài

- `private`: chỉ gửi cho room của chủ bài viết để đồng bộ các tab khác.
- `friends` hoặc `public`: gửi cho chủ bài viết và toàn bộ bạn bè có trạng thái `accepted`.

Feed hiện tại chỉ hiển thị bài của chính người dùng và bạn bè, vì vậy bài `public` không được broadcast cho toàn hệ thống.

### Khi sửa bài

Gửi tín hiệu cho chủ bài viết và toàn bộ bạn bè `accepted`, kể cả khi privacy mới là `private`.

Lý do: nếu bài từng là `friends` rồi đổi thành `private`, Feed của bạn bè phải tải lại để xóa bài khỏi màn hình.

### Khi xóa bài

Gửi tín hiệu cho chủ bài viết và toàn bộ bạn bè `accepted` để những client đang hiển thị bài có thể loại bỏ nó.

## 6. Socket event

Worker chỉ phát tín hiệu nhỏ:

```ts
type FeedChangedPayload = {
    eventId: string;
    action: "created" | "updated" | "deleted";
    postId: string;
    ownerId: string;
    occurredAt: string;
};
```

Socket không gửi nội dung, ảnh hoặc thông tin riêng tư của bài viết. Sau khi nhận tín hiệu, client gọi REST API; backend quyết định client còn quyền xem dữ liệu nào.

## 7. Vòng đời tạo bài

```text
A gửi POST /api/posts
→ MySQL lưu bài thành công
→ Backend thử thêm job action=created vào BullMQ
→ Nếu Redis lỗi, backend ghi log nhưng không đảo ngược bài đã lưu
→ Backend trả kết quả cho A
→ Redis giữ job ở trạng thái waiting
→ Worker lấy job
→ Worker tìm bạn bè accepted của A
→ Worker emit feed:changed
→ B đang online nhận tín hiệu
→ Feed của B gọi GET /api/posts
→ Backend lọc theo quan hệ bạn bè và privacy
→ B nhận danh sách mới và React render bài của A
```

## 8. Vòng đời sửa quyền riêng tư

Ví dụ bài đang là `friends`, sau đó A đổi thành `private`:

```text
A gửi PATCH /api/posts/:id
→ MySQL cập nhật privacy=private
→ BullMQ nhận job action=updated
→ Worker vẫn báo cho các bạn bè của A
→ B nhận feed:changed và tải lại Feed
→ Backend không trả bài private cho B
→ React thay state và bài biến mất khỏi Feed của B
```

Frontend không tự đoán quyền truy cập. Backend luôn quyết định dữ liệu được trả về.

## 9. Vòng đời xóa bài

```text
A gửi DELETE /api/posts/:id
→ Backend đặt deleted_at
→ BullMQ nhận job action=deleted
→ Worker báo cho các bạn bè của A
→ B tải lại Feed
→ Query deleted_at=null loại bài đã xóa
→ React không còn render bài đó
```

## 10. Người dùng offline và reconnect

Socket.IO không giữ sự kiện `feed:changed` cho người offline.

```text
B offline
→ Các thay đổi vẫn được lưu chính xác trong MySQL
→ Socket event có thể không đến B
→ B online lại
→ SocketManager nhận connect lại
→ Feed được đánh dấu cần đồng bộ
→ Frontend gọi API lấy trạng thái mới nhất
```

Cách này tránh phát lại hàng trăm sự kiện cũ không còn ý nghĩa.

## 11. Debounce và chống quá tải

Nếu nhiều bài thay đổi gần nhau, frontend không gọi API cho từng Socket event. Nó debounce trong một khoảng ngắn rồi chỉ tải Feed một lần.

```text
event 1 ─┐
event 2 ─┼→ debounce → một request GET /api/posts
event 3 ─┘
```

Backend cũng tạo một job cho mỗi thay đổi bài viết, không tạo N job tương ứng N người bạn. Worker gom các room người nhận và emit trong một lần gọi Socket.IO.

## 12. Retry, lỗi và tính nhất quán

BullMQ retry job với exponential backoff khi worker gặp lỗi tạm thời.

Nếu job bị thực thi lại, việc phát thêm một tín hiệu `feed:changed` không làm sai dữ liệu vì client luôn tải trạng thái cuối cùng từ API. Đây là tính idempotent ở cấp độ kết quả.

Nếu Redis tạm thời không nhận được job sau khi database đã cập nhật, thao tác tạo/sửa/xóa bài vẫn thành công. Client khác có thể chưa cập nhật tức thì nhưng sẽ tự đồng bộ khi reconnect hoặc tải lại Feed. Hệ thống chấp nhận eventual consistency thay vì báo thao tác thất bại dù database đã thay đổi.

## 13. Các thành phần cần tạo hoặc sửa

Backend:

- `src/queues/post-feed.queue.ts`: khai báo queue và hàm thêm job.
- `src/workers/post-feed.worker.ts`: lấy job, tìm người nhận và emit Socket event.
- `src/socket/feed.events.ts`: định nghĩa payload và hàm phát sự kiện.
- `src/controllers/post.controller.ts`: thêm job sau khi tạo, sửa hoặc xóa thành công.
- `src/index.ts`: khởi động worker cùng server.

Frontend:

- `src/features/feed/feed-realtime.store.ts`: nhận tín hiệu invalidation dùng chung.
- `src/socket/SocketManager.tsx`: lắng nghe `feed:changed` và reconnect.
- `src/features/feed/Feed.tsx`: debounce rồi tải lại dữ liệu từ API.

## 14. Kiến thức cần nắm

### Event-driven architecture

Thành phần tạo bài không trực tiếp thực hiện toàn bộ việc gửi realtime. Nó phát sinh một công việc; worker xử lý công việc đó độc lập.

### Queue và job

Queue là hàng đợi. Job là một đơn vị công việc chứa dữ liệu tối thiểu để worker biết phải xử lý thay đổi nào.

### Redis

Redis lưu trạng thái job như `waiting`, `active`, `completed`, `failed`. Redis không thay thế MySQL và không phải nguồn dữ liệu chính của bài viết.

### BullMQ

BullMQ cung cấp Queue, Worker, retry, backoff và cơ chế nhiều worker tranh nhau nhận job mà không xử lý đồng thời cùng một job bình thường.

### Socket.IO room

Mỗi user tham gia room `user:<userId>`. Emit đến room giúp gửi sự kiện tới tất cả tab hoặc thiết bị đang kết nối của user đó.

### Eventual consistency

Database có thể đã cập nhật nhưng giao diện của client khác chậm hơn một khoảng rất ngắn. Sau khi worker và Socket hoàn thành, các client hội tụ về cùng trạng thái.

### Idempotency

Một job có thể retry và một Socket event có thể đến nhiều lần. Client không áp dụng phép cộng hoặc chèn mù; client tải snapshot mới nhất nên kết quả cuối không bị nhân đôi.

### Debounce

Debounce gom nhiều tín hiệu gần nhau thành một lần gọi API, giảm tải cho backend và database.

### Authentication và authorization

Socket được xác thực khi kết nối. REST API vẫn kiểm tra quyền xem Feed mỗi lần tải dữ liệu, vì nhận được Socket event không đồng nghĩa có quyền đọc bài viết.

## 15. Giới hạn và hướng mở rộng

Phiên bản này phù hợp với một Socket.IO server hoặc nhiều tiến trình trong cùng kiến trúc chưa tách worker độc lập.

Khi chạy nhiều backend instance, cần thêm Socket.IO Redis adapter để một worker có thể phát sự kiện tới socket đang kết nối ở instance khác. Khi yêu cầu bảo đảm không mất sự kiện giữa transaction MySQL và thao tác thêm BullMQ job, có thể nâng cấp sang Transactional Outbox Pattern.

Hai nâng cấp này không cần thiết cho phiên bản đầu tiên nhưng là bước tiếp theo khi triển khai quy mô lớn.

## 16. Tiêu chí hoàn thành

- Bạn bè online thấy bài mới mà không reload thủ công.
- Sửa nội dung hoặc privacy làm Feed của bạn bè đồng bộ.
- Xóa bài làm bài biến mất khỏi Feed của bạn bè.
- Bài private không xuất hiện với bạn bè.
- Nhiều event gần nhau chỉ tạo một lần refresh phía client.
- Reconnect làm Feed tải lại trạng thái mới nhất.
- Job lỗi tạm thời được BullMQ retry.
- Backend và frontend build thành công.
