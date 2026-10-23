import { Worker, type Job } from "bullmq";

import prisma from "../configs/prisma";
import { redisConnectionOptions } from "../configs/redis";
import {
    POST_FEED_JOB_NAME,
    POST_FEED_QUEUE_NAME,
} from "../queues/post-feed.queue";
import { getPostFeedRecipientIds } from "../services/post/post-feed-audience";
import type { PostFeedJobData } from "../services/post/post-feed.types";
import { extractAcceptedFriendIds } from "../services/post/post-visibility";
import { emitFeedChanged } from "../socket/feed.events";

type PostFeedJobName = typeof POST_FEED_JOB_NAME;

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

export const startPostFeedWorker = () => {
    const worker = new Worker<
        PostFeedJobData,
        void,
        PostFeedJobName
    >(
        POST_FEED_QUEUE_NAME,
        async (
            job: Job<
                PostFeedJobData,
                void,
                PostFeedJobName
            >
        ) => {
            const ownerId = parsePositiveId(
                job.data.ownerId,
                "ownerId"
            );
            parsePositiveId(job.data.postId, "postId");

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

            const friendIds = extractAcceptedFriendIds(
                ownerId,
                relationships
            ).map((friendId) => friendId.toString());
            const recipientIds = getPostFeedRecipientIds({
                ownerId: job.data.ownerId,
                friendIds,
                action: job.data.action,
                privacy: job.data.privacy,
            });

            emitFeedChanged({
                recipientIds,
                payload: {
                    eventId: job.data.eventId,
                    action: job.data.action,
                    postId: job.data.postId,
                    ownerId: job.data.ownerId,
                    occurredAt: new Date().toISOString(),
                },
            });
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
