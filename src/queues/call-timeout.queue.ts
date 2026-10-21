import { Queue } from "bullmq";

/* 
Queue	        Thêm và quản lý các Job trong hàng đợi
Worker	        Lấy Job từ Redis và thực thi
Job	            Đại diện cho một công việc cụ thể
QueueEvents	    Theo dõi sự kiện của hàng đợi
FlowProducer	Tạo các Job có quan hệ cha – con
*/

import { redisConnectionOptions } from "../configs/redis";

export const CALL_TIMEOUT_QUEUE_NAME = /* Tên queue để quản lý các job timeout cuộc gọi 1 name này có thể chứa nhiều job */
    "call-timeout";

export const CALL_TIMEOUT_JOB_NAME = /* tên loại công việc */
    "expire-ringing-call";

export type CallTimeoutJobData = {
    callId: string;
};

type CallTimeoutJobName =
    typeof CALL_TIMEOUT_JOB_NAME;


/* new Queue tạo một hàng đợi job có tên CALL_TIMEOUT_QUEUE_NAME */
export const callTimeoutQueue = new Queue< CallTimeoutJobData, void, CallTimeoutJobName>( /* thêm <> để typescript hiểu kiểu dữ liệu trong queue này là gì */
    CALL_TIMEOUT_QUEUE_NAME,
    {
        connection: {
            ...redisConnectionOptions,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        },

        defaultJobOptions: {
            attempts: 3,

            backoff: { /* Cấu hình backoff cho các lần thử lại */
                type: "exponential",
                delay: 1_000,
            },

            removeOnComplete: {
                count: 1_000,
            },

            removeOnFail: {
                count: 5_000,
            },
        },
    }
);

callTimeoutQueue.on("error", (error) => {
    console.error(
        "CALL TIMEOUT QUEUE ERROR:",
        error
    );
});

export const scheduleCallTimeout = async (
    callId: bigint
) => {
    const serializedCallId = callId.toString(); /* Chuyển đổi callId thành chuỗi để lưu trữ */

    return callTimeoutQueue.add( /* Thêm 1 job vào hàng đợi */
        CALL_TIMEOUT_JOB_NAME,
        {
            callId: serializedCallId,
        },
        {
            delay: 30_000,
            jobId:`call-timeout-${serializedCallId}`,
        }
    );
};

/*  
queue.add()	            Thêm một Job
queue.addBulk()	        Thêm nhiều Job cùng lúc
queue.getJob(id)	    Lấy Job theo ID
queue.getJobs()	        Lấy danh sách Job theo trạng thái
queue.getJobCounts()	Đếm Job theo trạng thái
queue.getWaiting()	    Lấy Job đang chờ
queue.getActive()	    Lấy Job đang xử lý
queue.getFailed()	    Lấy Job thất bại
queue.getCompleted()	Lấy Job hoàn thành
queue.pause()	        Tạm dừng hàng đợi
queue.resume()	        Tiếp tục hàng đợi
queue.clean()	        Dọn Job cũ theo điều kiện
queue.drain()	        Xóa các Job đang chờ, gồm cả delayed nếu chỉ định
queue.obliterate()	    Xóa toàn bộ dữ liệu hàng đợi (có điều kiện an toàn)
queue.close()	        Đóng kết nối của Queue 
*/