const { StatusCodes } = require("http-status-codes");
const prisma = require("../db/prisma");

const getUserAnalytics = async (req, res) => {
  const userId = Number(req.params?.id);

  if (Number.isNaN(userId)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: "The user ID passed is not valid." });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json({ message: "User doesn't exist" });
  }

  const taskStats = await prisma.task.groupBy({
    by: ["isCompleted"],
    where: { userId: userId },
    _count: {
      id: true,
    },
  });

  const recentTasks = await prisma.task.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      isCompleted: true,
      priority: true,
      createdAt: true,
      userId: true,
      User: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weeklyProgress = await prisma.task.groupBy({
    by: ["createdAt"],
    where: {
      userId: userId,
      createdAt: { gte: oneWeekAgo },
    },
    _count: { id: true },
  });

  res.status(200).json({ taskStats, recentTasks, weeklyProgress });
  return;
};

const getUsersWithStats = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const usersRaw = await prisma.user.findMany({
    include: {
      Task: {
        where: { isCompleted: false },
        select: { id: true },
        take: 5,
      },
      _count: {
        select: {
          Task: true,
        },
      },
    },
    skip: skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const users = usersRaw.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    _count: user._count,
    Task: user.Task,
  }));

  const totalUsers = await prisma.user.count();
  const totalPages = Math.ceil(totalUsers / limit);

  const pagination = {
    page,
    limit,
    total: totalUsers,
    pages: totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };

  return res.status(200).json({ users, pagination });
};

const searchTasks = async (req, res, next) => {};

module.exports = { getUserAnalytics, getUsersWithStats, searchTasks };
