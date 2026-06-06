import { validationResult } from 'express-validator';

export function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const errors = {};
  for (const issue of result.array()) {
    if (issue.type !== 'field') continue;
    errors[issue.path] = issue.msg;
  }

  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors
  });
}
