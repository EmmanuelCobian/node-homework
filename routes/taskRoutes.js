const express = require("express")

const router = express.Router()
const { create, index, show, update, deleteTask } = require('../controllers/taskController')

router.route('/').post(create)
router.route('/').get(index)

module.exports = router