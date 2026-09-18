const mongoose = require('mongoose');
const paymentWebhookEventSchema = require('../schema/paymentWebhookEvent.schema');
const paymentWebhookEventModel = mongoose.model('payment_webhook_events', paymentWebhookEventSchema);
module.exports = paymentWebhookEventModel;