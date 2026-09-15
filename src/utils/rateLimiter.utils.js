const rateLimit = require("express-rate-limit");
const express = require('express');
const authapiLimiter = ({ windowMs = 15 * 60 * 1000, max = 10, message = "Too many requests, please try again later after 15 min." } = {}) => {
    return rateLimit({
        windowMs,
        max,
        handler: (req, res) => {
            return res.status(429).json({
                status: false,
                tomanyAttemots: true,
                message,
            });
        },
    });
};
const rawBodyCapture = express.raw({
    type: '*/*',
    limit: '2mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
});

module.exports = { authapiLimiter, rawBodyCapture };