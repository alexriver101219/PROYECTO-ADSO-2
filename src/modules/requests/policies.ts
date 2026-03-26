import { RequestStatus, Role, type Request } from "@prisma/client";

import { AppError } from "../../lib/errors";
import type { AuthenticatedUser } from "../../types/auth";

const adminTransitions: Record<RequestStatus, RequestStatus[]> = {
  PENDING: [
    RequestStatus.IN_REVIEW,
    RequestStatus.APPROVED,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
  ],
  IN_REVIEW: [
    RequestStatus.APPROVED,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
  ],
  APPROVED: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

const userTransitions: Record<RequestStatus, RequestStatus[]> = {
  PENDING: [RequestStatus.CANCELLED],
  IN_REVIEW: [RequestStatus.CANCELLED],
  APPROVED: [RequestStatus.COMPLETED],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export function assertCanAccessRequest(
  actor: AuthenticatedUser,
  serviceRequest: Pick<Request, "userId">,
) {
  if (actor.role !== Role.ADMIN && actor.id !== serviceRequest.userId) {
    throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
  }
}

export function assertCanEditRequest(
  actor: AuthenticatedUser,
  serviceRequest: Pick<Request, "userId" | "status">,
) {
  if (actor.id !== serviceRequest.userId || actor.role !== Role.USER) {
    throw new AppError(403, "Only the owner can edit this request.", "FORBIDDEN");
  }

  if (serviceRequest.status !== RequestStatus.PENDING) {
    throw new AppError(
      409,
      "Only pending requests can be edited.",
      "REQUEST_NOT_EDITABLE",
    );
  }
}

export function assertAllowedStatusTransition(
  actor: AuthenticatedUser,
  serviceRequest: Pick<Request, "userId" | "status">,
  nextStatus: RequestStatus,
) {
  if (actor.role === Role.USER && actor.id !== serviceRequest.userId) {
    throw new AppError(403, "You cannot update this request.", "FORBIDDEN");
  }

  const allowedTransitions =
    actor.role === Role.ADMIN
      ? adminTransitions[serviceRequest.status]
      : userTransitions[serviceRequest.status];

  if (serviceRequest.status === nextStatus) {
    throw new AppError(
      400,
      "The request is already in that status.",
      "STATUS_UNCHANGED",
    );
  }

  if (!allowedTransitions.includes(nextStatus)) {
    throw new AppError(
      409,
      `Transition from ${serviceRequest.status} to ${nextStatus} is not allowed.`,
      "INVALID_STATUS_TRANSITION",
    );
  }
}
