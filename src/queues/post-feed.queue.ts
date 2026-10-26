import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";

import { redisConnectionOptions } from "../configs/redis";
import type {
    PostFeedAction,
    PostFeedJobData,
    PostReactionJobData,
} from "../services/post/post-feed.types";
import type { PostPrivacy } from "../services/post/post-visibility";

export const POST_FEED_QUEUE_NAME = "post-feed";
export const POST_FEED_JOB_NAME = "broadcast-post-feed-change";
export const POST_REACTION_JOB_NAME = "broadcast-post-reaction-change";

export type PostFeedQueueJobName =
    | typeof POST_FEED_JOB_NAME
    | typeof POST_REACTION_JOB_NAME;

export type PostFeedQueueJobData =
    | PostFeedJobData
    | PostReactionJobData;

export const postFeedQueue = new Queue<
    PostFeedQueueJobData,
    void,
    PostFeedQueueJobName
>(POST_FEED_QUEUE_NAME, {
    connection: {
        ...redisConnectionOptions,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
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
});

postFeedQueue.on("error", (error) => {
    console.error("POST FEED QUEUE ERROR:", error);
});

type SchedulePostFeedChangeInput = {
    action: PostFeedAction;
    postId: bigint;
    ownerId: bigint;
    privacy: PostPrivacy;
};

export const schedulePostFeedChange = async ({
    action,
    postId,
    ownerId,
    privacy,
}: SchedulePostFeedChangeInput) => {
    const eventId = randomUUID();

    return postFeedQueue.add(
        POST_FEED_JOB_NAME,
        {
            eventId,
            action,
            postId: postId.toString(),
            ownerId: ownerId.toString(),
            privacy,
        },
        {
            jobId: `post-feed-${eventId}`,
        }
    );
};

type SchedulePostReactionChangeInput = {
    postId: bigint;
    ownerId: bigint;
    privacy: PostPrivacy;
};

export const schedulePostReactionChange = async ({
    postId,
    ownerId,
    privacy,
}: SchedulePostReactionChangeInput) => {
    const postIdText = postId.toString();

    return postFeedQueue.add(
        POST_REACTION_JOB_NAME,
        {
            postId: postIdText,
            ownerId: ownerId.toString(),
            privacy,
        },
        {
            jobId: `post-reaction-${postIdText}`,
            delay: 300,
            removeOnComplete: true,
            removeOnFail: true,
        }
    );
};
