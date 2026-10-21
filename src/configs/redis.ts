import "dotenv/config";

import Redis, {
    type RedisOptions,
} from "ioredis";

const getRequiredEnv = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not configured`
        );
    }

    return value;
};

const redisPort = Number(
    getRequiredEnv("REDIS_PORT")
);

if (
    !Number.isInteger(redisPort) ||
    redisPort <= 0 ||
    redisPort > 65535
) {
    throw new Error(
        "REDIS_PORT must be a valid port"
    );
}

export const redisConnectionOptions = {
    host: getRequiredEnv("REDIS_HOST"),
    port: redisPort,
    username: getRequiredEnv("REDIS_USERNAME"),
    password: getRequiredEnv("REDIS_PASSWORD"),
} satisfies RedisOptions; /*satisfies RedisOptions Kiểm tra object này có đúng chuẩn RedisOptions không */

export const testRedisConnection =
    async (): Promise<string> => {
        const redis = new Redis({
            ...redisConnectionOptions,

            // Chỉ dùng một lần để kiểm tra kết nối
            lazyConnect: true,

            // Nếu Redis lỗi thì test thất bại nhanh
            maxRetriesPerRequest: 1,

            // Không giữ lệnh test chờ khi Redis đang mất kết nối
            enableOfflineQueue: false,
        });

        try {
            await redis.connect();

            return await redis.ping();
        } finally {
            redis.disconnect();
        }
    };