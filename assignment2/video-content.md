# Event Handlers, HTTP, and Express

## What is the EventEmitter class? What is its purpose?

The EventEmitter class allows communication between different parts of an application. Using listeners to trigger emitter events, the class allows programmers to write programs where one function communicates with many others.

Listeners for a given event are called in the order they register. This means that events are emitted synchronnously.

```js
const EventEmitter = require("events");
const emitter = new EventEmitter();

emitter.on("tell", (message) => {
  // this registers a listener
  console.log("listener 1 got a tell message:", message);
});

emitter.on("tell", (message) => {
  // listener 2.  You don't want too many in the chain
  console.log("listener 2 got a tell message:", message);
});

emitter.on("error", (error) => {
  // a listener for errors.  It's a good idea to have one per emitter
  console.log("The emitter reported an error.", error.message);
});

emitter.emit("tell", "Hi there!");
emitter.emit("tell", "second message");
emitter.emit("tell", "all done");
```

The code above results in the following result:

```
listener 1 got a tell message: Hi there!
listener 2 got a tell message: Hi there!
listener 1 got a tell message: second message
listener 2 got a tell message: second message
listener 1 got a tell message: all done
listener 2 got a tell message: all done
```

## What are the differences between Node's HTTP module and Express.js?

Express.js handles many low-level details like parting bodies, setting headers, and routing automaticaly. This means that the developer gets to enjoy a better interface with the nitty gritty details abstracted away for convenience.

## What is middleware?

As the name implies, middleware functions sit in between request calls and they handle some initial processing on the request. These functions always return a response to the request. Functions then call `next()`, which might call another middleware function, or might call a route handler.

## What are the different HTTP methods?

**GET** - Retrieves data and is read only

**POST** - Sends data to create a new entry, like submitting a form or creating a new account

**PUT** - Replaces an existing entry with provided data

**PATCH** - Partially updates an existing entry. Only the fields you send are changed, the rest stay the same

**DELETE** - Removes a specific entry

## How do you parse input?

In Express, you need middleware to parse incoming request bodies before you can access them via `req.body`.

### Parsing Request Bodies

Express includes two built-in middleware functions for this:

- `express.json()` — parses requests with a `Content-Type: application/json` header
- `express.urlencoded()` — parses form submissions with a `Content-Type: application/x-www-form-urlencoded` header

You add these at the top of your middleware calls, before the routes. Without these, `req.body` will be `undefined`.

```js
app.use(express.json());
```

### Parsing Request Headers

Headers are already parsed by Express automatically. You can access them via `req.headers`.

```js
app.get("/", (req, res) => {
  const token = req.headers["token"];

  // OR

  const token = req.get("token");
});
```

## How do you handle errors and status codes?

### Common HTTP Status Codes

| Range | Meaning      | Examples                                                        |
| ----- | ------------ | --------------------------------------------------------------- |
| 2xx   | Success      | 200 OK, 201 Created, 204 No Content                             |
| 3xx   | Redirection  | 301 Moved Permanently, 302 Found                                |
| 4xx   | Client error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found |
| 5xx   | Server error | 500 Internal Server Error, 503 Service Unavailable              |

### Error-Handling Middleware

Error handlers have **four** parameters `(err, req, res, next)` — the extra `err`
argument is what tells Express it's an error handler. They must be registered
**last**, after all routes:

```js
const errorHandlerMiddleware = (err, req, res, next) => {
  console.error(
    "Internal server error: ",
    err.constructor.name,
    JSON.stringify(err, ["name", "message", "stack"]),
  );

  if (!res.headersSent) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An internal server error occurred.");
  }
};

module.exports = errorHandlerMiddleware;
```

### 404 Not Found Handler

Your `notFoundHandler` catches any request that didn't match a route. It's
registered after all routes but before the error handler:

```js
const notFoundHandlerMiddleware = (req, res, next) => {
  if (!res.headersSent) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .send(`You can't do a ${req.method} for ${req.url}`);
  }
};

module.exports = notFoundHandlerMiddleware;
```
