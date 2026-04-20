class ValidationError extends Error {
  constructor(message) {
    super(message); // Call the parent Error constructor with the message
    this.name = "ValidationError"; // Set the error name (used for error identification)
    this.statusCode = 400; // Add a custom property for the HTTP status code
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnauthorizedError";
    this.statusCode = 401;
  }
}

module.exports = {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
};
