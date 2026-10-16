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