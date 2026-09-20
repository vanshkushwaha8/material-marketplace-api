const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const notificationService = require('../../service/app/notification.service');

class NotificationController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await notificationService.listForUser({
        userId: request.auth._id,
        page: request.query.page,
        limit: request.query.limit,
        unreadOnly: request.query.unreadOnly === 'true',
      });

      return responseConstants.success(
        response,
        'Notifications fetched',
        result,
        statusCodes.OK
      );
    } catch (error) {
      nextFunction(error);
    }
  };

  unreadCount = async (request, response, nextFunction) => {
    try {
      const count = await notificationService.getUnreadCount(
        request.auth._id
      );

      return responseConstants.success(
        response,
        'Unread count fetched',
        { count },
        statusCodes.OK
      );
    } catch (error) {
      nextFunction(error);
    }
  };

  markRead = async (request, response, nextFunction) => {
    try {
      const notification = await notificationService.markAsRead({
        notificationId: request.params.id,
        userId: request.auth._id,
      });

      if (!notification) {
        return responseConstants.BadRequest(
          response,
          'Notification not found',
          null,
          statusCodes.NOT_FOUND
        );
      }

      return responseConstants.success(
        response,
        'Marked as read',
        notification,
        statusCodes.OK
      );
    } catch (error) {
      nextFunction(error);
    }
  };

  markAllRead = async (request, response, nextFunction) => {
    try {
      const result = await notificationService.markAllAsRead(
        request.auth._id
      );

      return responseConstants.success(
        response,
        'All marked as read',
        result,
        statusCodes.OK
      );
    } catch (error) {
      nextFunction(error);
    }
  };

  // Server-Sent Events stream for real-time notifications.
  stream = (request, response) => {
    const userId = String(request.auth._id);

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    response.write('retry: 5000\n\n');

    const onNotify = (notification) => {
      try {
        response.write(
          `event: notification\ndata: ${JSON.stringify(notification)}\n\n`
        );
      } catch (error) {
        // Client may have disconnected between events.
      }
    };

    const eventName = `notify:${userId}`;

    notificationService.notificationEmitter.on(
      eventName,
      onNotify
    );

    // Keep the SSE connection alive.
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) {
        response.write(':heartbeat\n\n');
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      notificationService.notificationEmitter.off(
        eventName,
        onNotify
      );
    };

    request.on('close', cleanup);
    response.on('close', cleanup);
  };
}

module.exports = new NotificationController();