const { StatusCodes } = require("http-status-codes");

const taskCounter = (() => {
  let lastTaskNumber = 0;
  return () => {
    lastTaskNumber += 1;
    return lastTaskNumber;
  };
})();

const create = (req, res) => {
  const newTask = {
    ...req.body,
    id: taskCounter(),
    userId: global.user_id.email,
  };
  global.tasks.push(newTask);
  const { userId, ...sanitizedTask } = newTask;
  res.status(StatusCodes.CREATED).json(sanitizedTask);
};

const index = () => {};
const show = () => {};
const update = () => {};
const deleteTask = () => {};

module.exports = { index, create, show, update, deleteTask };
