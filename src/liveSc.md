Request → Router → Controller → Service → Database

Router: Xác định URL nào gọi hàm nào và middleware nào được chạy.

Controller: Giao tiếp HTTP. Đọc req, kiểm tra dữ liệu đầu vào, gọi service và trả res

Service: Xử lý nghiệp vụ và làm việc với Prisma/database, ví dụ tìm user, tạo user, hash hoặc kiểm tra dữ liệu theo nghiệp vụ.

Router     = đi đường nào
Controller = nhận gì, trả gì
Service    = xử lý việc gì

useState: 



<!-- 
BullMQ quản lý:
Queue       → nơi backend thêm công việc
Job         → một công việc cụ thể
Delay       → thời gian chờ trước khi chạy
Worker      → bộ phận nhận và thực hiện công việc
Retry       → thử lại khi công việc lỗi


Redis   = kho hàng
BullMQ  = hệ thống quản lý phiếu công việc
ioredis = con đường vận chuyển phiếu tới kho


BullMQ  = tạo, tổ chức và phân phối công việc
ioredis = kênh giúp Node.js giao tiếp với Redis
Redis   = nơi lưu trạng thái công việc
 -->