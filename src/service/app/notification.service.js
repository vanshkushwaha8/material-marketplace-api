const notificationModel = require('../../model/notification.model');
const mongoose = require('mongoose');
const { EventEmitter } = require('events');
const userModel = require('../../model/user.model');
const { getMessaging } = require('../../config/firebase.config');
const { removeTokenGlobally } = require('./pushToken.service');
// In-process pub/sub for real-time notifications.
// This works for a single Node.js process.
// If the app runs multiple instances behind a load balancer,
// move this to a shared broker such as Redis Pub/Sub.
const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(0);

// The single creation point every business event calls into.
// Never insert into notificationModel directly from elsewhere,
// so the notification shape stays consistent everywhere.
async function createNotification({
  recipientId,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
}) {
  if (!recipientId) return null;

  const notification = await notificationModel
    .create({
      recipient: recipientId,
      type,
      title,
      message,
      entityType,
      entityId,
    })
    .catch((err) => {
      console.error(
        'Notification creation failed:',
        err.message,
        '| Type:',
        type
      );

      // A failed notification must never break
      // the business action that triggered it.
      return null;
    });

  // Publish the persisted notification to connected SSE clients.
    if (notification) {
    notificationEmitter.emit(`notify:${recipientId}`, notification);
    sendPushNotification({ recipientId, title, message, entityType, entityId }).catch((err) => {
      console.error('Push notification failed (non-fatal):', err.message);
    });
  }
  return notification;
}

// Never lets a push failure affect the caller — same resilience contract
// as the DB write above. Silently no-ops when Firebase isn't configured.
async function sendPushNotification({ recipientId, title, message, entityType, entityId }) {
  const messaging = getMessaging();
  if (!messaging) return;

  const user = await userModel.findById(recipientId).select('fcmTokens');
  if (!user?.fcmTokens?.length) return;

  const result = await messaging.sendEachForMulticast({
    tokens: user.fcmTokens,
    notification: { title, body: message },
    data: { entityType: entityType || '', entityId: entityId ? String(entityId) : '' },
  });

  // Clean up dead tokens (uninstalled app, expired registration, etc.)
  // so the token list doesn't grow stale forever.
  result.responses.forEach((res, i) => {
    if (!res.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(res.error?.code)) {
      removeTokenGlobally(user.fcmTokens[i]).catch(() => {});
    }
  });
}

async function listForUser({
  userId,
  page = 1,
  limit = 20,
  unreadOnly = false,
}) {
  const query = { recipient: userId };

  if (unreadOnly) {
    query.isRead = false;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);

  const [getData, count] = await Promise.all([
    notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageLimit)
      .limit(pageLimit)
      .lean(),

    notificationModel.countDocuments(query),
  ]);

  return {
    getData,
    count,
    page: pageNum,
    limit: pageLimit,
  };
}

async function getUnreadCount(userId) {
  return notificationModel.countDocuments({
    recipient: userId,
    isRead: false,
  });
}

async function markAsRead({ notificationId, userId }) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return null;
  }

  return notificationModel.findOneAndUpdate(
    {
      _id: notificationId,
      recipient: userId,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    {
      new: true,
    }
  );
}

async function markAllAsRead(userId) {
  const result = await notificationModel.updateMany(
    {
      recipient: userId,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    }
  );

  return {
    modified: result.modifiedCount,
  };
}

module.exports = {
  createNotification,
  sendPushNotification,
  listForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notificationEmitter,
};