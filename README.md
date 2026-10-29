# Nex Chat - Backend (API & Realtime Gateway)

<p align="center">
  <strong>Hệ thống máy chủ dịch vụ mạng xã hội và truyền thông thời gian thực</strong><br>
  Xây dựng trên nền tảng Express 5, Prisma 7, MariaDB/MySQL, Redis (BullMQ), Socket.IO và LiveKit WebRTC.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-v5.2-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/TypeScript-7.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-v7.10-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma 7" />
  <img src="https://img.shields.io/badge/MariaDB/MySQL-Database-003545?style=for-the-badge&logo=mariadb&logoColor=white" alt="Database" />
  <img src="https://img.shields.io/badge/Redis-BullMQ-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis & BullMQ" />
  <img src="https://img.shields.io/badge/Socket.IO-v4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/LiveKit-WebRTC-20232A?style=for-the-badge" alt="LiveKit WebRTC" />
</p>

---

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Điểm nổi bật về Kiến trúc Kỹ thuật](#điểm-nổi-bật-về-kiến-trúc-kỹ-thuật)
- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục dự án](#cấu-trúc-thư-mục-dự-án)
- [Mô hình dữ liệu (Database Schema)](#mô-hình-dữ-liệu-database-schema)
- [Danh sách RESTful APIs chính](#danh-sách-restful-apis-chính)
- [Hệ thống Sự kiện Real-time (Socket.IO)](#hệ-thống-sự-kiện-real-time-socketio)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Hướng dẫn cài đặt và Khởi chạy](#hướng-dẫn-cài-đặt-và-khởi-chạy)
- [Cấu hình biến môi trường (.env)](#cấu-hình-biến-môi-trường-env)
- [Giấy phép](#giấy-phép)

---

## Giới thiệu

Nex Chat Backend là hệ thống máy chủ phụ trách xử lý logic nghiệp vụ, giao tiếp dữ liệu thời gian thực và điều phối hạ tầng truyền thông cho toàn bộ nền tảng Nex Chat.

Hệ thống được thiết kế hướng tới hiệu năng cao, khả năng chịu tải tốt và độ trễ thấp thông qua việc áp dụng các giải pháp kỹ thuật tối ưu:
- Kỹ thuật truy vấn cơ sở dữ liệu ID-First kết hợp Composite Indexes.
- Xử lý hàng đợi tác vụ bất đồng bộ BullMQ trên nền Redis.
- Cấu trúc dữ liệu cây tiền tố Trie trên RAM phục vụ gợi ý hashtag tự động.
- Hạ tầng truyền thông đa phương tiện thời gian thực qua Socket.IO và LiveKit WebRTC SFU.

---

## Điểm nổi bật về Kiến trúc Kỹ thuật

### 1. Post Feed Engine và Tối ưu hóa truy vấn "ID-First"
- **Cơ chế truy vấn ID-First**: Quá trình lấy bài viết bảng tin được chia thành hai giai đoạn độc lập:
  - Giai đoạn 1: Chỉ lọc và lấy danh sách `post.id` thông qua Composite Indexes (`users(deleted, status, id DESC)`, `friendships(requester_id, status, deleted_at)`,...).
  - Giai đoạn 2: Tải chi tiết dữ liệu theo tập khóa chính `id IN (...)` đã được giới hạn số lượng (`LIMIT`), loại bỏ hoàn toàn hiện tượng Filesort và quét bảng toàn diện (Full Table Scan).
- **Kết quả đo lường**: Tốc độ phản hồi bảng tin và danh sách gợi ý bạn bè giảm từ ~1.500ms xuống dưới ~400-500ms ngay cả khi bảng dữ liệu có số lượng bản ghi lớn.

### 2. Xử lý bất đồng bộ qua BullMQ Queue và Worker
- **Phân phối bảng tin (Fan-out Post Feed)**: Khi người dùng đăng bài viết mới, logic tính toán đối tượng hiển thị được đẩy vào hàng đợi `post-feed.queue.ts` và được xử lý ngầm bởi `post-feed.worker.ts` trên nền Redis, không gây nghẽn luồng xử lý HTTP request.
- **Tự động kết thúc cuộc gọi nhỡ (Call Timeout Queue)**: Sử dụng cơ chế Delayed Job của BullMQ (`call-timeout.queue.ts`). Khi bắt đầu cuộc gọi, một job hẹn giờ được lập lịch; nếu người nhận không phản hồi sau thời gian quy định, worker tự động hủy cuộc gọi và cập nhật trạng thái cuộc gọi nhỡ.

### 3. Cây tiền tố Trie trên RAM (In-Memory Prefix Tree for Hashtags)
- Thay vì sử dụng truy vấn SQL `LIKE '%keyword%'` gây nghẽn I/O cơ sở dữ liệu khi tìm kiếm hashtag, hệ thống triển khai cấu trúc dữ liệu Trie (`src/utils/trie.ts`).
- Khi khởi động server (`initTagTrie`), các hashtag phổ biến được nạp vào bộ nhớ RAM. Thao tác gợi ý hashtag tự động hoàn thành (Autocomplete) đạt độ phức tạp thuật toán tối ưu $O(L)$ với $L$ là độ dài từ khóa.

### 4. Hạ tầng cuộc gọi WebRTC với LiveKit
- Quản lý toàn diện vòng đời cuộc gọi 1-1 (`call.lifecycle.ts`): `initiated` -> `ringing` -> `accepted` / `rejected` / `ended` / `missed`.
- Tự động sinh Access Token bảo mật với phân quyền nghiêm ngặt cấp cho từng thành viên tham gia phòng gọi LiveKit Room.

### 5. Cơ chế xác thực kép và Bảo mật đa tầng
- **Google OAuth 2.0 và Email/Mật khẩu**: Tự động liên kết tài khoản nếu email Google trùng với tài khoản đã tồn tại trong hệ thống; tự động tạo tài khoản và hồ sơ mới nếu là người dùng mới.
- **Quản lý Token kép (Dual-Token)**:
  - `accessToken`: Thời hạn ngắn (15 phút), lưu ở Client.
  - `refreshToken`: Thời hạn dài (7 ngày), lưu trong HttpOnly Cookie chống tấn công XSS, được lưu trữ và kiểm tra bản băm trong cơ sở dữ liệu để có thể chủ động thu hồi phiên làm việc.
- **Xác thực hai yếu tố (2FA TOTP)**: Tích hợp chuẩn Google Authenticator qua thư viện `otplib`, kèm mã dự phòng (Recovery Codes) khôi phục tài khoản khi mất thiết bị.

---

## Tính năng chính

| Phân hệ | Mô tả chi tiết |
| :--- | :--- |
| **Authentication & 2FA** | Đăng ký, đăng nhập, Google OAuth 2.0, cấp lại Access Token, đăng xuất toàn diện, kích hoạt và hủy xác thực hai bước (TOTP/Google Authenticator). |
| **User & Profile** | Cập nhật hồ sơ cá nhân, đổi ảnh đại diện (Avatar), cập nhật tiểu sử, xem thống kê trang cá nhân. |
| **Newsfeed & Posts** | Đăng bài kèm ảnh/video, phân quyền hiển thị (Public, Friends, Only Me), tương tác cảm xúc 6 loại, bình luận phân cấp (Nested Comments), liên kết hashtag. |
| **Stories (24 Giờ)** | Đăng tin tạm thời tồn tại trong 24 giờ, tự động ẩn khi hết hạn, xem danh sách story của bạn bè. |
| **Social Graph (Friends)** | Gửi, hủy, chấp nhận lời mời kết bạn, danh sách bạn bè, đếm số lượng bạn bè qua Index, thuật toán gợi ý bạn chung (Friends-of-friends). |
| **Realtime Messaging** | Hội thoại trực tiếp (Direct) và Nhóm, gửi nhận tin nhắn thời gian thực qua Socket.IO, đính kèm media, trạng thái đã đọc (Read receipts), tương tác cảm xúc trên tin nhắn. |
| **WebRTC Audio/Video Call** | Quản lý phiên gọi, đổ chuông hai chiều, tự động đếm ngược timeout, cấp phép LiveKit Token bảo mật. |
| **Realtime Presence & Notify** | Theo dõi trạng thái Online/Offline, lưu mốc thời gian hoạt động cuối (`last_seen_at`), đẩy thông báo tương tác tức thời. |
| **Cloud Object Storage** | Tích hợp AWS S3 / MinIO với bộ đệm Multer, tạo Presigned URL an toàn. |

---

## Công nghệ sử dụng

| Hạng mục | Công nghệ | Mục đích sử dụng |
| :--- | :--- | :--- |
| **Runtime & Framework** | Node.js (v18+) + Express 5 | Nền tảng máy chủ HTTP backend tốc độ cao |
| **Language** | TypeScript (~7.0) & tsx | Ngôn ngữ tĩnh an toàn kiểu dữ liệu, biên dịch hiện đại |
| **Database & ORM** | MariaDB / MySQL + Prisma 7 | Quản trị dữ liệu quan hệ, tự động sinh Type-safe client |
| **Queue & In-Memory Store** | Redis + BullMQ (v6) | Hàng đợi tác vụ ngầm, lập lịch trễ (Delayed Jobs) |
| **Realtime Communication** | Socket.IO (v4.8) | Cổng kết nối WebSocket hai chiều cho Chat, Feed, Presence |
| **WebRTC Media SFU** | LiveKit Server SDK | Điều phối phòng họp và cấp quyền truy cập cuộc gọi Video/Thoại |
| **Security & Auth** | JWT, Bcrypt, Google Auth Library, Otplib | Mã hóa mật khẩu, kiểm thực token, 2FA TOTP |
| **Object Storage** | AWS S3 SDK v3 / MinIO | Lưu trữ tệp tin đa phương tiện (ảnh bài viết, video, avatar) |

---

## Cấu trúc thư mục dự án

```text
nex-chat-be/
├── prisma/
│   └── schema.prisma         # Định nghĩa thực thể CSDL và composite indexes
├── src/
│   ├── configs/              # Cấu hình Prisma, Redis, AWS S3 / MinIO
│   │   ├── prisma.ts         # Khởi tạo Prisma Client với Adapter
│   │   ├── redis.ts          # Kết nối Redis qua ioredis
│   │   └── s3.ts             # Khởi tạo S3Client AWS SDK
│   ├── controllers/          # Tầng điều khiển tiếp nhận request và trả response HTTP
│   │   ├── auth.controller.ts
│   │   ├── call/call.controller.ts
│   │   ├── comment.controller.ts
│   │   ├── conversation.controller.ts
│   │   ├── friend.controller.ts
│   │   ├── notification.controller.ts
│   │   ├── post.controller.ts
│   │   ├── story.controller.ts
│   │   ├── tag.controller.ts
│   │   └── user.controller.ts
│   ├── middlewares/          # Middleware xác thực (JWT Auth) và tải tệp (Multer)
│   ├── queues/               # Định nghĩa các hàng đợi BullMQ (post-feed, call-timeout)
│   ├── routes/               # Khai báo các đường dẫn RESTful API endpoints
│   ├── services/             # Tầng xử lý logic nghiệp vụ trung tâm
│   │   ├── call/             # Vòng đời cuộc gọi, timeout, cấp token LiveKit
│   │   ├── post/             # Quyền riêng tư, truy vấn ID-First, tính toán phản ứng
│   │   ├── auth.service.ts   # Xác thực, băm mật khẩu, liên kết Google OAuth
│   │   ├── friend.service.ts # Tính bạn chung, kết bạn, đếm bạn qua Index
│   │   ├── message.service.ts# Lưu trữ và truy xuất lịch sử chat
│   │   ├── storage.service.ts# Đẩy tệp tin lên S3/MinIO
│   │   └── tag.service.ts    # Khởi tạo cây Trie và gợi ý hashtag
│   ├── socket/               # Xử lý các sự kiện WebSocket hai chiều
│   │   ├── call.events.ts    # Tín hiệu WebRTC (Ringing, Accept, Reject, End)
│   │   ├── feed.events.ts    # Cập nhật bảng tin và phản ứng mới
│   │   ├── friendship.events.ts # Thông báo kết bạn tức thì
│   │   ├── message.events.ts # Giao nhận tin nhắn, sự kiện typing
│   │   ├── presence.ts       # Quản lý trạng thái Online/Offline người dùng
│   │   └── socket.ts         # Khởi tạo và bảo mật kết nối Socket.IO
│   ├── utils/                # Tiện ích token, thuật toán cây Trie (trie.ts)
│   ├── workers/              # Tiến trình Worker ngầm lắng nghe các Queue BullMQ
│   │   ├── call-timeout.worker.ts # Xử lý cuộc gọi quá thời gian chờ
│   │   └── post-feed.worker.ts    # Xử lý phân phối bài viết ngầm
│   └── index.ts              # Điểm khởi chạy HTTP Server, Socket.IO và Workers
├── .env                      # Tệp cấu hình biến môi trường
├── .env.example              # Mẫu cấu hình môi trường chuẩn
├── package.json              # Khai báo dependencies và scripts
└── tsconfig.json             # Thiết lập trình biên dịch TypeScript
```

---

## Mô hình dữ liệu (Database Schema)

Hệ thống sử dụng MariaDB/MySQL được quản lý thông qua Prisma ORM, bao gồm các bảng trọng tâm:

1. `users` và `profiles`: Tài khoản người dùng, mã băm mật khẩu, Google ID, thông tin định danh và hồ sơ cá nhân.
2. `user_two_factor_auth` và `two_factor_recovery_codes`: Khóa bí mật 2FA TOTP và các mã cứu hộ một lần.
3. `refresh_tokens`: Quản lý phiên đăng nhập hợp lệ và cơ chế thu hồi token.
4. `posts` và `attachments`: Bài viết, quyền riêng tư, quan hệ đa hình với tệp ảnh/video đính kèm.
5. `tags`, `post_tags`, `user_interests`: Hệ thống gắn nhãn hashtag và chấm điểm sở thích người dùng phục vụ phân phối bài viết.
6. `comments` và `reactions`: Bình luận lồng nhau đa cấp và biểu tượng cảm xúc (6 loại).
7. `stories`: Tin tạm thời biến mất sau 24 giờ.
8. `conversations`, `conversation_members`, `messages`, `message_reads`: Hạ tầng tin nhắn trực tiếp/nhóm kèm trạng thái đã đọc.
9. `calls`: Lịch sử phiên gọi âm thanh/hình ảnh, người gọi, người nhận, thời lượng và trạng thái.
10. `friendships`: Mối quan hệ hai chiều với khóa duy nhất `pair_key`, được đánh Composite Indexes đa cột nhằm tối ưu tốc độ gợi ý bạn bè.
11. `notifications`: Thông báo sự kiện tới từng người dùng.

---

## Danh sách RESTful APIs chính

| Nhóm API | Phương thức | Endpoint | Mô tả |
| :--- | :---: | :--- | :--- |
| **Auth** | `POST` | `/api/auth/register` | Đăng ký tài khoản mới |
| | `POST` | `/api/auth/login` | Đăng nhập tài khoản truyền thống |
| | `POST` | `/api/auth/google` | Đăng nhập bằng Google OAuth 2.0 |
| | `POST` | `/api/auth/refresh-token`| Làm mới Access Token thông qua HttpOnly Cookie |
| | `POST` | `/api/auth/logout` | Đăng xuất và thu hồi Refresh Token trong DB |
| | `POST` | `/api/auth/2fa/setup` | Khởi tạo mã QR bí mật cho Google Authenticator |
| | `POST` | `/api/auth/2fa/verify` | Xác thực OTP để kích hoạt 2FA |
| **Users** | `GET` | `/api/users/me` | Lấy thông tin tài khoản đang đăng nhập |
| | `GET` | `/api/users/:id` | Xem thông tin hồ sơ của người dùng khác |
| | `PUT` | `/api/users/profile` | Chỉnh sửa hồ sơ cá nhân |
| **Posts** | `GET` | `/api/posts` | Lấy bảng tin trang chủ (Cursor-based pagination) |
| | `POST` | `/api/posts` | Đăng bài viết mới kèm upload đa phương tiện |
| | `GET` | `/api/posts/:id` | Xem chi tiết bài viết |
| | `POST` | `/api/posts/:id/reactions` | Thả, đổi hoặc hủy cảm xúc trên bài viết |
| | `POST` | `/api/posts/:id/comments` | Thêm bình luận hoặc phản hồi bình luận |
| **Friends** | `GET` | `/api/friends` | Lấy danh sách bạn bè hiện tại |
| | `GET` | `/api/friends/count` | Đếm nhanh tổng số bạn bè qua Index |
| | `GET` | `/api/friends/suggestions` | Lấy danh sách gợi ý bạn bè (Friends-of-friends) |
| | `POST` | `/api/friends/requests` | Gửi lời mời kết bạn |
| | `PUT` | `/api/friends/accept` | Chấp nhận lời mời kết bạn |
| **Conversations** | `GET` | `/api/conversations` | Danh sách các cuộc trò chuyện gần đây |
| | `GET` | `/api/conversations/:id/messages` | Lấy lịch sử tin nhắn trong hội thoại |
| | `POST` | `/api/conversations/:id/messages` | Gửi tin nhắn mới |
| **Calls** | `POST` | `/api/calls/initiate` | Khởi tạo cuộc gọi mới và gửi tín hiệu reo chuông |
| | `POST` | `/api/calls/accept` | Chấp nhận cuộc gọi và nhận LiveKit Token |
| | `POST` | `/api/calls/reject` | Từ chối hoặc hủy cuộc gọi |
| | `POST` | `/api/calls/end` | Kết thúc cuộc gọi |
| **Stories** | `GET` | `/api/stories` | Lấy danh sách story bạn bè đang hoạt động (< 24h) |
| | `POST` | `/api/stories` | Đăng tin story mới |
| **Tags** | `GET` | `/api/tags/suggest?q=` | Gợi ý autocomplete hashtag qua Cây Trie |

---

## Hệ thống Sự kiện Real-time (Socket.IO)

Máy chủ quản lý phiên WebSocket hai chiều có xác thực token (`io.use(socketAuthMiddleware)`):

- Tin nhắn: `message:send`, `message:receive`, `message:reaction`, `typing:start`, `typing:stop`.
- Cuộc gọi WebRTC: `call:ringing`, `call:accepted`, `call:rejected`, `call:ended`, `call:timeout`.
- Bảng tin: `feed:new_post`, `feed:reaction_updated`, `feed:comment_added`.
- Quan hệ bạn bè: `friend:request_received`, `friend:request_accepted`.
- Trạng thái kết nối: `presence:online`, `presence:offline`, `presence:get_online_users`.

---

## Yêu cầu hệ thống

- Node.js: Phiên bản `>= 18.x` (khuyến nghị `20.x` LTS hoặc mới hơn)
- MariaDB (hoặc MySQL): Phiên bản `>= 10.5` hoặc MySQL `>= 8.0`
- Redis Server: Phiên bản `>= 6.x` (dành cho BullMQ và Caching)
- MinIO / AWS S3: Tương thích S3 API phục vụ lưu trữ file
- LiveKit Server: Máy chủ WebRTC SFU phục vụ cuộc gọi video/audio

---

## Hướng dẫn cài đặt và Khởi chạy

### 1. Tải mã nguồn về máy
```bash
git clone https://github.com/doanhnguyen1311/nex-chat-be.git
cd nex-chat-be
```

### 2. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 3. Cấu hình biến môi trường
Tạo tệp `.env` từ tệp mẫu:
```bash
cp .env.example .env
```
Mở `.env` và điền đầy đủ các thông số kết nối Cơ sở dữ liệu, Redis, S3 và LiveKit.

### 4. Đồng bộ Schema Cơ sở dữ liệu (Prisma)
Sinh mã nguồn Prisma Client và đồng bộ cấu trúc bảng:
```bash
npx prisma generate
npx prisma db push
```

### 5. Khởi chạy máy chủ ở môi trường phát triển (Development)
```bash
npm run dev
```
Máy chủ sẽ khởi chạy tại cổng quy định (mặc định: `http://localhost:8080`), đồng thời tự động kích hoạt:
- Cổng WebSocket Socket.IO.
- Tiến trình Worker lắng nghe hàng đợi BullMQ (`call-timeout` và `post-feed`).
- Nạp sẵn các hashtag phổ biến vào cấu trúc cây Trie trên RAM.

### 6. Đóng gói và chạy Production
```bash
npm run build
npm run start
```

---

## Cấu hình biến môi trường (.env)

| Tên biến | Ví dụ | Giải thích |
| :--- | :--- | :--- |
| `PORT` | `8080` | Cổng lắng nghe của máy chủ Express |
| `DATABASE_URL` | `mysql://nex:pass@localhost:3307/nex` | Chuỗi kết nối CSDL MariaDB / MySQL cho Prisma |
| `CLIENT_URL` | `http://localhost:3000` | Địa chỉ Frontend Client phục vụ cấu hình CORS |
| `JWT_ACCESS_SECRET` | `64-hex-characters` | Mã bí mật ký và giải mã JWT Access Token |
| `JWT_REFRESH_SECRET`| `64-hex-characters` | Mã bí mật ký và giải mã JWT Refresh Token |
| `JWT_2FA_SECRET` | `64-hex-characters` | Mã bí mật ký phiên xác thực 2 bước |
| `REDIS_HOST` | `127.0.0.1` | Địa chỉ máy chủ Redis |
| `REDIS_PORT` | `6379` | Cổng kết nối máy chủ Redis |
| `REDIS_PASSWORD` | `your_redis_password` | Mật khẩu truy cập Redis (nếu có) |
| `S3_ENDPOINT` | `http://localhost:9000` | Địa chỉ máy chủ MinIO / AWS S3 |
| `S3_ACCESS_KEY_ID` | `nexadmin` | Access Key định danh lưu trữ S3 |
| `S3_SECRET_ACCESS_KEY` | `your_s3_secret` | Secret Key xác thực lưu trữ S3 |
| `S3_BUCKET` | `nex-images` | Tên Bucket chứa hình ảnh và video |
| `LIVEKIT_URL` | `wss://livekit.domain.com` | Địa chỉ WebSocket máy chủ LiveKit SFU |
| `LIVEKIT_API_KEY` | `nexkey` | Khóa API cấp phép phòng gọi LiveKit |
| `LIVEKIT_API_SECRET` | `your_livekit_secret` | Khóa bảo mật ký token phòng gọi LiveKit |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google Client ID xác thực OAuth 2.0 |

---
