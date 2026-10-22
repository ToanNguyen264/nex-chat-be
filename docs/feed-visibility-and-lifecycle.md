# Luồng bảng tin và quyền riêng tư bài viết

## Trạng thái triển khai

Chức năng đã được triển khai qua cả backend và frontend:

- Home dùng endpoint feed đã lọc theo chính người xem và bạn bè `accepted`.
- Profile dùng endpoint riêng và được lọc theo quan hệ với chủ Profile.
- Backend hỗ trợ cursor pagination với limit mặc định 10, tối đa 50.
- API comment và reaction cũng kiểm tra cùng quyền xem, không chỉ endpoint feed.
- Form tạo bài gửi `privacy` và backend kiểm tra lại giá trị.
- PostCard hiển thị đúng nhãn Công khai, Bạn bè hoặc Chỉ mình tôi.
- Feed có nút “Xem thêm” và loại bài trùng theo ID.
- Form tạo bài chỉ xuất hiện ở Home hoặc Profile của chính người đang đăng nhập.

Các file chính:

```text
nex-chat-be/src/services/post/post-visibility.ts
nex-chat-be/src/services/post/post-query.ts
nex-chat-be/src/services/post.service.ts
nex-chat-be/src/controllers/post.controller.ts
nex-chat-be/src/routes/post.routes.ts
nex-chat-fe/src/api/post.api.ts
nex-chat-fe/src/features/feed/Feed.tsx
nex-chat-fe/src/features/feed/components/CreatePost.tsx
nex-chat-fe/src/features/feed/components/PostCard.tsx
```

## 1. Mục tiêu

Chức năng bảng tin phải bảo đảm hai yêu cầu:

1. Người dùng chỉ nhận được những bài viết mà họ có quyền xem.
2. Frontend không tự quyết định quyền truy cập; frontend chỉ hiển thị dữ liệu backend đã cho phép.

Trang Home hiển thị bài của chính người đang đăng nhập và bạn bè đã có quan hệ `accepted`. Bài công khai của người lạ không xuất hiện ở Home; sau này có thể được đưa vào trang Khám phá riêng.

## 2. Quy tắc quyền xem

| Người đăng | `public` | `friends` | `private` |
|---|---:|---:|---:|
| Chính người đang xem | Có | Có | Có |
| Bạn bè `accepted` | Có | Có | Không |
| Người lạ | Có khi xem Profile | Không | Không |
| Hai người có quan hệ `blocked` | Không | Không | Không |

Quy tắc của Home khác Profile:

- Home: chỉ bài của chính mình và bạn bè `accepted`.
- Profile của mình: xem mọi bài của mình.
- Profile bạn bè: xem bài `public` và `friends`.
- Profile người lạ: chỉ xem bài `public`.
- Profile có quan hệ chặn: không trả bài.

## 3. API

### Bảng tin Home

```http
GET /api/posts?cursor=<postId>&limit=10
```

Backend lấy `userId` từ access token, không nhận `userId` người xem từ query để tránh giả mạo danh tính.

### Bài viết trên Profile

```http
GET /api/posts/users/:userId?cursor=<postId>&limit=10
```

`:userId` là chủ Profile. Backend so sánh chủ Profile với người đang đăng nhập rồi kiểm tra bảng `friendships`.

### Tạo bài viết

```http
POST /api/posts
Content-Type: multipart/form-data

content=<nội dung>
privacy=public|friends|private
media=<các file tùy chọn>
```

Backend chỉ chấp nhận ba giá trị `public`, `friends`, `private`. Giá trị không hợp lệ nhận HTTP 400.

### Dạng phản hồi phân trang

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "nextCursor": "123",
    "hasNextPage": true
  }
}
```

`nextCursor` là ID bài cuối cùng của trang hiện tại. Lần gọi tiếp theo truyền ID này để lấy phần dữ liệu kế tiếp.

## 4. Vòng đời bảng tin Home

```text
Home render Feed
    ↓
Feed gọi GET /api/posts?limit=10
    ↓
auth middleware giải mã access token
    ↓
controller đọc userId, cursor và limit
    ↓
service tìm các friendship accepted của userId
    ↓
service tạo danh sách friendIds
    ↓
Prisma truy vấn:
    - bài của userId với mọi privacy
    - bài của friendIds với privacy public/friends
    - deleted_at phải null
    ↓
service lấy limit + 1 bản ghi để biết còn trang sau không
    ↓
service gắn attachment, reactionCount, currentReaction, commentCount
    ↓
controller chuyển BigInt thành string
    ↓
FE map dữ liệu API thành Post
    ↓
PostList render
    ↓
Người dùng bấm "Xem thêm"
    ↓
FE gọi lại API với nextCursor và nối bài mới vào danh sách
```

## 5. Vòng đời bài viết trên Profile

```text
Profile có profile.id
    ↓
Feed gọi GET /api/posts/users/:profileId
    ↓
backend xác định viewerId từ token
    ↓
backend kiểm tra viewerId và profileId:
    ├─ cùng ID → mọi privacy
    ├─ friendship accepted → public + friends
    ├─ friendship blocked → không có bài
    └─ trường hợp khác → chỉ public
    ↓
backend phân trang và trả dữ liệu đã được phép
    ↓
frontend hiển thị trực tiếp, không tải tất cả rồi filter
```

## 6. Vòng đời tạo bài

```text
Người dùng nhập nội dung/chọn media/chọn privacy
    ↓
CreatePost gọi onCreatePost(content, media, privacy)
    ↓
post.api tạo FormData
    ↓
POST /api/posts
    ↓
controller kiểm tra content, file và privacy
    ↓
service tạo posts trong transaction
    ↓
service tạo attachments trong cùng transaction
    ↓
backend trả bài vừa tạo
    ↓
Feed chèn bài mới lên đầu danh sách
```

## 7. Vì sao phải lọc ở backend?

Nếu API trả toàn bộ bài rồi frontend dùng `filter()`, người dùng vẫn có thể mở Network hoặc gọi API trực tiếp để xem dữ liệu `private`. Ẩn một phần tử khỏi giao diện không phải là bảo mật.

Backend là ranh giới tin cậy vì:

- Danh tính người xem đến từ token đã xác thực.
- Quyền xem được áp dụng trước khi dữ liệu rời server.
- Mọi client web, mobile hoặc API trực tiếp đều chịu cùng một quy tắc.

## 8. Kiến thức cần nắm vững

### Authentication và authorization

- Authentication trả lời: “Người đang gọi API là ai?”.
- Authorization trả lời: “Người đó được phép xem bài nào?”.

`auth middleware` thực hiện authentication và gắn `req.userId`. `post.service` dùng `req.userId` để thực hiện authorization.

### Quan hệ dữ liệu nhiều-nhiều

Hai người dùng liên hệ thông qua bảng `friendships`. Một user có thể nằm ở `requester_id` hoặc `addressee_id`, vì vậy khi tìm bạn bè phải kiểm tra cả hai phía và chỉ lấy bản ghi:

```text
status = accepted
deleted_at = null
```

### Prisma `where`, `AND`, `OR`, `in`

- `OR`: chỉ cần một nhánh đúng.
- `AND`: tất cả điều kiện phải đúng.
- `in`: giá trị phải thuộc một danh sách, ví dụ `user_id in friendIds`.

Các toán tử này biểu diễn trực tiếp ma trận quyền xem thành truy vấn database.

### Cursor pagination

Offset pagination dùng `skip` lớn sẽ ngày càng tốn chi phí và dễ bị lệch khi có bài mới. Cursor pagination ghi nhớ bản ghi cuối cùng đã nhận rồi tiếp tục từ đó.

Vòng đời cursor:

```text
Trang đầu không có cursor
→ nhận 10 bài và nextCursor
→ gửi nextCursor khi xem thêm
→ backend lấy các bài sau cursor
→ nextCursor = null khi hết dữ liệu
```

### Lấy `limit + 1`

Nếu client yêu cầu 10 bài, backend lấy 11 bài:

- Có 11: trả 10 và đặt `hasNextPage = true`.
- Có tối đa 10: trả tất cả và đặt `hasNextPage = false`.

Cách này không cần chạy thêm một câu `COUNT(*)` chỉ để biết còn dữ liệu hay không.

### BigInt và JSON

ID trong MySQL là `BIGINT`, Prisma trả `bigint`, nhưng `JSON.stringify` không hỗ trợ trực tiếp `bigint`. Controller phải đổi ID và cursor sang `string` trước khi trả response.

### Transaction

Tạo post và attachments là một đơn vị công việc. Transaction bảo đảm hoặc tất cả đều thành công, hoặc tất cả bị rollback; không để lại post thiếu file khi một bước thất bại.

### Separation of concerns

- Route: ánh xạ URL và middleware.
- Controller: đọc request, validate dữ liệu HTTP, trả response.
- Service: thực hiện nghiệp vụ và truy vấn database.
- API client: đóng gói lời gọi HTTP ở frontend.
- Component: quản lý tương tác và hiển thị.

Mỗi lớp chỉ đảm nhiệm một vai trò giúp code dễ kiểm tra và thay đổi.

### Defense in depth

Frontend giới hạn lựa chọn privacy để UX rõ ràng; backend vẫn kiểm tra lại vì request có thể được tạo ngoài giao diện. Không bao giờ tin dữ liệu gửi từ client.

## 9. Các trường hợp cần kiểm tra

1. Người dùng luôn thấy cả bài private của chính mình.
2. Bạn bè thấy public/friends nhưng không thấy private.
3. Người lạ chỉ thấy public trên Profile và không xuất hiện ở Home.
4. Hai người bị chặn không thấy bài của nhau.
5. Bài có `deleted_at` không được trả về.
6. Cursor sai định dạng nhận HTTP 400.
7. Limit bị giới hạn để tránh client yêu cầu quá nhiều bản ghi.
8. Privacy sai nhận HTTP 400.
9. Bấm Xem thêm không tạo bài trùng.
10. Tạo bài mới giữ đúng privacy đã chọn.

