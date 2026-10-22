# Vòng đời chức năng chỉnh sửa bài viết

## Phạm vi chức năng

Người dùng chỉ có thể chỉnh sửa bài viết do chính mình tạo. Chức năng hiện tại cho phép thay đổi:

- Nội dung bài viết.
- Quyền riêng tư: `public`, `friends` hoặc `private`.

Ảnh và video đã đăng được giữ nguyên. Frontend không gửi file và backend không cập nhật bảng `attachments`.

## Sơ đồ tổng quát

```text
Người dùng nhấn dấu ba chấm
        ↓
PostCard kiểm tra người hiện tại có phải chủ bài viết không
        ↓
Nhấn "Chỉnh sửa bài viết"
        ↓
EditPostModal mở với nội dung và quyền riêng tư hiện tại
        ↓
Người dùng chỉnh sửa và nhấn "Lưu thay đổi"
        ↓
Feed gọi updatePost(postId, content, privacy)
        ↓
PATCH /api/posts/:id
        ↓
Middleware auth xác định userId từ access token
        ↓
Controller kiểm tra id, content và privacy
        ↓
Service kiểm tra bài viết thuộc userId và chưa bị xóa
        ↓
Prisma cập nhật posts.content và posts.privacy
        ↓
Backend trả bài viết vừa cập nhật
        ↓
Feed thay đúng bài viết trong state posts
        ↓
React render lại nội dung và biểu tượng quyền riêng tư
```

## 1. Hiển thị lựa chọn chỉnh sửa

File: `nex-chat-fe/src/features/feed/components/PostCard.tsx`

`Feed` truyền `currentUser.id` xuống `PostList`, rồi xuống `PostCard`. `PostCard` so sánh:

```text
currentUserId === post.userId
```

Nếu đúng, người đang xem là chủ bài viết nên menu dấu ba chấm mới xuất hiện. Đây là kiểm tra giao diện để người dùng không nhìn thấy thao tác không thuộc quyền của mình.

Kiểm tra này không thay thế bảo mật backend, vì một người vẫn có thể tự gửi HTTP request mà không đi qua giao diện.

## 2. Mở form chỉnh sửa

File: `nex-chat-fe/src/features/feed/components/EditPostModal.tsx`

Khi nhấn **Chỉnh sửa bài viết**, `PostCard` đặt `isEditOpen = true`. React render `EditPostModal` với dữ liệu hiện tại của bài viết:

```text
post.content  → giá trị ban đầu của textarea
post.privacy  → giá trị ban đầu của select
post.images   → chỉ xem trước
post.videos   → chỉ xem trước
```

Modal lưu phần người dùng đang nhập bằng `useState`. Việc gõ chữ mới chỉ thay đổi state ở trình duyệt, chưa tác động database.

## 3. Gửi request từ frontend

File: `nex-chat-fe/src/api/post.api.ts`

Khi nhấn **Lưu thay đổi**, modal gọi callback lên `Feed`. `Feed` gọi:

```http
PATCH /api/posts/15
Content-Type: application/json

{
  "content": "Nội dung mới",
  "privacy": "friends"
}
```

Sử dụng `PATCH` vì request chỉ thay đổi một phần của bài viết. Request không chứa ảnh hoặc video nên media cũ không bị thay thế.

## 4. Route và xác thực

File: `nex-chat-be/src/routes/post.routes.ts`

Route nhận request:

```text
PATCH /posts/:id
```

Middleware `auth` chạy trước controller. Nó đọc access token và gắn ID người đang đăng nhập vào `req.userId`.

## 5. Controller kiểm tra dữ liệu

File: `nex-chat-be/src/controllers/post.controller.ts`

Controller thực hiện các kiểm tra biên:

1. Có `userId` hay chưa.
2. `id` bài viết có phải số hợp lệ không.
3. `content` có phải chuỗi không.
4. `privacy` có thuộc `public`, `friends`, `private` không.

Hàm `parsePostUpdateInput` trong `src/services/post/post-query.ts` loại bỏ khoảng trắng thừa ở đầu và cuối nội dung, đồng thời chuẩn hóa dữ liệu trước khi truyền vào service.

## 6. Service kiểm tra quyền sở hữu và cập nhật database

File: `nex-chat-be/src/services/post.service.ts`

Service tìm bài viết với đồng thời ba điều kiện:

```text
id         = postId
user_id    = userId của access token
deleted_at = null
```

Điều kiện `user_id = userId` là lớp bảo mật chính. Nếu người dùng A gửi request sửa bài của người B, truy vấn không tìm thấy bài phù hợp và backend trả `404`.

Nếu nội dung sau khi trim bị rỗng, service kiểm tra bài viết có attachment hay không:

- Có ảnh/video: cho phép nội dung rỗng.
- Không có ảnh/video: trả lỗi `Post content is required`.

Khi hợp lệ, Prisma chỉ cập nhật:

```text
posts.content
posts.privacy
```

Bảng `attachments` không được cập nhật, vì vậy ảnh và video cũ vẫn giữ nguyên.

## 7. Cập nhật state và render lại

File: `nex-chat-fe/src/features/feed/Feed.tsx`

Backend trả về `content` và `privacy` mới. `Feed` dùng `map()` để tạo mảng state mới:

```text
Bài có id khác postId → giữ nguyên
Bài có id bằng postId → thay content và privacy
```

Khi `setPosts()` nhận mảng mới, React render lại `PostCard` tương ứng. Không cần tải lại trang và cũng không cần gọi lại API lấy toàn bộ danh sách bài viết.

## Các phản hồi lỗi quan trọng

```text
400 → ID hoặc dữ liệu chỉnh sửa không hợp lệ
401 → Chưa đăng nhập hoặc token không hợp lệ
404 → Bài viết không tồn tại hoặc không thuộc người đang đăng nhập
500 → Lỗi không mong đợi ở server
```

## Kiến thức cần nắm

- **Props và callback:** truyền ID người dùng xuống component và truyền sự kiện lưu ngược lên `Feed`.
- **React state:** giữ dữ liệu form và thay đổi đúng một bài viết mà không reload trang.
- **HTTP PATCH:** cập nhật một phần tài nguyên hiện có.
- **Authentication:** xác định người gửi request bằng access token.
- **Authorization:** kiểm tra người gửi có sở hữu bài viết hay không.
- **Validation:** không tin trực tiếp dữ liệu gửi từ frontend.
- **Prisma transaction:** gom bước kiểm tra và cập nhật thành một luồng nghiệp vụ database.
- **Defense in depth:** frontend ẩn nút để cải thiện trải nghiệm; backend vẫn bắt buộc kiểm tra quyền để bảo mật.
