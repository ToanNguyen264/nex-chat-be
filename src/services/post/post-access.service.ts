import prisma from "../../configs/prisma";
import { getProfileVisibility } from "./post-visibility";

export const canViewPost = async (
    viewerId: bigint,
    postId: bigint
) => {
    const post = await prisma.posts.findFirst({
        where: {
            id: postId,
            deleted_at: null,
            users: {
                status: "active",
                deleted: "NO",
                deleted_at: null,
            },
        },
        select: {
            user_id: true,
            privacy: true,
        },
    });

    if (!post) {
        return false;
    }

    const relationship =
        viewerId === post.user_id
            ? null
            : await prisma.friendships.findFirst({
                  where: {
                      deleted_at: null,
                      OR: [
                          {
                              requester_id: viewerId,
                              addressee_id: post.user_id,
                          },
                          {
                              requester_id: post.user_id,
                              addressee_id: viewerId,
                          },
                      ],
                  },
                  select: {
                      status: true,
                  },
              });

    const allowedPrivacy = getProfileVisibility(
        viewerId,
        post.user_id,
        relationship?.status ?? null
    );

    return allowedPrivacy?.includes(post.privacy) ?? false;
};
