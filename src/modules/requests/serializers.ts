export function serializeRequest(serviceRequest: {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
}) {
  return {
    id: serviceRequest.id,
    title: serviceRequest.title,
    description: serviceRequest.description,
    category: serviceRequest.category,
    status: serviceRequest.status,
    createdAt: serviceRequest.createdAt,
    updatedAt: serviceRequest.updatedAt,
    owner: serviceRequest.user,
  };
}

export function serializeHistoryEntry(entry: {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: Date;
  changedBy: {
    id: string;
    name: string;
    email: string;
  };
}) {
  return {
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    note: entry.note,
    createdAt: entry.createdAt,
    changedBy: entry.changedBy,
  };
}

export function serializeAttachment(attachment: {
  id: string;
  requestId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  uploadedBy: {
    id: string;
    name: string;
    email: string;
  };
}) {
  return {
    id: attachment.id,
    requestId: attachment.requestId,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    uploadedBy: attachment.uploadedBy,
    downloadUrl: `/attachments/${attachment.id}/download`,
  };
}
