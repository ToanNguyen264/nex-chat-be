import {
    Worker,
    type Job,
} from "bullmq";

import { redisConnectionOptions } from "../configs/redis";
import {
    CALL_TIMEOUT_JOB_NAME,
    CALL_TIMEOUT_QUEUE_NAME,
    type CallTimeoutJobData,
} from "../queues/call-timeout.queue";

import { markRingingCallAsMissed } from "../services/call/call-timeout.service";
import { emitCallEnded } from "../socket/call.events";
import { emitNewMessage } from "../socket/message.events";

type CallTimeoutJobName =
    typeof CALL_TIMEOUT_JOB_NAME;


/* lấy ngược lại ID cuộc gọi từ redis để lưu vào db */
const parseCallId = (
    serializedCallId: string
): bigint => {
    if (!/^[1-9]\d*$/.test(serializedCallId)) {
        throw new Error(
            `Invalid callId in timeout job: ${serializedCallId}`
        );
    }
    return BigInt(serializedCallId);
};



export const startCallTimeoutWorker = () => {
    const worker = new Worker< CallTimeoutJobData, void, CallTimeoutJobName>( /* này là 1 instance của của BullMQ, nó được tạo từ thư viện này */
        /* worker nhân viên sẵn sàng nhận lệnh từ redis khi có lệnh */
        CALL_TIMEOUT_QUEUE_NAME,

        async (
            job: Job< CallTimeoutJobData, void, CallTimeoutJobName>
        ) => {
            const callId = parseCallId(
                job.data.callId
            );

            console.log(
                "PROCESSING CALL TIMEOUT:",
                {
                    jobId: job.id,
                    callId: callId.toString(),
                }
            );

            const result =
                await markRingingCallAsMissed(
                    callId
                );

            if (!result.expired) {
                console.log(
                    "CALL TIMEOUT SKIPPED:",
                    {
                        jobId: job.id,
                        callId:
                            callId.toString(),
                        reason: result.reason,
                    }
                );

                return;
            }

            emitCallEnded({
                call: result.call,
            });
            emitNewMessage(result.systemMessage);

            console.log(
                "CALL MARKED AS MISSED:",
                {
                    jobId: job.id,
                    callId:
                        callId.toString(),
                }
            );
        },

        {
            connection: {
                ...redisConnectionOptions,
                maxRetriesPerRequest: null,
            },
        }
    );

    worker.on("completed", (job) => {
        console.log(
            `JOB ${job.id} COMPLETED`
        );
    });

    worker.on(
        "failed",
        (job, error) => {
            console.error(
                `JOB ${job?.id ?? "unknown"} FAILED:`,
                error
            );
        }
    );

    worker.on("error", (error) => {
        console.error(
            "CALL TIMEOUT WORKER ERROR:",
            error
        );
    });

    console.log(
        "CALL TIMEOUT WORKER STARTED"
    );

    return worker;
};

console.log("CALL TIMEOUT WORKER STARTED");