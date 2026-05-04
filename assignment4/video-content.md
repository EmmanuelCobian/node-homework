# Week 4: Security, Validation, and Passwords

## 1. How do you protect routes using middleware in Express?

### Protected vs. Public Routes

A **public route** is reachable by any client — no credentials required. A **protected route** is one that should only execute when the caller has proven who they are.

In this app, the split looks like this:

| Route                                | Visibility | Why                                                        |
| ------------------------------------ | ---------- | ---------------------------------------------------------- |
| `POST /api/users/register`           | Public     | A new user has no credentials yet — they need to make some |
| `POST /api/users/logoff`             | Public     | Clearing session state shouldn't require being logged in   |
| `GET/POST/PATCH/DELETE /api/tasks/*` | Protected  | Tasks belong to a specific user — must know who is asking  |

### Authentication Middleware

Authentication middleware is just a regular Express middleware that inspects the request, decides whether the caller is authenticated, and either calls `next()` or short-circuits with a `401`. From [middleware/auth.js](middleware/auth.js):

```js
const { StatusCodes } = require("http-status-codes");

const authMiddleware = (req, res, next) => {
  if (global.user_id === null) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "unauthorized" });
  }
  next();
};

module.exports = authMiddleware;
```

### Applying Middleware to Specific Routes

Express lets you mount middleware globally (`app.use(fn)`) or scoped to a path. To protect only the task routes, the auth middleware is mounted in front of the task router in [app.js:22-24](app.js#L22-L24):

```js
// Public — no auth middleware
app.use("/api/users", userRouter);

// Protected — auth runs before any taskRouter handler
app.use("/api/tasks", authMiddleware, taskRouter);
```

Because Express runs middleware in registration order, every request to `/api/tasks/*` hits `authMiddleware` first. If the user isn't logged in, the request never reaches the controller. Task controller functions like `create` and `index` can safely assume `global.user_id` is populated. That's why [taskController.js:50](controllers/taskController.js#L50) can do `userId: global.user_id.email` without a null check.

## 2. What security vulnerabilities does data validation prevent and how do you implement validation?

### Why Validate

`req.body` is attacker-controlled. Anything that ends up in a database query, an HTML response, a file path, or a shell command should be treated as hostile until proven otherwise. Validation is the choke point where that proof happens.

- **SQL injection** — when user input is concatenated into a SQL string, `'; DROP TABLE users;--` becomes part of the query. Validation rejects inputs that don't match the expected shape (e.g. an email field shouldn't contain SQL syntax) and a strict schema means anything unexpected never reaches the query layer in the first place. (Parameterized queries are the real defense here, but validation is the layer that stops obviously malformed input before it gets near the DB.)
- **Mass assignment** — if you spread `req.body` into a model object, an attacker can set fields you didn't intend (`isAdmin: true`). Joi's default behavior strips unknown keys, so only declared fields survive validation. That's why [userController.js:22-30](controllers/userController.js#L22-L30) uses the `value` returned by `validate()` instead of `req.body` directly.
- **Type confusion** — without validation, `isCompleted` could arrive as `"yes"`, `1`, or `null` and silently break downstream logic. `Joi.boolean()` coerces or rejects.

### userSchema.js

From [validation/userSchema.js](validation/userSchema.js):

```js
const Joi = require("joi");

const userSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  name: Joi.string().trim().min(3).max(30).required(),
  password: Joi.string()
    .trim()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).+$/)
    .required()
    .messages({
      "string.pattern.base":
        "Password must be at least 8 characters long and include upper and lower case letters, a number, and a special character.",
    }),
});
```

| Rule                                                    | What it does                                                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email: string().trim().lowercase().email().required()` | Must be a string, strip surrounding whitespace, downcase it (so `"Foo@x.com"` and `"foo@x.com"` are the same user), and match RFC email shape. Required — no account without one. |
| `name: string().trim().min(3).max(30).required()`       | Bounded length stops empty-string names and absurdly long ones that could bloat storage or break a UI.                                                                            |
| `password: string().trim().min(8)`                      | Minimum 8 chars — short passwords are trivially brute-forced.                                                                                                                     |
| `password.pattern(...)`                                 | Lookahead regex requires at least one lowercase, one uppercase, one digit, and one special character. Forces complexity beyond just length.                                       |
| `.messages({ "string.pattern.base": ... })`             | Replaces the cryptic default Joi regex message with a human-readable rule, so users know how to fix it.                                                                           |
| `required()` on every field                             | Joi strips unknowns by default — so registering with `{ email, name, password, isAdmin: true }` silently drops `isAdmin`.                                                         |

### taskSchema.js

From [validation/taskSchema.js](validation/taskSchema.js):

```js
const Joi = require("joi");

const taskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(30).required(),
  isCompleted: Joi.boolean().default(false).not(null),
});

const patchTaskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(30).not(null),
  isCompleted: Joi.boolean().not(null),
})
  .min(1)
  .message("No attributes to change were specified.");

module.exports = { taskSchema, patchTaskSchema };
```

| Rule                                               | What it does                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `title: string().trim().min(3).max(30).required()` | A task must have a title; length-bounded to keep storage and UI predictable.                                                                    |
| `isCompleted: boolean().default(false).not(null)`  | Coerce to a real boolean; default to `false` on create so the field is never missing; explicitly disallow `null` so callers can't blank it out. |
| Two schemas                                        | `taskSchema` is for `POST` (title required); `patchTaskSchema` is for `PATCH` where any subset is valid.                                        |
| `.min(1).message(...)` on the patch schema         | A `PATCH` with an empty body is meaningless — reject it with a clear message instead of silently no-oping.                                      |
| `.not(null)` on patch fields                       | If the caller does include a field, it has to be a real value — patching `title: null` is rejected.                                             |

### How the schema is applied

The controllers call `.validate()` and short-circuit on error rather than trusting `req.body` directly. From [controllers/userController.js:20-30](controllers/userController.js#L20-L30):

```js
const register = async (req, res) => {
  if (!req.body) req.body = {};
  const { error, value } = userSchema.validate(
    { ...req.body },
    { abortEarly: false },
  );

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  const { password, ...user } = value;
  // ...use `value`, never `req.body`, from here on
};
```

`abortEarly: false` collects every validation error in one pass instead of stopping at the first one. This results in better UX for forms with multiple bad fields. Using `value` (the cleaned, coerced output) instead of `req.body` is what prevents attacks like mass-assignment.

## 3. Why should you never store passwords in plain text and what are the security principles for password hashing?

### The Risk of Plain Text

If passwords are stored in plain text and the database is ever leaked — backup misplaced, SQL injection, insider threat, stolen laptop — every user's password is immediately compromised. Worse: most users reuse passwords, so an attacker now has credentials for those users' email, banking, and work accounts too.

The defense is to never have the plain-text password to leak in the first place. The server only ever stores something derived from the password that lets it _verify_ a future login attempt without being able to _reproduce_ the original.

### Hashing vs. Encryption

These get confused constantly, but they solve different problems:

| Property       | Hashing                                      | Encryption                                     |
| -------------- | -------------------------------------------- | ---------------------------------------------- |
| Reversible?    | No — one-way function                        | Yes — with the key                             |
| Has a key?     | No                                           | Yes                                            |
| Use case       | Verifying _something matches_ a stored value | Storing data you need to _read back later_     |
| For passwords? | Correct choice                               | Wrong — if the key leaks, every password leaks |

You verify a password by hashing the attempt and comparing it to the stored hash. You never need the original back, so encryption is the wrong tool — it adds a key that becomes a single point of failure.

### Salt and Rainbow Attacks

A **rainbow table** is a precomputed map from common-password hashes back to the plain text. If everyone hashes `"password123"` to the same value, an attacker only has to compute that hash once and they crack every user with that password across every breached database, forever.

A **salt** is a random per-user value mixed into the input before hashing. Now `hash("password123" + salt_alice)` and `hash("password123" + salt_bob)` produce different outputs, even though Alice and Bob picked the same password. Rainbow tables become useless because the attacker would need a separate table per salt — and the salt is stored alongside the hash, but it's unique per user, so they're forced to brute-force each user individually.

The salt doesn't have to be secret. Its job is to make precomputation impossible, not to be a second password.

### Implementation in this Repo

From [controllers/userController.js:7-18](controllers/userController.js#L7-L18):

```js
const crypto = require("crypto");
const util = require("util");
const scrypt = util.promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function comparePassword(inputPassword, storedHash) {
  const [salt, key] = storedHash.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = await scrypt(inputPassword, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}
```

### Don't Roll Your Own

Cryptography is the area where "looks reasonable" and "is actually secure" are furthest apart. Subtle mistakes, like using a non-CSPRNG for the salt, a fixed salt, a too-fast hash, comparing with `===`, or reusing IVs, produce code that runs fine and looks fine and is completely broken. Real cryptographers spend careers finding these bugs in algorithms that already passed peer review.

That's why this controller uses `crypto.scrypt` from Node's standard library instead of inventing a hashing scheme. The general rule: pick a vetted primitive (`scrypt`, `bcrypt`, `argon2`), use it the way the docs say to.
