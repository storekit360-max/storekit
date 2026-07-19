'use strict';

const crypto = require('crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function requestContext(req, res, next) {
  const supplied = String(req.headers['x-request-id'] || '').trim();
  req.correlationId = REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
  req.requestStartedAt = process.hrtime.bigint();
  res.setHeader('X-Request-ID', req.correlationId);
  next();
}

module.exports = { requestContext, REQUEST_ID_PATTERN };
