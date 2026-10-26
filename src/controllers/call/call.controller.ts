import type { Response } from "express";

import type { AuthRequest } from "../../middlewares/auth.middleware";
import * as callService from "../../services/call/call.service";
import type { calls_call_type } from "@prisma/client";
import {
    emitCallEnded,
    emitCallResponded,
    emitIncomingCall,
} from "../../socket/call.events";
import { emitNewMessage } from "../../socket/message.events";

const isCallType = (
    value: unknown
): value is calls_call_type => {
    return value === "audio" || value === "video";
};/* bảo đảm FE chỉ gửi là audio hoặc video */



export const createCallToken = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        // userId được auth middleware lấy từ access token
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { callId } = req.params;

        // ID phải là số nguyên dương
        if (
            !callId ||
            Array.isArray(callId) ||
            !/^[1-9]\d*$/.test(callId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid call ID",
            });
        }

        const result = await callService.createCallToken({
            userId: req.userId,
            callId: BigInt(callId),
        });

        if (!result.success) {
            switch (result.reason) {
                case "CALL_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Call not found",
                    });

                case "NOT_CALL_PARTICIPANT":
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not a participant of this call",
                    });

                case "CALL_NOT_ACCEPTED":
                    return res.status(409).json({
                        success: false,
                        message:
                            "The call has not been accepted",
                    });

                case "CALL_NOT_ACTIVE":
                    return res.status(409).json({
                        success: false,
                        message: "This call is no longer active",
                    });

                case "USER_UNAVAILABLE":
                    return res.status(403).json({
                        success: false,
                        message: "User is unavailable",
                    });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                token: result.token,
                roomName: result.roomName,
                serverUrl: result.serverUrl,
            },
        });
    } catch (error) {
        console.error("CREATE CALL TOKEN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};


export const startCall = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        // userId được auth middleware lấy từ access token
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { conversationId } = req.params;

        // Kiểm tra conversationId có phải số nguyên dương không
        if (
            !conversationId ||
            Array.isArray(conversationId) ||
            !/^[1-9]\d*$/.test(conversationId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID",
            });
        }

        // Body phải là một object
        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                success: false,
                message: "Request body must be an object",
            });
        }

        const callType = req.body.callType;

        // Chỉ chấp nhận audio hoặc video
        if (!isCallType(callType)) {
            return res.status(400).json({
                success: false,
                message:
                    "callType must be audio or video",
            });
        }

        const result =
            await callService.createOutgoingCall({
                userId: req.userId,
                conversationId: BigInt(conversationId),
                callType,
            });

        if (!result.success) {
            switch (result.reason) {
                case "CONVERSATION_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message:
                            "Conversation not found or you are not a member",
                    });

                case "GROUP_CALL_NOT_SUPPORTED":
                    return res.status(400).json({
                        success: false,
                        message:
                            "Group calls are not supported yet",
                    });

                case "INVALID_DIRECT_CONVERSATION":
                    return res.status(409).json({
                        success: false,
                        message:
                            "Direct conversation must contain exactly two members",
                    });

                case "CALLEE_UNAVAILABLE":
                    return res.status(409).json({
                        success: false,
                        message:
                            "The recipient is unavailable",
                    });

                case "CALL_NOT_ALLOWED":
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not allowed to call this user",
                    });

                case "CALL_ALREADY_ACTIVE":
                    return res.status(409).json({
                        success: false,
                        message:
                            "This conversation already has an active call",
                        data: {
                            activeCallId:
                                result.activeCall.id.toString(),
                            status:
                                result.activeCall.status,
                        },
                    });
            }
        }

        const call = result.call;
        emitIncomingCall({
            call,
            caller: result.caller,
        });

        return res.status(201).json({
            success: true,
            message: "Call started successfully",
            data: {
                call: {
                    ...call,

                    // JSON không hỗ trợ BigInt nên phải đổi sang string
                    id:
                        call.id.toString(),
                    conversation_id:
                        call.conversation_id.toString(),
                    caller_id:
                        call.caller_id.toString(),
                    callee_id:
                        call.callee_id.toString(),
                },

                caller: {
                    ...result.caller,
                    id: result.caller.id.toString(),
                },

                callee: {
                    ...result.callee,
                    id: result.callee.id.toString(),
                },
            },
        });
    } catch (error) {
        console.error("START CALL ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

/* hàm chấp nhận hoặc từ chối cuộc gọi */
export const respondToIncomingCall = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { callId } = req.params;

        if (
            !callId ||
            Array.isArray(callId) ||
            !/^[1-9]\d*$/.test(callId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid call ID",
            });
        }

        const action = req.body?.action;

        if (
            action !== "accept" &&
            action !== "reject"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "action must be accept or reject",
            });
        }

        const result =
            await callService.respondToIncomingCall({
                userId: req.userId,
                callId: BigInt(callId),
                action,
            });

        if (!result.success) {
            switch (result.reason) {
                case "CALL_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Call not found",
                    });

                case "NOT_CALL_RECIPIENT":
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not the recipient of this call",
                    });

                case "CALL_NOT_RINGING":
                    return res.status(409).json({
                        success: false,
                        message:
                            "This call is no longer ringing",
                    });
            }
        }

        const call = result.call;

        emitCallResponded({
            call,
            action: result.action,
        });

        if (result.systemMessage) {
            emitNewMessage(result.systemMessage);
        }

        return res.status(200).json({
            success: true,
            message:
                result.action === "accept"
                    ? "Call accepted successfully"
                    : "Call rejected successfully",
            data: {
                ...call,
                id: call.id.toString(),
                conversation_id:
                    call.conversation_id.toString(),
                caller_id: call.caller_id.toString(),
                callee_id: call.callee_id.toString(),
            },
        });
    } catch (error) {
        console.error(
            "RESPOND TO INCOMING CALL ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const endCall = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { callId } = req.params;

        if (
            !callId ||
            Array.isArray(callId) ||
            !/^[1-9]\d*$/.test(callId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid call ID",
            });
        }

        const result = await callService.endCall({
            userId: req.userId,
            callId: BigInt(callId),
        });

        if (!result.success) {
            switch (result.reason) {
                case "CALL_NOT_FOUND":
                    return res.status(404).json({
                        success: false,
                        message: "Call not found",
                    });

                case "NOT_CALL_PARTICIPANT":
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not a participant of this call",
                    });

                case "CALL_NOT_ACTIVE":
                    return res.status(409).json({
                        success: false,
                        message: "This call is no longer active",
                    });
            }
        }

        const call = result.call;
        emitCallEnded({ call });
        emitNewMessage(result.systemMessage);

        return res.status(200).json({
            success: true,
            message: "Call ended successfully",
            data: {
                ...call,
                id: call.id.toString(),
                conversation_id:
                    call.conversation_id.toString(),
                caller_id: call.caller_id.toString(),
                callee_id: call.callee_id.toString(),
            },
        });
    } catch (error) {
        console.error("END CALL ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};


