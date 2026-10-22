import type { PostPrivacy } from "./post-visibility";

type ParsedPostListQuery =
    | {
          ok: true;
          cursor: bigint | null;
          limit: number;
      }
    | {
          ok: false;
          message: "Invalid cursor" | "Invalid limit";
      };

const isPositiveIntegerString = (value: string) =>
    /^[1-9]\d*$/.test(value);

export const parsePostListQuery = (
    cursorValue: unknown,
    limitValue: unknown
): ParsedPostListQuery => {
    let cursor: bigint | null = null;

    if (cursorValue !== undefined) {
        if (
            typeof cursorValue !== "string" ||
            !isPositiveIntegerString(cursorValue)
        ) {
            return {
                ok: false,
                message: "Invalid cursor",
            };
        }

        cursor = BigInt(cursorValue);
    }

    let limit = 10;

    if (limitValue !== undefined) {
        if (
            typeof limitValue !== "string" ||
            !isPositiveIntegerString(limitValue)
        ) {
            return {
                ok: false,
                message: "Invalid limit",
            };
        }

        limit = Math.min(Number(limitValue), 50);
    }

    return {
        ok: true,
        cursor,
        limit,
    };
};

export const parsePostPrivacy = (
    value: unknown
): PostPrivacy | null => {
    if (value === undefined) {
        return "public";
    }

    return value === "public" ||
        value === "friends" ||
        value === "private"
        ? value
        : null;
};

type ParsedPostUpdateInput =
    | {
          ok: true;
          content: string;
          privacy: PostPrivacy;
      }
    | {
          ok: false;
          message:
              | "Invalid post content"
              | "Invalid post privacy";
      };

export const parsePostUpdateInput = (
    contentValue: unknown,
    privacyValue: unknown
): ParsedPostUpdateInput => {
    if (typeof contentValue !== "string") {
        return {
            ok: false,
            message: "Invalid post content",
        };
    }

    const privacy = parsePostPrivacy(privacyValue);

    if (!privacy) {
        return {
            ok: false,
            message: "Invalid post privacy",
        };
    }

    return {
        ok: true,
        content: contentValue.trim(),
        privacy,
    };
};
