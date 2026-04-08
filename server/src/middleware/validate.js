/**
 * Input validation middleware
 * Provides common validation helpers for route handlers.
 */

function validateBody(requiredFields = []) {
  return (req, res, next) => {
    const missing = requiredFields.filter(f => {
      const val = req.body[f];
      return val === undefined || val === null || val === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    next();
  };
}

function validateId(req, res, next) {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid ID parameter' });
  }
  req.params.id = id;
  next();
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // Remove null bytes and trim
  return str.replace(/\0/g, '').trim();
}

function sanitizeBody(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (typeof req.body[field] === 'string') {
        req.body[field] = sanitizeString(req.body[field]);
      }
    }
    next();
  };
}

module.exports = { validateBody, validateId, sanitizeString, sanitizeBody };
