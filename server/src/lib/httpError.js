export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    this.expose = status < 500;
  }
}

export function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
