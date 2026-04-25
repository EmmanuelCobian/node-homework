# Week 3: Express Middleware

## 1. Architecture of an Express Application

### The Core Components

An Express app is built from four main layers that work together in a linear pipeline:

| Component          | Role                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| **App instance**   | The central object — created via `express()`, owns all config and the middleware stack |
| **Middleware**     | Functions that intercept every (or some) request before it reaches a route             |
| **Route handlers** | Functions that respond to a specific method + path combination                         |
| **Error handlers** | Special 4-argument middleware `(err, req, res, next)` that catches thrown errors       |

### How They Wire Together

```js
const express = require("express");
const app = express(); // 1. App instance

// 2. Middleware — runs on every request
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next(); // hand off to the next layer
});

// 3. Route handler — runs only on GET /dogs
app.get("/dogs", (req, res) => {
  res.json({ dogs: [] });
});

// 4. Error handler — must have exactly 4 params
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});
```

### Order of Middleware Execution

Express processes middleware in the order it is registered. From the dogs app, the `requestId` middleware runs first so all subsequent middleware and handlers can reference `req.requestId`:

```js
// app.js
app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]: ${req.method} ${req.path} (${req.requestId})`);
  next();
});
```

If those two were swapped, `req.requestId` would be `undefined` in the logger.

### Middleware vs. Route Handlers

The key distinction is **specificity**:

```js
// Middleware: matches ALL methods and paths (unless scoped)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// Route handler: matches one method + path
app.get("/dogs", (req, res) => {
  res.json(dogs);
});
```

A middleware _can_ terminate the request early (like the Content-Type check below) — but when it does, it acts more like a guard than a pass-through:

```js
app.use((req, res, next) => {
  if (req.method === "POST") {
    const contentType = req.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return res.status(400).json({
        error: "Content-Type must be application/json",
        requestId: req.requestId,
      });
    }
  }
  next();
});
```

## 2. Handling HTTP Requests and Responses

### Structure of an HTTP Request

Every incoming request carries:

| Part                        | Example                                 |
| --------------------------- | --------------------------------------- |
| `req.method`                | `"GET"`, `"POST"`                       |
| `req.path`                  | `"/dogs"`                               |
| `req.query`                 | `{ name: "Lucy" }`                      |
| `req.headers` / `req.get()` | `req.get("content-type")`               |
| `req.body`                  | `{ name: "Emmanuel", password: "123" }` |

### Response Methods

```js
// Send JSON (sets Content-Type: application/json automatically)
res.json({ dogs });

// Send plain text or HTML
res.send("OK");

// Chain status + body in one line
res.status(404).json({ error: "Route not found", requestId: req.requestId });
```

## 3. REST and Express

### REST Principles

REST is an architectural style for APIs built on top of HTTP. Its core constraints:

- **Stateless** — each request carries all the information needed to process it; no session state is stored on the server between requests.
- **Uniform interface** — resources are identified by URLs; interaction happens through standard HTTP methods.
- **Resource-based** — you model things (dogs, users, tasks), not actions.

### HTTP Methods → CRUD Operations

| HTTP Method     | CRUD   | Usage                                 |
| --------------- | ------ | ------------------------------------- |
| `GET`           | Read   | Fetch a resource or list              |
| `POST`          | Create | Create a new resource                 |
| `PUT` / `PATCH` | Update | Replace / partially update a resource |
| `DELETE`        | Delete | Remove a resource                     |

### Designing RESTful Endpoints

Resources are nouns in the URL; the method expresses the action:

```
GET    /dogs          → list all dogs
GET    /dogs/:id      → get one dog
POST   /dogs          → create a dog
PATCH  /dogs/:id      → update a dog
DELETE /dogs/:id      → delete a dog
```

From the dogs router:

```js
// GET /dogs — list all dogs (read, no body needed)
router.get("/dogs", (req, res) => {
  res.json(dogs);
});

// POST /adopt — create an adoption request (write, body required)
router.post("/adopt", (req, res) => {
  const { name, address, email, dogName } = req.body;

  if (!name || !email || !dogName) {
    throw new ValidationError("Missing required fields");
  }

  const dog = dogs.find((d) => d.name === dogName);
  if (!dog || dog.status !== "available") {
    throw new NotFoundError("Dog not found or not available");
  }

  return res.status(201).json({
    message: `Adoption request received. We will contact you at ${email} for further details.`,
  });
});
```

### HTTP Status Codes

| Range | Meaning      | Common codes                                                            |
| ----- | ------------ | ----------------------------------------------------------------------- |
| 2xx   | Success      | `200 OK`, `201 Created`, `204 No Content`                               |
| 4xx   | Client error | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found` |
| 5xx   | Server error | `500 Internal Server Error`                                             |
