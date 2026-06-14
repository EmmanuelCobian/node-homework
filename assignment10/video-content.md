# Week 10: A Front End, and Deployment to the Internet

Deployed back end: https://node-homework-5kx0.onrender.com/

## 1. How do you connect a React frontend to your Node.js backend API?

### How the Frontend Makes API Calls with Credentials

In development there are two separate processes: the React front end on `http://localhost:3001` and this Express back end on `http://localhost:3000`. The front end's `vite.config.js` proxies every request for `/api` to the address in `VITE_TARGET`, so the browser code can just call `/api/users/logon` and Vite forwards it to the back end.

### The Authentication Flow Between Frontend and Backend

The flow starts at register or logon. Both routes mint a JWT and return it as an HttpOnly cookie, from [controllers/userController.js:18-23](controllers/userController.js#L18-L23):

```js
const setJwtCookie = (req, res, user) => {
  const payload = { id: user.id, csrfToken: randomUUID() };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.cookie("jwt", token, { ...cookieFlags(req), maxAge: 3600000 });
  return payload.csrfToken;
};
```

The front end never sees the raw token, it lives in an HttpOnly cookie the browser stores and re-sends automatically. What the front end does get back is the `csrfToken`, returned in the JSON response body. It stashes that token in memory and echoes it back on every state-changing request.

On the next request, the JWT middleware reads the cookie and verifies it before any controller runs, from [middleware/jwtMiddleware.js](middleware/jwtMiddleware.js):

```js
const token = req?.cookies?.jwt;
if (!token) {
  return send401(res);
}
jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
  if (err) {
    return send401(res);
  }
  req.user = { id: decoded.id };
  ...
});
```

So in DevTools → Network you can watch the round trip: logon comes back with a `Set-Cookie: jwt=...` header and a `csrfToken` in the body, and every later request to `/api/tasks` carries that cookie back without the front end doing anything.

## 2. What are the key steps in deploying a Node.js application to the cloud?

### Running Prisma Migrations on the Cloud Database

A cloud app can't reach a database on your laptop, so the database moves to Neon.tech. The only change needed is `DATABASE_URL` in `.env` — comment out the local connection string and paste in the Neon one. Then build the tables in the cloud database:

```
npx prisma migrate deploy
```

`migrate deploy` applies the existing migrations against whatever `DATABASE_URL` points at.

### Walking Through the Render.com Deployment Configuration

The Render web service is configured to pull straight from the public GitHub repo.

The build command does two jobs: `npm install --production` installs runtime dependencies but skips dev/test packages, and `npx prisma migrate deploy` brings the Neon schema up to date. The run command is `npm start`, which is just `node app.js`.

Because `.env` is gitignored and never reaches GitHub, the secrets are entered into Render's environment-variable panel instead — `DATABASE_URL`, `JWT_SECRET`, `RECAPTCHA_SECRET`, and `RECAPTCHA_BYPASS`. Render injects these into the process at runtime, exactly where `process.env.JWT_SECRET` and friends expect to find them.

One back-end detail that matters in the cloud, from [app.js:17](app.js#L17):

```js
app.set("trust proxy", 1);
```

Render sits behind a reverse proxy, so without this Express would see the proxy's IP for every request. `trust proxy` makes Express read the real client IP from the `X-Forwarded-For` header, which both the rate limiter and `req.ip` (used by the reCAPTCHA check) depend on.

### Showing the Deployed Application Running Live

Once Render reports "live," visiting the root URL returns the app's hello route:

```
GET https://node-homework-5kx0.onrender.com/
→ { "message": "Hello, World!" }
```

There's also a health route that proves the cloud database connection, from [app.js:64-73](app.js#L64-L73):

```js
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    ...
  }
});
```

Hitting `/health` and getting `{ "status": "ok", "db": "connected" }` confirms the deployed app is talking to Neon.

## 3. How do you test and validate a deployed application?

### Testing the Deployed API Endpoints with Postman

The Postman tests reference a `urlBase` environment variable. Pointing it at the Render URL (and stopping the local server) sends every request to the cloud instead.

Register is the interesting case, because of the reCAPTCHA gate added this week Postman can't run Google's browser widget, so it can never produce a real `recaptchaToken`. A register request with no token hits the `else if` branch: if the `X-Recaptcha-Test` header matches the `RECAPTCHA_BYPASS` secret, the request is treated as human and proceeds. So the Postman demo is: fire register with no header → `400 Bot verification failed`; add the `X-Recaptcha-Test` header → `201 Created`. From there logon, create-task, and complete-task all run against the live URL.

### Demonstrating the Full Application with the React Front End

Pointing the front end's `VITE_TARGET` at the Render URL runs the whole stack against the cloud. Here the reCAPTCHA works for real: register now shows Google's "I'm not a robot" widget, which produces a genuine `recaptchaToken` in the request body, and the first branch above verifies it against Google. Then logon, create todos, mark them complete, and log off — all served by the deployed back end and the Neon database.

### Checking Deployment Logs and Troubleshooting

Render's Logs tab streams stdout from the running process. This app logs every request, from [app.js:42-47](app.js#L42-L47):

```js
app.use((req, res, next) => {
  console.log("Request Method:", req.method);
  console.log("Request Path:", req.path);
  console.log("Request Query:", req.query);
  next();
});
```

So the log shows the startup line `Server is listening on port ...` followed by a line per request. A failed build or a crash on boot — usually a missing environment variable or a migration error — surfaces here, which is the first place to look when a deploy goes red.

### Differences Between Local and Production Environments

Several things behave differently once `NODE_ENV` is `production`. The clearest is the cookie configuration, from [controllers/userController.js:10-16](controllers/userController.js#L10-L16):

```js
const cookieFlags = (req) => {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };
};
```

| Concern           | Local                                                            | Production (Render)                                                  |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cookie `secure`   | `false` — works over plain HTTP on localhost                     | `true` — only sent over HTTPS                                        |
| Cookie `sameSite` | `Lax`                                                            | `None` — required for the cross-site cookie to ride along over HTTPS |
| Database          | local Postgres via local `DATABASE_URL`                          | cloud Neon database                                                  |
| Secrets           | read from the `.env` file                                        | injected from Render's env-var panel                                 |
| reCAPTCHA         | real token from the browser widget (or bypass header in Postman) | same                                                                 |
| Client IP         | direct, so `req.ip` is the real IP                               | behind a proxy, so `trust proxy` is required for `req.ip`            |

The `secure`/`sameSite` switch is the subtle one: those production values would break local development (the browser won't send a `secure` cookie over HTTP), which is exactly why they're gated on `NODE_ENV`.
