export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string) => new AppError(400, code, message);
export const unauthorized = (code = 'unauthorized', message?: string) => new AppError(401, code, message);
export const forbidden = (code: string, message?: string) => new AppError(403, code, message);
export const notFound = (code = 'not_found', message?: string) => new AppError(404, code, message);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);
export const tooMany = (code: string, message?: string) => new AppError(429, code, message);
