const { StatusCodes } = require("http-status-codes");
const { taskSchema, patchTaskSchema } = require("../validation/taskSchema");
const pool = require("../db/pg-pool");

const validateTaskId = (req, res) => {
  const taskToFind = parseInt(req.params?.id);

  if (!taskToFind) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "The task ID passed is not valid." });
    return null;
  }

  return taskToFind;
};

const create = async (req, res) => {
  if (!req.body) req.body = {};

  const { error, value } = taskSchema.validate(req.body, { abortEarly: false });

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const result = await pool.query(
    `INSERT INTO tasks (title, is_completed, user_id)
    VALUES ( $1, $2, $3 )
    RETURNING id, title, is_completed`,
    [value.title, value.isCompleted, global.user_id],
  );
  const task = result.rows[0];

  return res.status(StatusCodes.CREATED).json(task);
};

const index = async (req, res) => {
  const tasks = await pool.query(
    `SELECT id, title, is_completed FROM tasks
    WHERE user_id = $1`,
    [global.user_id],
  );

  if (tasks.rows.length === 0) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "User has no tasks" });
  }

  res.json(tasks.rows);
};

const show = async (req, res) => {
  const taskId = validateTaskId(req, res);
  if (taskId === null) return;

  const task = await pool.query(
    `SELECT id, title, is_completed FROM tasks
    WHERE id = $1 AND user_id = $2`,
    [taskId, global.user_id],
  );

  if (task.rows.length === 0) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "That task was not found" });
  }

  res.json(task.rows[0]);
};

const update = async (req, res) => {
  if (!req.body) req.body = {};

  const { error, value } = patchTaskSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const taskId = validateTaskId(req, res);
  if (taskId === null) return;

  let keys = Object.keys(value);
  keys = keys.map((key) => (key === "isCompleted" ? "is_completed" : key));
  const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
  const idParm = `$${keys.length + 1}`;
  const userParm = `$${keys.length + 2}`;
  const updatedTask = await pool.query(
    `UPDATE tasks SET ${setClauses}
    WHERE id = ${idParm} AND user_id = ${userParm}
    RETURNING id, title, is_completed`,
    [...Object.values(value), req.params.id, global.user_id],
  );

  if (updatedTask.rows.length === 0) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "That task was not found" });
  }

  res.json(updatedTask.rows[0]);
};

const deleteTask = async (req, res) => {
  const taskId = validateTaskId(req, res);
  if (taskId === null) return;

  const task = await pool.query(
    `DELETE FROM tasks
    WHERE id = $1 AND user_id = $2
    RETURNING id, title, is_completed`,
    [taskId, global.user_id],
  );

  if (task.rows.length === 0) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "That task was not found" });
  }

  res.json(task.rows[0]);
};

module.exports = { index, create, show, update, deleteTask };
