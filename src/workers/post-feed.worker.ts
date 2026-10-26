import { Worker, type Job } from "bullmq";

import prisma from "../configs/prisma";
import { redisConnectionOptions } from "../configs/redis";
import {
    POST_FEED_JOB_NAME,
    POST_FEED_QUEUE_NAME,
    POST_REACTION_JOB_NAME,
    type PostFeedQueueJobData,
    type PostFeedQueueJobName,
} from "../queues/post-feed.queue";
import { getPostFeedRecipientIds } from "../services/post/post-feed-audience";
import type {
    PostFeedJobData,
    PostReactionJobData,
} from "../services/post/post-feed.types";
import { buildPostReactionStates } from "../services/post/post-reaction-summary";
import { extractAcceptedFriendIds } from "../services/post/post-visibility";
import {
    emitFeedChanged,
    emitPostReactionUpdated,
} from "../socket/feed.events";

const parsePositiveId = (
    value: string,
    fieldName: string
): bigint => {
    if (!/^[1-9]\d*$/.test(value)) {
        throw new Error(
            `Invalid ${fieldName} in post feed job: ${value}`
        );
    }

    return BigInt(value);
};

const getAcceptedFriendIds = async (
    ownerId: bigint
): Promise<string[]> => {
    const relationships =
        await prisma.friendships.findMany({
            where: {
                status: "accepted",
                deleted_at: null,
                OR: [
                    {
                        requester_id: ownerId,
                    },
                    {
                        addressee_id: ownerId,
                    },
                ],
            },
            select: {
                requester_id: true,
                addressee_id: true,
                status: true,
                deleted_at: true,
            },
        });

    return extractAcceptedFriendIds(
        ownerId,
        relationships
    ).map((friendId) => friendId.toString());
};

export const startPostFeedWorker = () => {
    const worker = new Worker<
        PostFeedQueueJobData,
        void,
        PostFeedQueueJobName
    >(
        POST_FEED_QUEUE_NAME,
        async (
            job: Job<
                PostFeedQueueJobData,
                void,
                PostFeedQueueJobName
            >
        ) => {/* Tạo một Worker kết nối vào Redis, trực chờ ở hàng đợi tên là "post-feed" */
            if (job.name === POST_REACTION_JOB_NAME) {
                const reactionData = job.data as PostReactionJobData;
                const ownerId = parsePositiveId(
                    reactionData.ownerId,
                    "ownerId"
                );
                const postId = parsePositiveId(
                    reactionData.postId,
                    "postId"
                );

                const [friendIds, groupedReactions] = /* Lấy danh sách bạn bè và đếm tổng cảm xúc từ Database */
                    await Promise.all([
                        reactionData.privacy === "private"
                            ? Promise.resolve([])
                            : getAcceptedFriendIds(ownerId),
                        prisma.reactions.groupBy({
                            by: [
                                "target_id",
                                "reaction_type",
                            ],
                            where: {
                                target_type: "post",
                                target_id: postId,
                            },
                            _count: {
                                _all: true,
                            },
                        }),
                    ]);

                const recipientIds = /* Lọc ra danh sách những người được phép nhận Socket */
                    getPostFeedRecipientIds({
                        ownerId: reactionData.ownerId,
                        friendIds,
                        action: "updated",
                        privacy: reactionData.privacy,
                    });

                const reactionState = /* Gom kết quả đếm cảm xúc thành cấu trúc chuẩn */
                    buildPostReactionStates(
                        [postId],
                        groupedReactions,
                        []
                    ).get(reactionData.postId);

                emitPostReactionUpdated({ /* Phát tín hiệu Socket tới tất cả người xem và kết thúc Job */
                    postId: reactionData.postId,
                    reactionCount:
                        reactionState?.reactionCount ?? 0,
                    reactionSummary:
                        reactionState?.reactionSummary ?? [],
                    recipientIds,
                });

                return;
            }

            if (job.name === POST_FEED_JOB_NAME) {
                const feedData = job.data as PostFeedJobData;
                const ownerId = parsePositiveId(
                    feedData.ownerId,
                    "ownerId"
                );
                parsePositiveId(feedData.postId, "postId");

                const friendIds =
                    await getAcceptedFriendIds(ownerId);
                const recipientIds =
                    getPostFeedRecipientIds({
                        ownerId: feedData.ownerId,
                        friendIds,
                        action: feedData.action,
                        privacy: feedData.privacy,
                    });

                emitFeedChanged({
                    recipientIds,
                    payload: {
                        eventId: feedData.eventId,
                        action: feedData.action,
                        postId: feedData.postId,
                        ownerId: feedData.ownerId,
                        occurredAt:
                            new Date().toISOString(),
                    },
                });
            }
        },
        {
            connection: {
                ...redisConnectionOptions,
                maxRetriesPerRequest: null,
            },
        }
    );

    worker.on("completed", (job) => {
        console.log(`POST FEED JOB ${job.id} COMPLETED`);
    });

    worker.on("failed", (job, error) => {
        console.error(
            `POST FEED JOB ${job?.id ?? "unknown"} FAILED:`,
            error
        );
    });

    worker.on("error", (error) => {
        console.error("POST FEED WORKER ERROR:", error);
    });

    console.log("POST FEED WORKER STARTED");

    return worker;
};
