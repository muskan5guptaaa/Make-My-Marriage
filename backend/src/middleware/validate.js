import { badRequest } from '../utils/AppError.js';

// Replaces req.body with the parsed value, or fails with field messages:
// { error: { code: "invalid_input", fields: { email: "Enter a valid email address." } } }
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw badRequest('Some fields need fixing.', fields);
  }
  req.body = result.data;
  next();
};
