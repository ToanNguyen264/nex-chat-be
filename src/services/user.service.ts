import prisma from "../configs/prisma";
import { users_status } from "@prisma/client";

export const getAllUser = async () => {
    return await prisma.users.findMany({
        where: {
            deleted: "NO",
        },
        select: {
            id: true,
            email: true,
            status: true,
            user_name: true,
            first_name: true,
            last_name: true,
            avatar: true,
            created_at: true,
            updated_at: true,
        },
        orderBy: {
            id: "desc",
        },
    });
};

export const getUserById = async (id: bigint) => {
    return await prisma.users.findUnique({
        where: {
            id,
            deleted: "NO",
        },
        select: {
            id: true,
            email: true,
            status: true,
            user_name: true,
            first_name: true,
            last_name: true,
            avatar: true,
            created_at: true,
            updated_at: true,
        },
    });
};

export const getUserProfile = async (userId: bigint) => {
    const user = await prisma.users.findFirst({
        where: {
            id: userId,
            deleted: "NO",
        },
        select: {
            id: true,
            user_name: true,
            first_name: true,
            last_name: true,
            avatar: true,
            created_at: true,
            profiles: {
                select: {
                    display_name: true,
                    avatar_url: true,
                    cover_image: true,
                    bio: true,
                    birthday: true,
                    workplace: true,
                    education: true,
                    location: true,
                    website: true,
                },
            },
        },
    });

    if (!user) {
        return null;
    }

    const [friendCount, postCount] = await prisma.$transaction([
        prisma.friendships.count({
            where: {
                status: "accepted",
                OR: [
                    { requester_id: userId },
                    { addressee_id: userId },
                ],
            },
        }),
        prisma.posts.count({
            where: {
                user_id: userId,
                deleted_at: null,
            },
        }),
    ]);

    return {
        ...user,
        friend_count: friendCount,
        follower_count: 0,
        following_count: 0,
        post_count: postCount,
    };
};

export type UpdateMyProfileInput = {
    displayName?: string;
    bio?: string | null;
    birthday?: Date | null;
    workplace?: string | null;
    education?: string | null;
    location?: string | null;
    website?: string | null;
};

export const updateMyProfile = async (
    userId: bigint,
    data: UpdateMyProfileInput
) => {
    const user = await prisma.users.findFirst({
        where: {
            id: userId,
            deleted: "NO",
        },
        select: {
            user_name: true,
            first_name: true,
            last_name: true,
        },
    });

    if (!user) {
        return null;
    }

    const fullName = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(" ");
    const displayName =
        data.displayName?.trim() ||
        fullName ||
        user.user_name ||
        "Người dùng";

    const updateData = {
        ...(data.displayName !== undefined && {
            display_name: displayName,
        }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.birthday !== undefined && {
            birthday: data.birthday,
        }),
        ...(data.workplace !== undefined && {
            workplace: data.workplace,
        }),
        ...(data.education !== undefined && {
            education: data.education,
        }),
        ...(data.location !== undefined && {
            location: data.location,
        }),
        ...(data.website !== undefined && {
            website: data.website,
        }),
    };

    return prisma.profiles.upsert({
        where: {
            user_id: userId,
        },
        update: updateData,
        create: {
            user_id: userId,
            display_name: displayName,
            bio: data.bio ?? null,
            birthday: data.birthday ?? null,
            workplace: data.workplace ?? null,
            education: data.education ?? null,
            location: data.location ?? null,
            website: data.website ?? null,
        },
        select: {
            id: true,
            user_id: true,
            display_name: true,
            avatar_url: true,
            cover_image: true,
            bio: true,
            birthday: true,
            workplace: true,
            education: true,
            location: true,
            website: true,
            created_at: true,
            updated_at: true,
        },
    });
};

type ProfileImageType = "avatar" | "cover";

export const updateMyProfileImage = async (
    userId: bigint,
    imageType: ProfileImageType,
    imageUrl: string
) => {
    const user = await prisma.users.findFirst({
        where: {
            id: userId,
            deleted: "NO",
        },
        select: {
            user_name: true,
            first_name: true,
            last_name: true,
            avatar: true,
            profiles: {
                select: {
                    avatar_url: true,
                    cover_image: true,
                },
            },
        },
    });

    if (!user) {
        return null;
    }

    const displayName =
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.user_name ||
        "Người dùng";
    const previousImageUrl = imageType === "avatar"
        ? user.profiles?.avatar_url || user.avatar || null
        : user.profiles?.cover_image ?? null;

    const profileQuery = prisma.profiles.upsert({
        where: { user_id: userId },
        update: imageType === "avatar"
            ? { avatar_url: imageUrl }
            : { cover_image: imageUrl },
        create: {
            user_id: userId,
            display_name: displayName,
            ...(imageType === "avatar"
                ? { avatar_url: imageUrl }
                : { cover_image: imageUrl }),
        },
    });

    const profile = imageType === "avatar"
        ? (await prisma.$transaction([
            prisma.users.update({
                where: { id: userId },
                data: { avatar: imageUrl },
            }),
            profileQuery,
        ]))[1]
        : await profileQuery;

    return {
        profile,
        previousImageUrl,
    };
};

export const getUserByEmail = async (email: string) => {
    return await prisma.users.findUnique({
        where: {
            email,
            deleted: "NO",
        },
    });
};

export const getUserByUserName = async (userName: string) => {
    return prisma.users.findUnique({
        where: {
            user_name: userName,
        },
        select: {
            id: true,
        },
    });
};

export const createUser = async (
    email: string,
    passwordHash: string,
    firstName: string,
    lastName: string,
    userName: string,
    phoneNumber: string,
    avatar?: string
) => {
    return await prisma.users.create({
        data: {
            email,
            password: passwordHash,
            phone_number: phoneNumber,
            status: "active",
            user_name: userName,
            first_name: firstName,
            last_name: lastName,
            ...(avatar && { avatar }),
        },
        select: {
            id: true,
            email: true,
            status: true,
            user_name: true,
            first_name: true,
            last_name: true,
            avatar: true,
            phone_number: true,
            created_at: true,
            updated_at: true,
        },
    });
};

export const updateUser = async (
    id: bigint,
    data: {
        email?: string;
        status?: users_status;
        userName?: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
    }
) => {
    const updateData = {
        ...(data.email !== undefined && { email: data.email }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.userName !== undefined && { user_name: data.userName }),
        ...(data.firstName !== undefined && { first_name: data.firstName }),
        ...(data.lastName !== undefined && { last_name: data.lastName }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
    };
    return await prisma.users.update({
        where: { id },
        data: updateData,
        select: {
            id: true,
            email: true,
            status: true,
            user_name: true,
            first_name: true,
            last_name: true,
            avatar: true,
            created_at: true,
            updated_at: true,
        },
    });
};

export const deleteUser = async (id: bigint) => {
    return await prisma.users.update({
        where: { id },
        data: {
            deleted: "YES",
            deleted_at: new Date(),
        }
    });
};
