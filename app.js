const express = require("express");
const prisma = require("./db/prisma");
const errorHandler = require("./middleware/error-handler");
const notFoundHandler = require("./middleware/not-found");
const authMiddleware = require("./middleware/auth");
const userRouter = require("./routes/userRoutes");
const taskRouter = require("./routes/taskRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const { StatusCodes } = require("http-status-codes");
const app = express();

global.user_id = null;

app.use(express.json({ limit: "1kb" }));

app.use((req, res, next) => {
  console.log("Request Method:", req.method);
  console.log("Request Path:", req.path);
  console.log("Request Query:", req.query);
  next();
});

app.use("/api/analytics", authMiddleware, analyticsRoutes);

app.use("/api/users", userRouter);

app.use("/api/tasks", authMiddleware, taskRouter);

app.get("/", (req, res) => {
  res.json({ message: "Hello, World!" });
});

app.post("/testpost", (req, res) => {
  res.json({ message: "Test POST received" });
});

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: `db not connected, error: ${err.message}` });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT || 3000;
const server = app.listen(port, () =>
  console.log(`Server is listening on port ${port}...`),
);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error("Server error:", err);
  }
  process.exit();
});

let isShuttingDown = false;
async function shutdown(code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("Shutting down gracefully...");
  try {
    await prisma.$disconnect();
    console.log("Prisma disconnected");
    await new Promise((resolve) => server.close(resolve));
    console.log("HTTP server closed.");
  } catch (err) {
    console.error("Error during shutdown:", err);
    code = 1;
  } finally {
    console.log("Exiting process...");
    process.exit(code);
  }
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  shutdown(1);
});

module.exports = { app, server };
