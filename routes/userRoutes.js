const express = require("express");
const jwtMiddleware = require("../middleware/jwtMiddleware");

const router = express.Router();
const { register, logoff, logon } = require("../controllers/userController");

router.route("/register").post(register);
router.route("/logon").post(logon);
router.route("/logoff").post(jwtMiddleware, logoff);

module.exports = router;
