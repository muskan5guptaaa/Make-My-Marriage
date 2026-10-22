// An error the API reports to the client as { error: { code, message, fields } }.
export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new AppError(400, 'invalid_input', message, fields);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'unauthorized', message);
export const forbidden = (code, message) => new AppError(403, code, message);
export const notFoundError = (code, message) => new AppError(404, code, message);
export const conflict = (code, message, fields) => new AppError(409, code, message, fields);
