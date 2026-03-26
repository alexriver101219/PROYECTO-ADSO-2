export const roleValues = ["USER", "ADMIN"] as const;

export const publicUserSchema = {
  type: "object",
  required: ["id", "name", "email", "role", "createdAt"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string", format: "email" },
    role: { type: "string", enum: [...roleValues] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

export const authResponseSchema = {
  type: "object",
  required: ["token", "user"],
  properties: {
    token: { type: "string" },
    user: publicUserSchema,
  },
} as const;
