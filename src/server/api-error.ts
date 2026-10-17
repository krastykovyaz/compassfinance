// An error whose message is written for the person using the app, and may
// therefore be sent back to the browser as-is, with the given HTTP status.
// Every other error that reaches withApiErrorHandling (database, crypto,
// provider, programming errors) is treated as internal: its text can name
// tables, fields, hosts or the failing request, so it is logged on the
// server and the client gets a generic message. Throw this, not a plain
// Error, when the message is meant to be shown.
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
