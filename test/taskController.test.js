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
    saveRes = httpMocks.createResponse({ eventEmitter: EventEmitter });
    expect.assertions(1);
    try {
      await waitForRouteHandlerCompletion(create, req, saveRes);
    } catch (e) {
      expect(e.name).toBe("TypeError");
    }
  });

  it("15. you can't create a task with a bogus user id.", async () => {});

  it("16. if you have a valid user id, create() succeeds.", async () => {});

  it("17. the object returned from the create() call has the expected title.", async () => {});

  it("18. the object has the right value for isCompleted.", async () => {});

  it("19. the object does not have any value for userId.", async () => {});
});
