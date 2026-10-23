import type { PostPrivacy } from "./post-visibility";

export type PostFeedAction =
    | "created"
    | "updated"
    | "deleted";

export type PostFeedJobData = {
    eventId: string;
    action: PostFeedAction;
    postId: string;
    ownerId: string;
    privacy: PostPrivacy;
};

export type FeedChangedPayload = Omit< /* dùng lại các thuộc tính đã khai báo đồng thời bổ sung 1 thuộc tính nữa */
    PostFeedJobData,
    "privacy"
> & {
    occurredAt: string;
};
