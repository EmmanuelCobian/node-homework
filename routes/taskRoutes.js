const express = require("express");

const router = express.Router();
const {
  create,
  index,
  show,
  update,
  deleteTask,
  bulkCreate
} = require("../controllers/taskController");

router.route("/").get(index).post(create);
router.route("/bulk").post(bulkCreate)
router.route("/:id").get(show).patch(update).delete(deleteTask);

module.exports = router;
