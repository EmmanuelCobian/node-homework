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
      userId: global.user_id,
    },
    select: { id: true, title: true, isCompleted: true, priority: true },
  });

  return res.status(StatusCodes.CREATED).json(task);
};

const index = async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: {
      userId: global.user_id,
    },
    select: { title: true, isCompleted: true, id: true },
  });

  if (tasks.length === 0) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "User has no tasks" });
  }

  res.json(tasks);
};

const show = async (req, res) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
      userId: global.user_id,
    },
    select: { id: true, title: true, isCompleted: true },
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
        userId: global.user_id,
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

const deleteTask = async (req, res, next) => {
  const taskId = parseTaskId(req, res);
  if (taskId === null) return;

  try {
    const task = await prisma.task.delete({
      where: {
        id: taskId,
        userId: global.user_id,
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

module.exports = { index, create, show, update, deleteTask };
