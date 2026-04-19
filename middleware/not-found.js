const { StatusCodes } = require("http-status-codes");

const notFoundHandlerMiddleware = (req, res, next) => {
  if (!res.headersSent) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .send(`You can't do a ${req.method} for ${req.url}`);
  }
};

module.exports = notFoundHandlerMiddleware;
