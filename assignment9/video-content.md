# Week 9: Automated Testing

## 1. How do you write effective unit tests?

### The Validation Test File

The file is organized into three `describe` blocks, one per schema under test:

```js
const { userSchema } = require("../validation/userSchema");
const { taskSchema, patchTaskSchema } = require("../validation/taskSchema");

describe("user object validation tests", () => { ... });
describe("task validation tests", () => { ... });
describe("task patch validation tests", () => { ... });
```

Grouping by schema keeps the output readable.

### Testing Both Valid and Invalid Inputs

A schema test is only meaningful if it checks both directions: bad input must be rejected, and good input must pass through untouched. The file does both.

The rejection case, from [test/validation.test.js:25-33](test/validation.test.js#L25-L33):

```js
it("3. the user schema does not accept an invalid email", () => {
  const { error } = userSchema.validate(
    { name: "Bob", email: "bademail.com", password: "Password123!@#" },
    { abortEarly: false },
  );
  expect(
    error.details.find((detail) => detail.context.key == "email"),
  ).toBeDefined();
});
```

And the acceptance case, from [test/validation.test.js:65-71](test/validation.test.js#L65-L71):

```js
it("7. the name must be valid (3 to 30 characters)", () => {
  const { error } = userSchema.validate(
    { name: "Emmanuel", email: "bob@sample.com", password: "Password123!@#" },
    { abortEarly: false },
  );
  expect(error).toBeUndefined();
});
```

A schema that rejects everything would pass test 3 but fail test 7. A schema that accepts everything passes 7 but fails 3. You need both ends to pin the behavior down.

### Walking Through a Specific Test Case

`userSchema.validate(...)` returns an object with two properties: `value` (the cleaned-up input) and `error`. When validation fails, `error.details` is an array and each entry carries a `context.key` naming the field that failed.

The assertion doesn't just check whether something failed, It checks that the email field *specifically* failed:

```js
expect(
  error.details.find((detail) => detail.context.key == "email"),
).toBeDefined();
```

`abortEarly: false` is what makes this precise. By default Joi stops at the first error; with `abortEarly: false` it collects every violation, so a test asserting on `email` won't accidentally pass because the `password` rule tripped first. The `.find(...)` then digs out the one detail we care about. `toBeDefined()` passes only if an email-keyed error actually exists.

### Edge Cases and Error Conditions

The task schema tests cover the cases where validation doesn't just pass or fail, but transforms the input. From [test/validation.test.js:99-113](test/validation.test.js#L99-L113):

```js
it("10. if an isCompleted value is not specified ... a default of false is provided", () => {
  const { value } = taskSchema.validate(
    { title: "complete assignment", priority: "medium" },
    { abortEarly: false },
  );
  expect(value.isCompleted).toBe(false);
});

it("11. if isCompleted in the provided object has the value true, it remains true", () => {
  const { value } = taskSchema.validate(
    { title: "complete assignment", isCompleted: true, priority: "medium" },
    { abortEarly: false },
  );
  expect(value.isCompleted).toBe(true);
});
```

These assert on `value`, not `error` — they're checking that the schema fills in a default of `false` when the field is omitted, and preserves an explicit `true`. The patch-schema tests (12 and 13) cover the mirror-image edge case: `patchTaskSchema` must *not* require a title (because a PATCH is partial), and must leave `isCompleted` `undefined` when it isn't supplied, so a partial update doesn't accidentally stomp an existing value.

## 2. How do you test Express API endpoints with supertest?

### The API Test File and supertest Setup

Unlike the validation tests, these exercise the actual Express app, real middleware, real Prisma queries against a test database. The setup, from [test/user.function.test.js:1-18](test/user.function.test.js#L1-L18):

```js
require("dotenv").config();
const request = require("supertest");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const prisma = require("../db/prisma");
let agent;
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
```

Three things are doing the heavy lifting:

- **`process.env.DATABASE_URL = process.env.TEST_DATABASE_URL`** redirects every query to a throwaway test database, so these tests never touch real data.
- **`beforeAll`** wipes tasks and users so each run starts from a clean, known state.
- **`request.agent(app)`** A plain `request(app)` forgets cookies between calls; an *agent* persists them, which is what lets us log in once and stay logged in across requests, exactly like a browser.

### Testing HTTP Methods and Status Codes

supertest wraps the app and lets you fire real HTTP requests at it. From [test/user.function.test.js:23-31](test/user.function.test.js#L23-L31):

```js
it("46. it creates the user entry", async () => {
  const newUser = {
    name: "John Deere",
    email: "jdeere@example.com",
    password: "Pa$$word20",
  };
  saveRes = await agent.post("/api/users/register").send(newUser);
  expect(saveRes.status).toBe(201);
});
```

`agent.post(...).send(...)` issues a real `POST` with a JSON body; `saveRes.status` is the HTTP status code that came back. The assertion checks for `201 Created`. Other tests in the file check `200` on a successful logon and `401` once logged out, so the suite pins down the *exact* status each route returns.

### Authentication and Protected Routes

From [test/user.function.test.js:41-63](test/user.function.test.js#L41-L63):

```js
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
```

This is the test that proves auth actually works:

1. After logon, `/api/tasks` returns `200` because the agent is carrying the JWT cookie automatically.
2. Logoff has to `.set("X-CSRF-TOKEN", csrfToken)` — the token grabbed from the logon response body — because `logoff` is a state-changing `POST` and the middleware demands a matching CSRF header.
3. The final assertion is the important one: after logoff, the *same* protected route now returns `401`. That confirms the cookie was genuinely cleared, not just on paper.

### Request/Response Data Validation

Status codes aren't enough, the response body has to be right too. Supertest parses JSON into `res.body`, so the tests can assert on its shape. From [test/user.function.test.js:33-39](test/user.function.test.js#L33-L39):

```js
it("47. registration returns an object with the expected name", () => {
  expect(saveRes.body.user.name).toBe("John Deere");
});

it("48. test that the returned object includes a csrfToken", () => {
  expect(saveRes.body.csrfToken).toBeDefined();
});
```

Test 47 confirms the registered user's name round-tripped correctly; test 48 confirms the CSRF token the frontend depends on is actually present in the payload. Together they verify the endpoint returns the right data in the right shape, not just the right status.

## 3. What testing strategies help ensure comprehensive coverage?

### The Three Layers of Tests

This project deliberately uses three different *kinds* of test, each with a different cost and a different blind spot:

| Layer | File | What it exercises | Speed |
| ----- | ---- | ----------------- | ----- |
| **Unit (validation)** | [test/validation.test.js](test/validation.test.js) | Joi schemas in isolation, no I/O | Fastest |
| **Unit (controllers)** | [test/taskController.test.js](test/taskController.test.js), [test/user.controller.test.js](test/user.controller.test.js) | Controller functions with mocked req/res, real DB | Fast |
| **API / functional** | [test/user.function.test.js](test/user.function.test.js) | The whole Express stack over real HTTP | Slowest |

No single layer is enough on its own. Unit tests are fast and pinpoint exactly what broke, but they don't prove the pieces are wired together. API tests prove the whole thing works end-to-end, but when one fails you still have to hunt for the cause. Running all three gives you both precise failure messages *and* confidence the assembled app behaves.

### Mocking Without a Real Server

The controller tests need to call handlers directly without booting Express. They use `node-mocks-http` to fabricate `req` and `res`, plus a small helper, [test/waitForRouteHandlerCompletion.js](test/waitForRouteHandlerCompletion.js):

```js
const waitForRouteHandlerCompletion = async (func, req, res) => {
  let next;
  const promise = new Promise((resolve, reject) => {
    next = jest.fn((error) => {
      if (error) return reject(error);
      resolve();
    });
    res.on("finish", () => resolve());
  });
  await func(req, res, next);
  await promise;
  return next;
};
```

The helper wraps both in a promise so the test can `await` the handler's *actual* completion instead of guessing. It also returns the mocked `next` so tests can assert it was called — which is how the JWT-middleware test confirms a valid token passes through.
