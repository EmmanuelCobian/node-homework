const express = require("express");
const jwtMiddleware = require("../middleware/jwtMiddleware")

const router = express.Router();
const {
  getUserAnalytics,
  getUsersWithStats,
  searchTasks,
} = require("../controllers/analyticsController");

router.use(jwtMiddleware)
router.route("/users").get(getUsersWithStats);
router.route("/users/:id").get(getUserAnalytics);
router.route("/tasks/search").get(searchTasks);

module.exports = router;
