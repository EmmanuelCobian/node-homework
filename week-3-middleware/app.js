const express = require("express");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const dogsRouter = require("./routes/dogs");

const app = express();

// Your middleware here
app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]: ${req.method} ${req.path} (${req.requestId})`);
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (req.method === "POST") {
    const contentType = req.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const requestId = req.requestId;
      return res.status(400).json({
        error: "Content-Type must be application/json",
        requestId: requestId,
      });
    }
  }

  next();
});

app.use("/images", express.static(path.join(__dirname, "..", "public/images")));

app.use("/", dogsRouter); // Do not remove this line

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 400 && statusCode < 500) {
    console.warn(`WARN: ${err.name}: ${err.message}`);
  } else {
    console.error(`ERROR: Error, ${err.message}`);
  }

  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    requestId: req.requestId,
  });
});

app.use((req, res, next) => {
  if (!res.headersSent) {
    res
      .status(404)
      .json({ error: "Route not found", requestId: req.requestId });
  }
});

const server = app.listen(3000, () =>
  console.log("Server listening on port 3000"),
);
module.exports = server;
