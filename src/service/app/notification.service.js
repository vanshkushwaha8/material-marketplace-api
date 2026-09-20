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

// [NOTIFICATION] Who performed the action, resolved once here so every
// call site doesn't need its own userModel lookup just to get a display
// name. Caller can pass `actorName` directly instead (e.g. it already
// populated the doc) to skip this query.
async function resolveActorName(actorId) {
  if (!actorId) return null;
  const actor = await userModel.findById(actorId).select('fullName').lean();
  return actor?.fullName || null;
}

// Section 14: maps entityType (+ the recipient's own role, since buyer and
// seller use different dashboard routes for the same transaction/offer) to
// the in-app route the notification should open. Computed server-side, once,
// so neither the click handler nor the frontend has to guess it.
function buildDeepLink({ entityType, entityId, recipientRole }) {
  const isSeller = recipientRole === 'Seller';
  switch (entityType) {
    case 'offer':
      return isSeller ? '/seller/offers' : '/buyer-dashboard/offers';
    case 'transaction':
      return entityId
        ? `/${isSeller ? 'seller' : 'buyer'}/transactions/${entityId}`
        : isSeller
        ? '/seller/transactions'
        : '/buyer-dashboard/transactions';
    case 'payout':
      return '/seller/payouts';
    case 'requirement':
      return isSeller ? '/seller/requirements' : '/buyer-dashboard/requirements';
    case 'listing':
      return entityId ? `/listings/${entityId}` : '/materials';
    default:
      return '/buyer-dashboard/notifications';
  }
}

// The single creation point every business event calls into.
// Never insert into notificationModel directly from elsewhere,
// so the notification shape stays consistent everywhere.
//
// `title`/`message` can be a plain string, or a function `(actorName) =>
// string` — use the function form when the text should name the actor
// (e.g. "Rahul Sharma sent you a message"), so callers don't have to look
// the actor's name up themselves just to build the string.
async function createNotification({
  recipientId,
  actorId = null,
  actorName = null,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  entityName = null,
}) {
  if (!recipientId) return null;

  if (actorId && !actorName) {
    actorName = await resolveActorName(actorId);
  }

  const resolvedTitle = typeof title === 'function' ? title(actorName) : title;
  const resolvedMessage = typeof message === 'function' ? message(actorName) : message;

  console.log('[NOTIFICATION] Actor:', actorName || 'system', '| Receiver:', recipientId, '| Type:', type, '| Entity:', entityType || '-', entityId || '');

  const notification = await notificationModel
    .create({
      recipient: recipientId,
      actor: actorId || null,
      actorName,
      type,
      title: resolvedTitle,
      message: resolvedMessage,
      entityType,
      entityId,
      entityName,
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
    sendPushNotification(notification).catch((err) => {
      console.error('Push notification failed (non-fatal):', err.message);
    });
  }
  return notification;
}

// Never lets a push failure affect the caller — same resilience contract
// as the DB write above. Silently no-ops when Firebase isn't configured.
// Takes the persisted notification doc so the payload sent to the device is
// always exactly what was stored (single source of truth, no drift between
// the in-app notification and the push).
async function sendPushNotification(notification) {
  console.log('[FCM] Preparing push for notification', notification._id);
  const messaging = getMessaging();
  if (!messaging) {
    console.log('[FCM] Firebase not configured — skipping push, in-app notification still saved');
    return;
  }

  const user = await userModel.findById(notification.recipient).select('fcmTokens userType');
  if (!user?.fcmTokens?.length) {
    console.log('[FCM] Recipient has no registered devices — skipping push');
    return;
  }

  const deepLink = buildDeepLink({
    entityType: notification.entityType,
    entityId: notification.entityId,
    recipientRole: user.userType,
  });

  // Structured payload (spec section 6/7) — the receiver can tell who
  // performed the action, what happened, and which entity it relates to
  // without a follow-up API call, and the SW can deep-link straight there.
  const result = await messaging.sendEachForMulticast({
    tokens: user.fcmTokens,
    notification: { title: notification.title, body: notification.message },
    data: {
      notificationId: String(notification._id),
      notificationType: notification.type,
      actorId: notification.actor ? String(notification.actor) : '',
      actorName: notification.actorName || '',
      entityType: notification.entityType || '',
      entityId: notification.entityId ? String(notification.entityId) : '',
      entityName: notification.entityName || '',
      title: notification.title,
      message: notification.message,
      deepLink,
    },
  });

  console.log('[FCM] Sent to', user.fcmTokens.length, 'device(s) —', result.successCount, 'succeeded,', result.failureCount, 'failed');

  // Clean up dead tokens (uninstalled app, expired registration, etc.)
  // so the token list doesn't grow stale forever.
  result.responses.forEach((res, i) => {
    if (!res.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(res.error?.code)) {
      console.log('[FCM] Removing dead token:', res.error?.code);
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
  buildDeepLink,
  listForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notificationEmitter,
};