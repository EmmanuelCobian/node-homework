const { StatusCodes } = require("http-status-codes");
const { taskSchema, patchTaskSchema } = require("../validation/taskSchema");

const taskCounter = (() => {
  let lastTaskNumber = 0;
  return () => {
    lastTaskNumber += 1;
    return lastTaskNumber;
  };
})();

const validateTaskId = (req, res) => {
  const taskToFind = parseInt(req.params?.id);

  if (!taskToFind) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "The task ID passed is not valid." });
    return null;
  }

  const taskIndex = global.tasks.findIndex(
    (task) => task.id === taskToFind && task.userId === global.user_id.email,
  );

  if (taskIndex === -1) {
    res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "That task was not found" });
    return null;
  }

  return taskIndex;
};

const create = (req, res) => {
  if (!req.body) req.body = {};

  const { error, value } = taskSchema.validate(
    { ...req.body },
    { abortEarly: false },
  );

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const newTask = {
    ...value,
    id: taskCounter(),
    userId: global.user_id.email,
  };
  global.tasks.push(newTask);
  const { userId, ...sanitizedTask } = newTask;
  res.status(StatusCodes.CREATED).json(sanitizedTask);
};

const index = (req, res) => {
  const userTasks = global.tasks.filter(
    (task) => task.userId === global.user_id.email,
  );

  if (userTasks.length === 0) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "User has no tasks" });
  }

  const sanitizedTasks = userTasks.map((task) => {
    const { userId, ...sanitizedTask } = task;
    return sanitizedTask;
  });

  res.json(sanitizedTasks);
};

const show = (req, res) => {
  const taskIndex = validateTaskId(req, res);
  if (taskIndex === null) return;

  const { userId, ...task } = global.tasks[taskIndex];
  res.json(task);
};

const update = (req, res) => {
  if (!req.body) req.body = {};

  const { error, value } = patchTaskSchema.validate(
    { ...req.body },
    { abortEarly: false },
  );

  if (error)
    req.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const taskIndex = validateTaskId(req, res);
  if (taskIndex === null) return;

  global.tasks[taskIndex] = {
    ...global.tasks[taskIndex],
    ...value,
  };

  const { userId, ...task } = global.tasks[taskIndex];
  res.json(task);
};

const deleteTask = (req, res) => {
  const taskIndex = validateTaskId(req, res);
  if (taskIndex === null) return;

  const { userId, ...task } = global.tasks[taskIndex];
  global.tasks.splice(taskIndex, 1);
  res.json(task);
};

module.exports = { index, create, show, update, deleteTask };
