const { StatusCodes } = require("http-status-codes");
const { taskSchema, patchTaskSchema } = require("../validation/taskSchema");
const prisma = require("../db/prisma");

const parseTaskId = (req, res) => {
  const taskId = Number(req.params?.id);

  if (Number.isNaN(taskId)) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "The task ID passed is not valid." });
    return null;
  }

  return taskId;
};

const create = async (req, res) => {
  if (!req.body) req.body = {};

  const { error, value } = taskSchema.validate(req.body, { abortEarly: false });

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const task = await prisma.task.create({
    data: {
      ...value,
      userId: req.user.id,
    },
    select: { id: true, title: true, isCompleted: true, priority: true },
  });

  return res.status(StatusCodes.CREATED).json(task);
};

const index = async (req, res) => {
  if (!req.user?.id) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "user id must be included" });
  }

  if (req.query.userId && Number(req.query.userId) !== req.user.id) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Not found" });
  }

  const page = Math.max(parseInt(req.query.page), 1) || 1;
  const limit = Math.min(Math.max(parseInt(req.query.limit), 1), 100) || 10;
  const skip = (page - 1) * limit;

  const whereClause = { userId: req.user.id };

  if (req.query.find) {
    whereClause.title = {
      contains: req.query.find,
      mode: "insensitive",
    };
  }

  const tasks = await prisma.task.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      isCompleted: true,
      priority: true,
      createdAt: true,
      User: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    skip: skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const totalTasks = await prisma.task.count({
    where: whereClause,
  });
  const totalPages = Math.ceil(totalTasks / limit);

  const pagination = {
    page: page,
    limit: limit,
    total: totalTasks,
    pages: totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };

  res.json({ tasks, pagination });
};

const show = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
      userId: req.user.id,
    },
    select: {
      id: true,
      title: true,
      isCompleted: true,
      User: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!task) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "That task was not found" });
  }

  res.json(task);
};

const update = async (req, res, next) => {
  if (!req.body) req.body = {};

  const { error, value } = patchTaskSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await prisma.task.update({
      data: value,
      where: {
        id: taskId,
        userId: req.user.id,
      },
      select: { title: true, isCompleted: true, id: true, priority: true },
    });
    return res.json(task);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "The task was not found." });
    } else {
      return next(err);
    }
  }
};

const deleteTask = async (req, res, next) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await prisma.task.delete({
      where: {
        id: taskId,
        userId: req.user.id,
      },
      select: { title: true, isCompleted: true, id: true },
    });
    return res.json(task);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "The task was not found." });
    } else {
      return next(err);
    }
  }
};

const bulkCreate = async (req, res, next) => {
  const { tasks } = req.body;
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "Invalid request data. Expected an array of tasks." });
  }

  const validTasks = [];
  for (const task of tasks) {
    const { error, value } = taskSchema.validate(task);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details,
      });
    }
    validTasks.push({
      title: value.title,
      isCompleted: value.isCompleted || false,
      priority: value.priority || "medium",
      userId: req.user.id,
    });
  }

  try {
    const result = await prisma.task.createMany({
      data: validTasks,
      skipDuplicates: false,
    });

    res.status(201).json({
      message: "success!",
      tasksCreated: result.count,
      totalRequested: validTasks.length,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { index, create, show, update, deleteTask, bulkCreate };
