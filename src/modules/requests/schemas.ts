export const requestStatusValues = [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const;

const ownerSchema = {
  type: "object",
  required: ["id", "name", "email"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string", format: "email" },
  },
} as const;

export const requestSchema = {
  type: "object",
  required: [
    "id",
    "title",
    "description",
    "category",
    "status",
    "createdAt",
    "updatedAt",
    "owner",
  ],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    status: { type: "string", enum: [...requestStatusValues] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    owner: ownerSchema,
  },
} as const;

export const requestHistorySchema = {
  type: "object",
  required: ["id", "toStatus", "createdAt", "changedBy"],
  properties: {
    id: { type: "string" },
    fromStatus: {
      anyOf: [
        { type: "string", enum: [...requestStatusValues] },
        { type: "null" },
      ],
    },
    toStatus: { type: "string", enum: [...requestStatusValues] },
    note: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    createdAt: { type: "string", format: "date-time" },
    changedBy: ownerSchema,
  },
} as const;

export const attachmentSchema = {
  type: "object",
  required: [
    "id",
    "requestId",
    "originalName",
    "mimeType",
    "size",
    "createdAt",
    "uploadedBy",
    "downloadUrl",
  ],
  properties: {
    id: { type: "string" },
    requestId: { type: "string" },
    originalName: { type: "string" },
    mimeType: { type: "string" },
    size: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    uploadedBy: ownerSchema,
    downloadUrl: { type: "string" },
  },
} as const;
