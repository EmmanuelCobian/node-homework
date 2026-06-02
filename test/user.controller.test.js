require("dotenv").config();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const EventEmitter = require("events");
const waitForRouteHandlerCompletion = require("./waitForRouteHandlerCompletion");
const prisma = require("../db/prisma");
const httpMocks = require("node-mocks-http");
const { register, logoff, logon } = require("../controllers/userController");
const jwtMiddleware = require("../middleware/jwtMiddleware");
const jwt = require("jsonwebtoken");

let saveRes = null;
let saveData = null;

const cookie = require("cookie");

function MockResponseWithCookies() {
  const res = httpMocks.createResponse({
    eventEmitter: EventEmitter,
  });
  res.cookie = (name, value, options = {}) => {
    const serialized = cookie.serialize(name, String(value), options);
    let currentHeader = res.getHeader("Set-Cookie");
    if (currentHeader === undefined) {
      currentHeader = [];
    }
    currentHeader.push(serialized);
    res.setHeader("Set-Cookie", currentHeader);
  };
  return res;
}

beforeAll(async () => {
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(() => {
  prisma.$disconnect();
});

let jwtCookie;

describe("testing logon, register, and logoff", () => {
  it("33. a user can be registered", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: { name: "Bob", email: "bob@sample.com", password: "Pa$$word20" },
    });
    saveRes = MockResponseWithCookies();
    await waitForRouteHandlerCompletion(register, req, saveRes);
    expect(saveRes.statusCode).toBe(201);
  });

  it("34. the user can logon", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: { email: "bob@sample.com", password: "Pa$$word20" },
    });
    saveRes = MockResponseWithCookies();
    await waitForRouteHandlerCompletion(logon, req, saveRes);
    expect(saveRes.statusCode).toBe(200);
  });

  it('35. a string in the cookie array starts with "jwt"', async () => {
    const setCookieArray = saveRes.get("Set-Cookie");
    jwtCookie = setCookieArray.find((cookie) => cookie.startsWith("jwt="));
    expect(jwtCookie).toBeDefined();
  });

  it('36. that string contains "HttpOnly;"', async () => {
    const containsHttpOnly = jwtCookie.includes("HttpOnly;");
    expect(containsHttpOnly).toBe(true);
  });

  it("37. the returned data from the register has the expected name", async () => {
    saveData = saveRes._getJSONData();
    expect(saveData.name).toBe("Bob");
  });

  it("38. the returned data contains a csrfToken", async () => {
    expect(saveData.csrfToken).toBeDefined();
  });

  it("39. you can now logoff", async () => {
    const req = httpMocks.createRequest({ method: "POST" });
    saveRes = MockResponseWithCookies();
    await waitForRouteHandlerCompletion(logoff, req, saveRes);
  });

  it("40. the logoff clears the cookie", async () => {
    const setCookieArray = saveRes.get("Set-Cookie");
    jwtCookie = setCookieArray.find((cookie) => cookie.startsWith("jwt="));
    expect(jwtCookie).toContain("Jan 1970");
  });

  it("41. a logon attempt with a bad password returns a 401", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: { email: "bob@sample.com", password: "bad password" },
    });
    saveRes = MockResponseWithCookies();
    await waitForRouteHandlerCompletion(logon, req, saveRes);
    expect(saveRes.statusCode).toBe(401);
  });

  it("42. you can't register with an email address that is already registered", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
      body: {
        name: "Emmanuel",
        email: "bob@sample.com",
        password: "bad password",
      },
    });
    saveRes = MockResponseWithCookies();
    await waitForRouteHandlerCompletion(register, req, saveRes);
    expect(saveRes.statusCode).toBe(400);
  });
});

describe("Testing JWT middleware", () => {
  it("61. jwtMiddleware returns a 401 if the JWT cookie is not present in the req", async () => {});

  it("62. Returns a 401 if the JWT is invalid", async () => {
    const req = httpMocks.createRequest({
      method: "POST",
    });
    saveRes = MockResponseWithCookies();
    const jwtCookie = jwt.sign({ id: 5, csrfToken: "badToken" }, "badSecret", {
      expiresIn: "1h",
    });
    req.cookies = { jwt: jwtCookie };
    await waitForRouteHandlerCompletion(jwtMiddleware, req, saveRes);
    expect(saveRes.statusCode).toBe(401);
  });

  it("63. returns a 401 if the JWT is valid but the CSRF token isn't", async () => {});

  it("64. calls next() if both the token and the jwt are good", async () => {});

  it("65. if both the token and the jwt are good, req.user.id has the appropriate value", async () => {});
});
