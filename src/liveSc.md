Request → Router → Controller → Service → Database

Router: Xác định URL nào gọi hàm nào và middleware nào được chạy.

Controller: Giao tiếp HTTP. Đọc req, kiểm tra dữ liệu đầu vào, gọi service và trả res

Service: Xử lý nghiệp vụ và làm việc với Prisma/database, ví dụ tìm user, tạo user, hash hoặc kiểm tra dữ liệu theo nghiệp vụ.

Router     = đi đường nào
Controller = nhận gì, trả gì
Service    = xử lý việc gì