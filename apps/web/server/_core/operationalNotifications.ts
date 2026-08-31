import { z } from "zod";
import { nexoFetch } from "./nexoClient";

export const notificationCategorySchema = z.enum(["all", "appointments", "finance", "risk"]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

const operationalNotificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  severity: z.string(),
  source: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  routeHint: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  read: z.boolean(),
  readAt: z.coerce.date().nullable(),
});

const notificationListSchema = z.object({
  items: z.array(operationalNotificationSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pages: z.number().int().positive(),
  unreadCount: z.number().int().nonnegative(),
});
const unreadSchema = z.object({ unreadCount: z.number().int().nonnegative() });
const markReadSchema = z.object({ success: z.literal(true) });

export type OperationalNotification = z.infer<typeof operationalNotificationSchema>;
export type NotificationListResult = z.infer<typeof notificationListSchema>;

export async function listOperationalNotifications(
  source: unknown,
  params: { limit?: number; page?: number; category?: NotificationCategory } = {},
): Promise<NotificationListResult> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 20),
    page: String(params.page ?? 1),
    category: params.category ?? "all",
  });
  const raw = await nexoFetch<unknown>(source, `/notifications?${query}`);
  return notificationListSchema.parse(raw);
}

export async function countUnreadOperationalNotifications(source: unknown) {
  const raw = await nexoFetch<unknown>(source, "/notifications/unread-count");
  return unreadSchema.parse(raw);
}

export async function markNotificationAsRead(source: unknown, id: string) {
  const raw = await nexoFetch<unknown>(source, `/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });
  return markReadSchema.parse(raw);
}
