# Week 6: Prisma and ORMs

## 1. How do you connect Node.js to PostgreSQL and what are the benefits over in-memory storage?

### Why Move Off In-Memory Storage

The earlier versions of this app held tasks in a plain JavaScript array inside the running Node process. That works for a single demo, but it has limits:

| Problem     | In-memory array                            | PostgreSQL                                            |
| ----------- | ------------------------------------------ | ----------------------------------------------------- |
| Persistence | Wiped on every restart                     | Survives restarts, deploys, and crashes               |
| Concurrency | One process, no locking                    | Multiple workers can read/write the same data         |
| Querying    | Manual `.filter()` / `.find()` over arrays | Indexed lookups, joins, aggregations                  |
| Integrity   | Whatever the code happens to enforce       | Foreign keys, `UNIQUE`, `NOT NULL` enforced by the DB |

Once the app needs to outlive a single process or serve more than one user reliably, a real database stops being optional.

### Connection Pooling and Why It Matters

Opening a fresh PostgreSQL connection costs a TCP handshake, an SSL negotiation, and authentication — easily tens of milliseconds, and PostgreSQL itself caps the total number of concurrent connections (often around 100).

A **connection pool** keeps a small set of connections open and hands them out as queries come in:

1. A request arrives, the controller calls `pool.query(...)`.
2. The pool grabs an idle connection (or opens a new one up to the limit).
3. The query runs, and when it's done the connection is returned to the pool — _not_ closed.
4. The next request reuses that same warm connection.

Without pooling, a hundred concurrent requests would each open and close their own connection — slow, and likely to exhaust PostgreSQL's connection limit. With pooling, the same hundred requests share maybe ten connections in rotation. Prisma uses its own pool under the hood for the same reason.

### The Schema and Foreign Keys

The two tables in this app are `users` and `tasks`. Every task belongs to exactly one user, which is a classic one-to-many relationship modeled with a foreign key:

- `users.id` is the primary key (auto-incrementing integer).
- `tasks.user_id` is a foreign key pointing at `users.id`.

## 2. What is an ORM and how does Prisma improve database operations?

### What an ORM Is

An **ORM** (Object-Relational Mapper) is a layer that lets you work with database rows as if they were regular language objects. Instead of writing SQL strings and shuffling result rows into JavaScript values by hand, you call methods on a generated client and get back fully-typed objects.

The trade-off: you give up some of the raw expressiveness of SQL in exchange for safety, ergonomics, and a single source of truth for your schema.

### The Prisma Schema

Prisma's source of truth is a single `schema.prisma` file. It describes the database in a Prisma-specific DSL, and from it Prisma generates the client, runs migrations, and powers all the type checking. From [prisma/schema.prisma](prisma/schema.prisma):

```prisma
model User {
  id             Int      @id @default(autoincrement())
  email          String   @unique @db.VarChar(255)
  name           String   @db.VarChar(30)
  hashedPassword String   @db.VarChar(255) @map("hashed_password")
  createdAt      DateTime @default(now()) @db.Timestamp(6) @map("created_at")
  Task           Task[]
  @@map("users")
}

model Task {
  id          Int      @id @default(autoincrement())
  title       String   @db.VarChar(255)
  isCompleted Boolean  @default(false) @map("is_completed")
  userId      Int      @map("user_id")
  createdAt   DateTime @default(now()) @db.Timestamp(6) @map("created_at")
  User        User     @relation(fields: [userId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  @@unique([id, userId])
  @@map("tasks")
}
```

Worth calling out:

| Annotation                                   | What it does                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@id @default(autoincrement())`              | Marks the primary key and tells PostgreSQL to auto-generate it.                                                                                           |
| `@unique`                                    | Adds a `UNIQUE` constraint at the DB level — two users can't share an email.                                                                              |
| `@map("hashed_password")` / `@@map("users")` | Lets the JS field stay camelCase (`hashedPassword`) while the DB column stays snake_case (`hashed_password`). Same trick at the table level with `@@map`. |
| `Task Task[]`                                | Declares the back-relation: a `User` has many `Task`s. Purely virtual — no column is added.                                                               |
| `User User @relation(fields: [userId], ...)` | The actual foreign key. Prisma generates the `FOREIGN KEY (user_id) REFERENCES users(id)` and uses this relation to power `include` queries.              |

### Raw SQL vs. Prisma Methods

The same operation written two ways. Fetch all tasks for a user, raw SQL with the `pg` pool:

```js
const result = await pool.query(
  "SELECT id, title, is_completed FROM tasks WHERE user_id = $1",
  [global.user_id],
);
return res.json(result.rows);
```

The same operation in Prisma, from [controllers/taskController.js:38-43](controllers/taskController.js#L38-L43):

```js
const tasks = await prisma.task.findMany({
  where: { userId: global.user_id },
  select: { title: true, isCompleted: true, id: true },
});
```

Differences:

- No SQL string to get wrong (typos in column names, missing `WHERE`, mismatched parameter slots).
- `userId` and `isCompleted` are camelCase in code — Prisma maps them to the snake_case DB columns automatically.
- The result is already a typed array of objects with exactly the fields named in `select`. No `.rows`, no manual key renaming.

### `select` and `include` for Relationships

Prisma gives you two ways to shape the result:

- **`select`** picks specific fields and replaces the default. Anything not listed is dropped. That's how the user controller avoids ever returning `hashedPassword` to the client, from [controllers/userController.js:35-38](controllers/userController.js#L35-L38):

  ```js
  const user = await prisma.user.create({
    data: { name, email, hashedPassword },
    select: { name: true, email: true, id: true },
  });
  ```

- **`include`** pulls in related rows over a relation. To fetch a user with all their tasks in one query, you'd write:

  ```js
  const user = await prisma.user.findUnique({
    where: { id: global.user_id },
    include: { Task: true },
  });
  ```

  Prisma issues the join (or a follow-up query) and returns `user.Task` populated as an array. No hand-written `JOIN`, no manual stitching of rows into a nested object.

### Type Safety and Autocomplete

Because the Prisma Client is _generated_ from the schema, the editor knows every model, every field, and every valid argument shape. Typing `prisma.task.` produces a list of methods (`findMany`, `findUnique`, `create`, `update`, ...). Typing `where: {` produces a list of valid filter fields. Misspelling `isComplated` is a compile-time error rather than a runtime one. Removing a column from `schema.prisma` and regenerating the client immediately surfaces every controller still referencing it.

## 3. How do you transform raw SQL queries to Prisma operations?

### Creating a User: SQL → Prisma

The raw SQL version of registration would have been:

```js
const result = await pool.query(
  `INSERT INTO users (name, email, hashed_password)
   VALUES ($1, $2, $3)
   RETURNING id, name, email`,
  [name, email, hashedPassword],
);
const user = result.rows[0];
```

The Prisma version, from [controllers/userController.js:35-38](controllers/userController.js#L35-L38):

```js
const user = await prisma.user.create({
  data: { name, email, hashedPassword },
  select: { name: true, email: true, id: true },
});
```

Same end result, a new row in `users`, and a sanitized object back. But the Prisma version expresses intent (`create`, `select`) rather than spelling out an `INSERT ... RETURNING` and indexing into `result.rows[0]`.

### Fetching Tasks: SQL → Prisma

Raw SQL version:

```js
const result = await pool.query(
  "SELECT id, title, is_completed FROM tasks WHERE user_id = $1",
  [global.user_id],
);
const tasks = result.rows;
```

Prisma version, from [controllers/taskController.js:38-43](controllers/taskController.js#L38-L43):

```js
const tasks = await prisma.task.findMany({
  where: { userId: global.user_id },
  select: { title: true, isCompleted: true, id: true },
});
```

Same query, but the column casing and result shape are taken care of automatically.

### Error Codes Instead of String Matching

With raw `pg`, finding out why a query failed means parsing the error message or matching against PostgreSQL's `code` field directly. Prisma normalizes this by turning every known database error into a `PrismaClientKnownRequestError` with a stable `code` you can branch on.

Two examples used in this assignment:

**Duplicate email on registration**, from [controllers/userController.js:42-49](controllers/userController.js#L42-L49):

```js
} catch (e) {
  if (e.name === "PrismaClientKnownRequestError" && e.code === "P2002") {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Validation failed. This email is already registered.",
    });
  }
  return next(e);
}
```

`P2002` is Prisma's code for "unique constraint failed." It fires when the `@unique` on `email` rejects an `INSERT`. Catching the error code lets the controller turn a database-level failure into a clean `400` with a useful message, instead of leaking a raw constraint name to the client.

**Updating or deleting a task that doesn't exist**, from [controllers/taskController.js:98-104](controllers/taskController.js#L98-L104):

```js
} catch (err) {
  if (err.code === "P2025") {
    return res.status(404).json({ message: "The task was not found." });
  } else {
    return next(err);
  }
}
```

`P2025` means "record to update/delete was not found."

### The Generated Prisma Client

The client lives in `node_modules/@prisma/client` and is regenerated by `npx prisma generate` (which the `migrate` workflow runs automatically). The setup itself is one file, [db/prisma.js](db/prisma.js):

```js
const { PrismaClient } = require("@prisma/client");

let opts = {};
if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
  opts = { log: ["query"] };
}

const prisma = new PrismaClient(opts);
module.exports = prisma;
```

Two things going on:

- A single `PrismaClient` instance is exported and shared across the app, same reasoning as the `pg` pool. Each `new PrismaClient()` opens its own pool, so multiple instances would mean wasted connections.
- In development the client logs every query it issues.

Once `prisma` is imported, every model gets a typed namespace: `prisma.user`, `prisma.task`. Each one exposes the same set of methods — `findMany`, `findUnique`, `create`, `update`, `delete`, `upsert`, `count`, and so on. This means that once you've used one model, you know how to use all of them.
