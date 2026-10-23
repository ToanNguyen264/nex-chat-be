import type { reactions_reaction_type } from "@prisma/client";

export type ReactionSummaryItem = {
    reactionType: reactions_reaction_type;
    count: number;
};

export type PostReactionState = {
    reactionCount: number;
    reactionSummary: ReactionSummaryItem[];
    currentReaction: reactions_reaction_type | null;
};

type GroupedReaction = {
    target_id: bigint;
    reaction_type: reactions_reaction_type;
    _count: {
        _all: number;
    };
};

type ViewerReaction = {
    target_id: bigint;
    reaction_type: reactions_reaction_type;
};

const reactionOrder: reactions_reaction_type[] = [
    "like",
    "love",
    "haha",
    "wow",
    "sad",
    "angry",
];

const reactionOrderByType = new Map(
    reactionOrder.map((reactionType, index) => [reactionType, index])
);

export const buildPostReactionStates = (
    postIds: bigint[],
    groupedReactions: GroupedReaction[],
    viewerReactions: ViewerReaction[]
): Map<string, PostReactionState> => {
    const states = new Map<string, PostReactionState>(
        postIds.map((postId) => [ /* tạo cặp postId data => 
                                    "101" => {
                                        reactionCount: 0,
                                        reactionSummary: [],
                                        currentReaction: null
                                    }, */
            postId.toString(),
            {
                reactionCount: 0,
                reactionSummary: [],
                currentReaction: null,
            },
        ])
    );

    for (const reaction of groupedReactions) {
        const state = states.get(reaction.target_id.toString()); /* Lấy dữ liệu đã lưu trong Map ở bước 1, dựa theo target_id */

        if (!state) {
            continue;
        }

        state.reactionCount += reaction._count._all;
        state.reactionSummary.push({
            reactionType: reaction.reaction_type,
            count: reaction._count._all,
        });
    }

    for (const state of states.values()) {
        state.reactionSummary.sort((left, right) => { /* sắp xếp reaction theo số lượng giảm dần */
            const countDifference = right.count - left.count;

            if (countDifference !== 0) {
                return countDifference;
            }

            return (
                (reactionOrderByType.get(left.reactionType) ?? 0) -
                (reactionOrderByType.get(right.reactionType) ?? 0)
            );
        });
    }

    for (const reaction of viewerReactions) { /* lấy reacion của người dùng hiện tại */
        const state = states.get(reaction.target_id.toString());

        if (state) {
            state.currentReaction = reaction.reaction_type;
        }
    }

    return states;
};
