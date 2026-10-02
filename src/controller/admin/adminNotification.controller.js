const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminNotificationService = require('../../service/admin/adminNotification.service');

// Every endpoint is scoped to the calling admin's RBAC permissions inside
// the service — an admin only ever sees/marks notifications they may see.
class AdminNotificationController {
  list = async (request, response, nextFunction) => {
    try {
      const result = await adminNotificationService.list({
        admin: request.auth,
        page: request.query.page,
        limit: request.query.limit,
        unreadOnly: request.query.unreadOnly === 'true',
        severity: request.query.severity,
        category: request.query.category,
      });
      return responseConstants.success(response, 'Notifications fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  unreadCount = async (request, response, nextFunction) => {
    try {
      const result = await adminNotificationService.unreadCounts(request.auth);
      return responseConstants.success(response, 'Unread count fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  markRead = async (request, response, nextFunction) => {
    try {
      const doc = await adminNotificationService.markRead({ admin: request.auth, notificationId: request.params.id });
      if (!doc) return responseConstants.BadRequest(response, 'Notification not found', null, statusCodes.NOT_FOUND);
      return responseConstants.success(response, 'Marked as read', adminNotificationService.present(doc, request.auth._id), statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  markAllRead = async (request, response, nextFunction) => {
    try {
      const result = await adminNotificationService.markAllRead(request.auth);
      return responseConstants.success(response, 'All marked as read', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  // Server-Sent Events: pushes each new notification this admin may see.
  // Permissions are resolved once at connect; a role change applies on the
  // next reconnect (EventSource reconnects automatically).
  stream = async (request, response) => {
    const admin = request.auth;
    let visibility;
    try {
      visibility = await adminNotificationService.getVisibility(admin);
    } catch {
      return response.status(500).end();
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 5000\n\n');

    const onNotify = (notification) => {
      if (!adminNotificationService.canSee(visibility, notification)) return;
      try {
        response.write(`event: notification\ndata: ${JSON.stringify(adminNotificationService.present(notification, admin._id))}\n\n`);
      } catch { /* client went away */ }
    };
    const { adminNotificationEmitter, ADMIN_EVENT } = adminNotificationService;
    adminNotificationEmitter.on(ADMIN_EVENT, onNotify);
    const heartbeat = setInterval(() => { if (!response.writableEnded) response.write(':heartbeat\n\n'); }, 25000);
    const cleanup = () => { clearInterval(heartbeat); adminNotificationEmitter.off(ADMIN_EVENT, onNotify); };
    request.on('close', cleanup);
    response.on('close', cleanup);
  };
}

module.exports = new AdminNotificationController();
