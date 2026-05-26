# Week 8: Authentication and Security

## 1. How do you implement secure authentication with JWT tokens?

### JWT Token Generation and Signing

A **JSON Web Token** is a compact, signed string that encodes a small JSON payload. The server signs it with a secret on the way out, and any future request that carries the token can be verified by re-running the signature check. There's no database lookup required to know who the caller is.

The token is minted in two places: at the end of `register` and at the end of `logon`. Both routes funnel through one helper, from [controllers/userController.js:18-23](controllers/userController.js#L18-L23):

```js
const setJwtCookie = (req, res, user) => {
  const payload = { id: user.id, csrfToken: randomUUID() };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.cookie("jwt", token, { ...cookieFlags(req), maxAge: 3600000 });
  return payload.csrfToken;
};
```

A few things worth pointing out:

- The payload is intentionally small. Just the user's `id` and a per-session `csrfToken` (more on that below). Anything bigger means a bigger cookie on every request.
- `jwt.sign` produces three base64 segments joined by dots: `header.payload.signature`. The signature is an HMAC over the first two segments using `JWT_SECRET`. If anyone flips a bit in the payload, the signature stops matching and verification fails.
- `expiresIn: "1h"` puts an `exp` claim inside the payload. Once that timestamp passes, `jwt.verify` rejects the token even if the signature is otherwise valid.
- `JWT_SECRET` is read from the environment, not hardcoded. A leaked secret means anyone can forge tokens for any user.

The token then rides home as an HTTP-only cookie rather than as a JSON field in the response body. The client never sees the raw token, never stores it, never has to attach it to requests by hand.

### JWT Validation Middleware

Every protected route runs through the JWT middleware first. From [middleware/jwtMiddleware.js](middleware/jwtMiddleware.js):

```js
const jwtMiddleware = async (req, res, next) => {
  const token = req?.cookies?.jwt;
  if (!token) {
    return send401(res);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return send401(res);
    }

    req.user = { id: decoded.id };
    if (["POST", "PATCH", "PUT", "DELETE", "CONNECT"].includes(req.method)) {
      if (req.get("X-CSRF-TOKEN") != decoded.csrfToken) {
        return send401(res);
      }
    }
    next();
  });
};
```

The flow:

1. Pull the `jwt` cookie off the request. `cookie-parser` (mounted in [app.js:27](app.js#L27)) is what populates `req.cookies` from the raw `Cookie` header.
2. Run `jwt.verify`. This re-computes the HMAC and checks the `exp` claim. If either fails, the middleware short-circuits with a `401` and the controller never runs.
3. On success, attach `{ id: decoded.id }` to `req.user`. From here on, any controller can trust `req.user.id` is a real, authenticated user.

### Protecting Routes and Accessing User Information

The middleware is mounted at the router level in [routes/taskRoutes.js:14](routes/taskRoutes.js#L14):

```js
router.use(jwtMiddleware);
router.route("/").get(index).post(create);
router.route("/bulk").post(bulkCreate);
router.route("/:id").get(show).patch(update).delete(deleteTask);
```

`router.use(jwtMiddleware)` means every task route — index, create, show, update, delete, bulk — runs the middleware first. There's no "I forgot to add auth to that one handler" failure mode.

Once the middleware has populated `req.user`, controllers use it to scope queries to the calling user. From [controllers/taskController.js:26-32](controllers/taskController.js#L26-L32):

```js
const task = await prisma.task.create({
  data: {
    ...value,
    userId: req.user.id,
  },
  select: { id: true, title: true, isCompleted: true, priority: true },
});
```

The `userId` on the new task is taken from the verified JWT payload, never from `req.body`. A client can't create a task on behalf of another user by sending a forged `userId` field — Joi validation strips it, and even if it didn't, this line overwrites whatever was there.

The same pattern shows up in [controllers/taskController.js:51-69](controllers/taskController.js#L51-L69), where `index` filters tasks by `userId: req.user.id`, and in `show`, `update`, and `deleteTask`, where the `where` clause includes both the `id` and `userId: req.user.id`. A user can't read, modify, or delete another user's task by guessing IDs.

## 2. What security vulnerabilities does your authentication system prevent?

### CSRF Protection

**Cross-Site Request Forgery** is the attack where a malicious page tricks a logged-in user's browser into making a state-changing request to your site. The user's cookie is sent automatically (that's how cookies work), so the request looks legitimate even though the user never authorized it.

The defense in this app is a **double-submit token**. Each JWT payload carries a freshly-generated `csrfToken`, from [controllers/userController.js:19](controllers/userController.js#L19):

```js
const payload = { id: user.id, csrfToken: randomUUID() };
```

The CSRF token is returned to the client in the JSON response body — not in a cookie — so the legitimate frontend can stash it in memory and echo it back on every state-changing request as the `X-CSRF-TOKEN` header. The JWT middleware then checks that the header matches the value baked into the verified token, from [middleware/jwtMiddleware.js:22-26](middleware/jwtMiddleware.js#L22-L26):

```js
if (["POST", "PATCH", "PUT", "DELETE", "CONNECT"].includes(req.method)) {
  if (req.get("X-CSRF-TOKEN") != decoded.csrfToken) {
    return send401(res);
  }
}
```

A cross-site attacker can ride the JWT cookie because the browser ships it automatically, but they can't read the JSON response from the original login (the same-origin policy blocks that), so they have no way to learn the CSRF token. Without it, the header check fails and the request is rejected. Read-only `GET` requests skip the check, since they shouldn't be changing state.

### HttpOnly Cookies vs. localStorage

The token is stored in a cookie with `httpOnly: true`, from [controllers/userController.js:10-16](controllers/userController.js#L10-L16):

```js
const cookieFlags = (req) => {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };
};
```

The three flags do three different jobs:

| Flag                | What it does                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `httpOnly: true`    | JavaScript can't read the cookie. `document.cookie` skips it entirely. An XSS bug can't exfiltrate the session token. |
| `secure: true`      | The browser refuses to send the cookie over plain HTTP. Disabled in dev so localhost works without TLS.               |
| `sameSite: "Strict"` | The browser only sends the cookie on same-site requests. A cross-site `<form>` submit or `fetch` can't include it.    |

Contrast with `localStorage`, which is the other common place tokens get stashed:

| Property                  | `localStorage`                                       | `HttpOnly` cookie                                |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Readable from JavaScript? | Yes — any XSS payload can grab the token             | No — invisible to scripts                        |
| Sent automatically?       | No — client code must attach the `Authorization` header | Yes — browser ships it on every same-site request |
| Cleared on logout?        | Only if your JS remembers to clear it                | Server can `Set-Cookie` with `Max-Age=0`         |
| CSRF exposure?            | None — attacker can't trigger sends                  | Real — that's why the CSRF token check exists    |

The trade-off is real: cookies pick up CSRF as a risk, which `localStorage` doesn't have. But XSS is much more common and much worse — one stored XSS bug exfiltrates every active session — so the calculus comes out in favor of `HttpOnly` cookies + a CSRF token over `localStorage`.

### Rate Limiting and Input Sanitization

Three middlewares stack up at the top of [app.js:18-31](app.js#L18-L31) before any route handler runs:

```js
app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
  }),
);

app.use(helmet());

app.use(cookieParser());

app.use(express.json({ limit: "1kb" }));

app.use(xss());
```

What each one prevents:

| Middleware                       | Defends against                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `express-rate-limit`             | Brute-force login attempts and credential-stuffing. 100 requests per 15-minute window per IP — past that, the server returns 429. |
| `helmet()`                       | Sets security headers — `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, etc. — that close off browser-side attacks. |
| `express.json({ limit: "1kb" })` | A payload-size cap. An attacker can't tie up the server by streaming a 10 GB JSON body.                                            |
| `express-xss-sanitizer`          | Strips embedded HTML/script tags from incoming string fields, so a stored `<script>` tag can't sneak through validation and execute later. |

These are belt-and-suspenders defenses. Joi validation in the controllers is the real input check; `xss()` is a second pass. The rate limiter doesn't prevent a determined attacker forever, but it raises the cost of brute-forcing a password from "a few seconds" to "weeks."

## 3. How do you handle user sessions and maintain security across requests?

### Storing User Information in the JWT Payload

The JWT is the entire session. There's no `sessions` table, no Redis store, no server-side state that has to stay in sync. Everything the server needs to identify the caller lives inside the signed payload, from [controllers/userController.js:19](controllers/userController.js#L19):

```js
const payload = { id: user.id, csrfToken: randomUUID() };
```

Two fields, deliberately small:

- `id` — the primary key in the `users` table. The JWT middleware decodes this into `req.user.id`, and every protected controller uses it to scope queries.
- `csrfToken` — a per-session UUID that backs the double-submit check described above. It's randomized at sign-in time so even two sessions for the same user have different CSRF tokens.

Two fields are also notably **absent**: the password (or its hash) and the user's email. The password isn't there because the JWT is base64-encoded, not encrypted — anyone with the token can decode and read its payload. Sensitive fields don't belong in there. The email isn't there because the controllers don't need it; they can look up any user data they want by `id`. Keeping the payload small keeps the cookie small on every request.

### Logout and Token Invalidation

Logging out clears the cookie, from [controllers/userController.js:128-131](controllers/userController.js#L128-L131):

```js
const logoff = (req, res) => {
  res.clearCookie("jwt", cookieFlags(req));
  return res.sendStatus(StatusCodes.OK);
};
```

`res.clearCookie` sends back a `Set-Cookie` header with the same name and an immediate expiration, which tells the browser to drop it. The flags have to match the ones that set the cookie originally — `httpOnly`, `secure`, `sameSite` — otherwise the browser treats it as a different cookie and the old one stays in place.

There's a real caveat here: this clears the cookie on the **client**, but the JWT itself is still cryptographically valid until it expires. If an attacker had already exfiltrated the token before logout, they could continue using it for up to an hour. This is the trade-off of stateless JWTs, there's no server-side session to delete.

The `logoff` route is also a `POST`, mounted behind the JWT middleware in [routes/userRoutes.js:9](routes/userRoutes.js#L9):

```js
router.route("/logoff").post(jwtMiddleware, logoff);
```

That means logoff itself requires a valid JWT plus a matching CSRF token. An attacker can't sign other users out of the app by tricking their browser into hitting `/logoff`.

### Handling Authentication Errors and Edge Cases

Auth code has more failure modes than business logic, and each one has to fail closed — silent failures or vague errors are how vulnerabilities slip in. A walk through the cases:

| Case                                   | What happens                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No cookie on a protected route         | `req.cookies.jwt` is `undefined`, middleware returns 401 immediately, controller never runs                                        |
| Tampered or forged token               | `jwt.verify` throws (HMAC mismatch), middleware returns 401                                                                        |
| Expired token                          | `jwt.verify` throws `TokenExpiredError`, middleware returns 401 — same path as tampering, no separate error                        |
| Valid token, missing CSRF header on POST | Header check fails, middleware returns 401                                                                                         |
| Login with unknown email               | `prisma.user.findUnique` returns `null`, controller returns "Authentication Failed" — same message used for wrong password         |
| Login with correct email, wrong password | `comparePassword` returns `false`, controller returns "Authentication Failed" — identical message to the unknown-email branch     |
| Accessing another user's task by ID    | `where: { id, userId }` matches nothing, Prisma returns `null`, controller returns 404                                            |

A couple of design choices worth calling out:

- **Login returns the same error for "no such user" and "wrong password."** From [controllers/userController.js:111-122](controllers/userController.js#L111-L122). If those returned different messages, an attacker could enumerate which emails are registered by watching which one came back. One generic "Authentication Failed" closes that side channel.
- **Password comparison uses `crypto.timingSafeEqual`**, from [controllers/userController.js:31-36](controllers/userController.js#L31-L36). A naive `===` comparison short-circuits at the first mismatching byte, which leaks information through how long the comparison took. `timingSafeEqual` runs in constant time regardless of where the strings differ, so an attacker can't time-attack their way to a valid password byte by byte.
- **The middleware never logs the token itself.** Tokens are credentials. Putting them in server logs means a logfile leak is a session leak.

Together, these patterns make the auth surface fail closed by default: the only way through is a valid signed token, a matching CSRF header on state-changing routes, and a resource that the verified user actually owns.
