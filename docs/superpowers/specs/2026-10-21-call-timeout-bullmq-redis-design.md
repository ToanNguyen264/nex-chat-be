# Thiết kế timeout cuộc gọi bằng Redis và BullMQ

## Mục tiêu

Khi một cuộc gọi ở trạng thái `ringing` không được trả lời trong 30 giây, backend tự động chuyển cuộc gọi sang `missed`, giải phóng `active_key`, ghi `ended_at`, và phát sự kiện Socket.IO để cả người gọi lẫn người nhận đóng giao diện cuộc gọi.

Frontend có thể hiển thị thời gian chờ, nhưng không phải nơi quyết định trạng thái chính thức. MySQL tiếp tục là nguồn dữ liệu đúng cuối cùng.

## Phạm vi giai đoạn đầu

- Cuộc gọi 1-1 hiện tại.
- Một Redis container trong Docker Compose.
- Một BullMQ Queue và một Worker chạy trong cùng tiến trình backend.
- Timeout cố định 30 giây.
- Không tách worker thành service riêng và chưa dùng Socket.IO Redis Adapter.

## Các phương án đã cân nhắc

### Timer trên frontend

Frontend dùng `setTimeout` rồi gọi API sau 30 giây. Cách này đơn giản nhưng timer biến mất khi đóng hoặc tải lại tab, phụ thuộc mạng của người gọi, có thể bị trình duyệt trì hoãn và không đáng tin cậy để thay đổi dữ liệu hệ thống.

Frontend timer chỉ phù hợp để hiển thị đếm ngược.

### Timer trong bộ nhớ backend

Backend dùng `setTimeout` và `Map`. Cách này không phụ thuộc trình duyệt nhưng mất toàn bộ timer khi backend restart và khó dùng khi có nhiều backend instance.

### BullMQ delayed job lưu trong Redis — lựa chọn

Khi tạo cuộc gọi thành công, backend thêm một delayed job chờ 30 giây. Redis lưu trạng thái job; BullMQ Worker nhận job khi đến hạn. Cách này bền hơn khi backend restart, không cần quét MySQL liên tục và là nền tảng có thể tách worker khi hệ thống lớn hơn.

## Vai trò từng thành phần

### MySQL

Lưu sự thật nghiệp vụ: cuộc gọi nào tồn tại và đang có trạng thái gì. Worker luôn kiểm tra MySQL trước khi cập nhật.

### Redis

Lưu dữ liệu hàng đợi của BullMQ, gồm job, thời điểm job được phép chạy, số lần thử và trạng thái xử lý. Redis không thay thế bảng `calls`.

Redis container bật AOF (`appendonly yes`) và dùng Docker volume. AOF ghi các thay đổi xuống đĩa, còn volume giữ file đó khi container được tạo lại. Nhờ cả hai, delayed job không chỉ nằm trong RAM.

### BullMQ Queue

Là phía sản xuất công việc (producer). Sau khi MySQL tạo thành công một cuộc gọi `ringing`, Queue nhận job có `callId` và `delay: 30000`.

### BullMQ Worker

Là phía tiêu thụ công việc (consumer). Khi job đến hạn, Worker thực hiện cập nhật có điều kiện `ringing -> missed`.

### Socket.IO

Nếu Worker thực sự đổi được trạng thái, Socket.IO gửi `call:ended` tới room của caller và callee để đồng bộ giao diện.

## Luồng dữ liệu

```text
A gọi B
  -> REST createOutgoingCall
  -> MySQL INSERT calls(status = ringing)
  -> BullMQ Queue thêm job call-timeout:<callId>, delay 30 giây
  -> Socket.IO phát call:incoming cho B
  -> Redis giữ job
  -> 30 giây sau Worker nhận job
  -> MySQL UPDATE ... WHERE id = callId AND status = ringing
       count = 1: cập nhật missed và phát call:ended
       count = 0: cuộc gọi đã accept/reject/cancel/end, không làm gì
```

## Chống xử lý trùng và tranh chấp

Mỗi timeout job có `jobId` ổn định dựa trên `callId`, giúp tránh thêm hai job cho cùng cuộc gọi.

Worker không đọc rồi cập nhật vô điều kiện. Worker dùng một câu cập nhật có điều kiện:

```text
WHERE id = callId AND status = ringing
```

Do đó nếu B chấp nhận đúng lúc job chạy và trạng thái đã thành `ongoing`, Worker nhận `count = 0` và không thể ghi đè thành `missed`.

## Thứ tự ghi dữ liệu và tạo job

MySQL được ghi trước, sau đó mới thêm job. Không thêm job trước vì Worker không được tham chiếu một `callId` chưa tồn tại.

Nếu thêm job thất bại sau khi call đã được tạo, backend thực hiện cập nhật bù: chỉ khi call vẫn là `ringing`, chuyển nó sang `cancelled`, đặt `ended_at` và giải phóng `active_key`, sau đó báo lỗi hạ tầng. Nhờ vậy call không bị kẹt và controller chưa phát `call:incoming` cho B.

BullMQ sẽ retry các job đã được Redis tiếp nhận nhưng xử lý thất bại. Retry không thể cứu một lệnh thêm job chưa bao giờ tới Redis, nên cập nhật bù vẫn cần thiết. Một cơ chế transactional outbox để bảo đảm tuyệt đối giữa MySQL và Redis được để dành cho giai đoạn nâng cao vì vượt quá nhu cầu học hiện tại.

## Xử lý lỗi

- Redis chưa sẵn sàng khi khởi động: backend ghi lỗi kết nối; readiness của phần call timeout chưa đạt.
- Job thất bại tạm thời: BullMQ retry với backoff hữu hạn.
- Call không tồn tại: Worker kết thúc job an toàn, ghi cảnh báo.
- Call không còn `ringing`: Worker kết thúc thành công mà không cập nhật và không phát socket.
- Socket.IO phát lỗi sau khi DB đã cập nhật: DB vẫn là trạng thái đúng; client có thể đồng bộ lại qua API khi reconnect.

## Cấu trúc module dự kiến

```text
src/
  configs/
    redis.ts                  kết nối Redis dùng chung
  queues/
    call-timeout.queue.ts     khai báo Queue và hàm enqueue
  workers/
    call-timeout.worker.ts    nhận và xử lý delayed job
  services/call/
    call-timeout.service.ts   nghiệp vụ ringing -> missed
```

`call.service.ts` chỉ yêu cầu lên lịch timeout sau khi tạo call. Logic cập nhật timeout nằm riêng để Queue, Worker và nghiệp vụ không bị trộn vào một file.

## Khởi động và dừng ứng dụng

Backend nạp biến môi trường, tạo kết nối Redis, khởi tạo Worker, rồi mở HTTP server. Khi dừng ứng dụng, Worker và Queue đóng kết nối có kiểm soát để không bỏ dở job đang xử lý.

Trong giai đoạn đầu Worker ở cùng tiến trình để có thể dùng trực tiếp Socket.IO hiện tại. Khi cần scale, Worker có thể tách thành process riêng; lúc đó bổ sung Socket.IO Redis Adapter hoặc một kênh phát sự kiện trung gian.

## Kiểm thử và tiêu chí hoàn thành

- Tạo call và không trả lời: sau khoảng 30 giây DB thành `missed`, `active_key = NULL`, có `ended_at`, hai UI đóng.
- B accept trước 30 giây: DB là `ongoing`; timeout job chạy nhưng không thay đổi call.
- B reject hoặc A cancel trước 30 giây: timeout job không thay đổi call.
- Backend restart trong thời gian chờ: job vẫn tồn tại trong Redis và được xử lý sau khi Worker hoạt động lại.
- Gọi enqueue hai lần cùng `callId`: chỉ có một timeout job hợp lệ.

## Trình tự triển khai để học

1. Thêm Redis vào Docker Compose và kiểm tra Redis độc lập.
2. Cài BullMQ và khai báo cấu hình kết nối Redis.
3. Tạo Queue và thử một delayed job tối giản.
4. Viết service cập nhật có điều kiện `ringing -> missed`.
5. Tạo Worker gọi service và phát Socket.IO.
6. Enqueue job sau khi tạo cuộc gọi thành công.
7. Khởi tạo/đóng Worker theo vòng đời backend.
8. Kiểm tra các tình huống timeout, accept, reject, cancel và restart.
