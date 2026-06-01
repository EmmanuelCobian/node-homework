require("dotenv").config();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const EventEmitter = require("events");
const prisma = require("../db/prisma");
const httpMocks = require("node-mocks-http");
const {
  index,
  show,
  create,
  update,
  deleteTask,
} = require("../controllers/taskController");
const { register } = require("../controllers/userController");
const waitForRouteHandlerCompletion = require("./waitForRouteHandlerCompletion");

let user1 = null;
let user2 = null;
let saveRes = null;
let saveData = null;
let saveTaskId = null;

beforeAll(async () => {
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  user1 = await prisma.user.create({
    data: { name: "Bob", email: "bob@sample.com", hashedPassword: "nonsense" },
  });
  user2 = await prisma.user.create({
    data: {
      name: "Alice",
      email: "alice@sample.com",
      hashedPassword: "nonsense",
    },
  });
});

afterAll(() => {
  prisma.$disconnect();
});

describe("testing task creation", () => {
  it("14. cant create a task without a user id", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: { title: "first task" },
    });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    expect.assertions(1);
    try {
      await waitForRouteHandlerCompletion(create, req, res);
    } catch (e) {
      expect(e.name).toBe("TypeError");
    }
  });

  it("15. you can't create a task with a bogus user id", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: { title: "first task" },
    });
    req.user = { id: "bogus id" };

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    expect.assertions(1);

    try {
      await waitForRouteHandlerCompletion(create, req, res);
    } catch (e) {
      expect(e.name).toBe("PrismaClientValidationError");
    }
  });

  it("16. if you have a valid user id, create() succeeds", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: { title: "first task" },
    });
    req.user = { id: user1.id };

    saveRes = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(create, req, saveRes);
    expect(saveRes.statusCode).toBe(201);
    saveData = saveRes._getJSONData();
    saveTaskId = saveData.id;
  });

  it("17. the object returned from the create() call has the expected title", async () => {
    expect(saveData.title).toBe("first task");
  });

  it("18. the object has the right value for isCompleted", async () => {
    expect(saveData.isCompleted).toBe(false);
  });

  it("19. the object does not have any value for userId", async () => {
    expect(saveData.userId).toBeUndefined();
  });
});

describe("test getting created tasks", () => {
  it("20. you can't get a list of tasks without a user id", async () => {
    const req = httpMocks.createRequest({ method: "GET" });
    req.user = {};

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(index, req, res);
    expect(res.statusCode).toBe(400);
  });

  it("21. if you use user1's id, the call returns a 200 status", async () => {
    const req = httpMocks.createRequest({ method: "GET" });
    req.user = { id: user1.id };
    saveRes = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(index, req, saveRes);
    expect(saveRes.statusCode).toBe(200);
  });

  it("22. the returned object has a tasks array of length 1", async () => {
    saveData = saveRes._getJSONData();
    expect(saveData.tasks.length).toBe(1);
  });

  it("23. the title in the first array object is as expected", async () => {
    expect(saveData.tasks[0].title).toBe("first task");
  });

  it("24. the first array object does not contain a userId", async () => {
    expect(saveData.tasks[0].userId).toBeUndefined();
  });

  it("25. if you get the list of tasks using the userId from user2, you get a 404", async () => {
    const req = httpMocks.createRequest({
      method: "GET",
      query: { userId: user1.id },
    });
    req.user = { id: user2.id };

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(index, req, res);
    expect(res.statusCode).toBe(404);
  });

  it("26. you can retrieve the created task using show()", async () => {
    const req = httpMocks.createRequest({
      method: "GET",
      params: { id: saveTaskId.toString() },
    });
    req.user = { id: user1.id };

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(show, req, res);
    expect(res.statusCode).toBe(200);
  });

  it("27. user2 can't retrieve this task entry. you should get a 404", async () => {
    const req = httpMocks.createRequest({
      method: "GET",
      params: { id: saveTaskId.toString() },
    });
    req.user = { id: user2.id };

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(show, req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("test updating and deleting tasks", () => {
  it("28. user1 can set the task corresponding to saveTaskId to isCompleted: true", async () => {
    const req = httpMocks.createRequest({
      method: "PATCH",
      params: { id: saveTaskId.toString() },
      body: { isCompleted: true },
    });
    req.user = { id: user1.id };

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(update, req, res);
    expect(res.statusCode).toBe(200);
  });

  it("29. user2 can't do this", async () => {
    const req = httpMocks.createRequest({
      method: "PATCH",
      params: { id: saveTaskId.toString() },
      body: { isCompleted: true },
    });
    req.user = { id: user2.id };

    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await waitForRouteHandlerCompletion(update, req, res);
    expect(res.statusCode).toBe(404);
  });

  it("30. user2 can't delete this task", async () => {});

  it("31. user1 can delete this task", async () => {});

  it("32. retrieving user1's tasks now returns a 404", async () => {});
});
