import { prisma } from "@guild/db";
import { broadcastToUser } from "../lib/socket";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export type NotificationPayload = {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export function serializeNotification(notification: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    metadata: notification.metadata,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export async function createNotification(payload: NotificationPayload) {
  const notification = await prisma.notification.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      metadata: (payload.metadata || undefined) as any,
    },
  });

  const serialized = serializeNotification(notification);
  await broadcastToUser(payload.userId, "notification_created", serialized);
  return serialized;
}

export async function createNotifications(payloads: NotificationPayload[]) {
  if (payloads.length === 0) {
    return [];
  }

  const notifications = await prisma.notification.createManyAndReturn({
    data: payloads.map((payload) => ({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      metadata: (payload.metadata || undefined) as any,
    })),
  });

  const created = notifications.map(serializeNotification);
  await Promise.all(
    created.map((notification) =>
      broadcastToUser(notification.userId, "notification_created", notification),
    ),
  );

  return created;
}

export async function getNotifications(userId: string, limit = 20) {
  const take = Math.min(Math.max(limit, 1), 50);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({
      where: { userId, readAt: null },
    }),
  ]);
  return {
    notifications: notifications.map(serializeNotification),
    unreadCount,
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new NotFoundError("Notification not found");
  }
  if (notification.userId !== userId) {
    throw new ForbiddenError("You cannot update another user's notification");
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: notification.readAt || new Date() },
  });

  return serializeNotification(updated);
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { success: true };
}
