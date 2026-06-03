require("dotenv").config();
const request = require("supertest");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const prisma = require("../db/prisma");
let agent;
let saveRes;
const { app, server } = require("../app");

beforeAll(async () => {
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  agent = request.agent(app);
});

afterAll(async () => {
  prisma.$disconnect();
  server.close();
});

describe("register a user ", () => {
  let saveRes = null;
  let csrfToken = null;
  it("46. it creates the user entry", async () => {
    const newUser = {
      name: "John Deere",
      email: "jdeere@example.com",
      password: "Pa$$word20",
    };
    saveRes = await agent.post("/api/users/register").send(newUser);
    expect(saveRes.status).toBe(201);
  });

  it("47. registration returns an object with the expected name", async () => {
    expect(saveRes.body.user.name).toBe("John Deere");
  });

  it("48. test that the returned object includes a csrfToken", async () => {
    expect(saveRes.body.csrfToken).toBeDefined();
  });

  it("49. you can logon as the newly registered user", async () => {
    const userInfo = { email: "jdeere@example.com", password: "Pa$$word20" };
    saveRes = await agent.post("/api/users/logon").send(userInfo);
    csrfToken = saveRes.body.csrfToken;
    expect(saveRes.status).toBe(200);
  });

  it("50. verify that you are logged in: /api/tasks should not return a 401", async () => {
    saveRes = await agent.get("/api/tasks");
    expect(saveRes.status).toBe(200);
  });

  it("51. verify that you can log out", async () => {
    saveRes = await agent
      .post("/api/users/logoff")
      .set("X-CSRF-TOKEN", csrfToken);
    expect(saveRes.status).toBe(200);
  });

  it("52. make sure that you are really logged out: /api/tasks should now return a 401", async () => {
    saveRes = await agent.get("/api/tasks");
    expect(saveRes.status).toBe(401);
  });
});
