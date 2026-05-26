# Week 7: Advanced Prisma

## 1. How do you use Prisma's advanced querying features for analytics and reporting?

### The Analytics Controller

This assignment adds a dedicated [controllers/analyticsController.js](controllers/analyticsController.js) wired up through [routes/analyticsRoutes.js](routes/analyticsRoutes.js). Three endpoints live there:

| Route                         | Handler             | What it returns                                                         |
| ----------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `GET /analytics/users`        | `getUsersWithStats` | Paginated users, each with a task count and a preview of pending tasks  |
| `GET /analytics/users/:id`    | `getUserAnalytics`  | One user's completion breakdown, recent tasks, and weekly activity      |
| `GET /analytics/tasks/search` | `searchTasks`       | Full-text-ish search across tasks and the user that owns them (raw SQL) |

Each one exercises a different Prisma feature: `groupBy`, `_count`, `include`, and `$queryRaw`.

### `groupBy` for Aggregations

Counting how many tasks a user has completed vs. left open is a classic `GROUP BY` query. Prisma exposes this directly, from [controllers/analyticsController.js:23-29](controllers/analyticsController.js#L23-L29):

```js
const taskStats = await prisma.task.groupBy({
  by: ["isCompleted"],
  where: { userId: userId },
  _count: {
    id: true,
  },
});
```

What this does in SQL terms:

```sql
SELECT is_completed, COUNT(id)
FROM tasks
WHERE user_id = $1
GROUP BY is_completed;
```

The result is an array like `[{ isCompleted: true, _count: { id: 4 } }, { isCompleted: false, _count: { id: 7 } }]`. No hand-written aggregation, no manual reduce step in JavaScript, and the database does the work and Prisma hands back the shaped object.

### Filtering and Sorting in a Single Query

`getUserAnalytics` also pulls the user's ten most recent tasks. The query combines a `where` filter, a `select` projection, an `orderBy` clause, and a `take` limit, from [controllers/analyticsController.js:31-46](controllers/analyticsController.js#L31-L46):

```js
const recentTasks = await prisma.task.findMany({
  where: { userId },
  select: {
    id: true,
    title: true,
    isCompleted: true,
    priority: true,
    createdAt: true,
    userId: true,
    User: {
      select: { name: true },
    },
  },
  orderBy: { createdAt: "desc" },
  take: 10,
});
```

A few things worth pointing out:

- `select` nests into the `User` relation so each task carries the owner's name without a second round trip.
- `orderBy: { createdAt: "desc" }` translates to `ORDER BY created_at DESC`.
- `take: 10` is Prisma's `LIMIT 10`.

### `_count` for User Statistics

`getUsersWithStats` shows the other shape of counting — counting related rows per parent. From [controllers/analyticsController.js:69-85](controllers/analyticsController.js#L69-L85):

```js
const usersRaw = await prisma.user.findMany({
  include: {
    Task: {
      where: { isCompleted: false },
      select: { id: true },
      take: 5,
    },
    _count: {
      select: {
        Task: true,
      },
    },
  },
  skip: skip,
  take: limit,
  orderBy: { createdAt: "desc" },
});
```

Two things are happening inside `include`:

1. `Task: { where: { isCompleted: false }, ... take: 5 }` pulls up to five pending tasks per user so the response can render a preview.
2. `_count: { select: { Task: true } }` adds a `_count.Task` field with the total number of tasks for that user, completed and pending combined.

`_count` is the Prisma idiom for "how many of these related rows exist," and it shows up on the returned object as `user._count.Task`. The page can show `42 total tasks, 5 pending shown below` without issuing a separate `SELECT COUNT(*)` query for each user.

### Eager Loading With `include`

The difference between `select` and `include` matters here. `select` _replaces_ the default set of fields with exactly what you list. `include` _adds_ related data on top of the default field set. The user controller's `index` query uses `include` to pull each user with their pending-task preview and total count in one round trip. This is known as eager loading: the parent and its children come back together, no N+1 query problem.

The same pattern is used inside `getUserAnalytics`, where each `recentTask` carries its `User.name` via the nested `select` on the relation field.

## 2. What are database transactions and how do you implement them with Prisma?

### Why Transactions Matter

A transaction is a group of database operations that either all succeed or all fail. The classic motivation: imagine registering a new user means inserting one row in `users` and three rows in `tasks` for their welcome tutorial. If the user insert succeeds but the task insert crashes halfway through, you're left with a user that has no welcome content, or worse, two welcome tasks instead of three. The database state no longer matches what the application thinks happened.

Transactions fix this with **atomicity**: if any statement inside the transaction throws, every statement that already ran is rolled back. The database returns to exactly the state it was in before the transaction started.

### Registration With Welcome Tasks

The registration handler is the headline transaction in this assignment, from [controllers/userController.js:34-60](controllers/userController.js#L34-L60):

```js
const result = await prisma.$transaction(async (tx) => {
  const { name, email } = value;
  const newUser = await tx.user.create({
    data: { name, email, hashedPassword },
    select: { name: true, email: true, id: true },
  });

  const welcomeTaskData = [
    {
      title: "Complete your profile",
      userId: newUser.id,
      priority: "medium",
    },
    { title: "Add your first task", userId: newUser.id, priority: "high" },
    { title: "Explore the app", userId: newUser.id, priority: "low" },
  ];
  await tx.task.createMany({ data: welcomeTaskData });

  const welcomeTasks = await tx.task.findMany({
    where: {
      userId: newUser.id,
      title: { in: welcomeTaskData.map((t) => t.title) },
    },
  });

  return { user: newUser, welcomeTasks };
});
```

The shape to notice:

- `prisma.$transaction(async (tx) => { ... })` opens an **interactive transaction**. Every query inside the callback uses `tx` rather than `prisma`, which routes them through the same database transaction.
- Three steps happen atomically: create the user, bulk-insert three welcome tasks, fetch them back so the response can return their generated IDs.
- Whatever the callback returns becomes the resolved value of `$transaction`, so `result.user` and `result.welcomeTasks` flow straight into the JSON response.

### What Happens When a Transaction Fails

If any of the three steps throws an error — like a unique-constraint violation on `email` because the address is already taken — Prisma issues a `ROLLBACK` on the connection. The user row that may have already been inserted is undone, and the three welcome tasks never persist. The database ends up in the same state it was in before registration started.

The handler catches that case and turns the rollback into a clean 400, from [controllers/userController.js:69-76](controllers/userController.js#L69-L76):

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

`P2002` is the unique-constraint code. Without the transaction, a half-finished registration could have left orphaned welcome tasks or a user row with no tasks. With it, the failure is all-or-nothing.

### `createMany` for Bulk Inserts

Inside the transaction, the three welcome tasks are inserted with a single `createMany` call rather than three separate `create` calls. That matters for two reasons:

1. **Performance** — one round trip to the database instead of three.
2. **Atomicity within the bulk** — `createMany` issues a single `INSERT ... VALUES (...), (...), (...)`, so either all three rows are inserted or none are.

The same primitive backs the bulk-task endpoint, from [controllers/taskController.js:199-202](controllers/taskController.js#L199-L202):

```js
const result = await prisma.task.createMany({
  data: validTasks,
  skipDuplicates: false,
});
```

`skipDuplicates: false` means a duplicate row (one that would violate a unique constraint) makes the whole call throw rather than silently skip. The return value is `{ count: N }`. Prisma doesn't hand back the created rows because that would force a `RETURNING` clause and undo the bulk-insert win. If the caller needs the rows back, they fetch them in a follow-up query, as the registration handler does.

## 3. When and how do you use raw SQL with Prisma's `$queryRaw`?

### The Task Search Endpoint

The search endpoint in [controllers/analyticsController.js:111-155](controllers/analyticsController.js#L111-L155) is the one place this assignment drops out of Prisma's query builder and writes raw SQL:

```js
const searchPattern = `%${searchQuery}%`;
const exactMatch = searchQuery;
const startsWith = `${searchQuery}%`;

const searchResults = await prisma.$queryRaw`
  SELECT
    t.id,
    t.title,
    t.is_completed as "isCompleted",
    t.priority,
    t.created_at as "createdAt",
    t.user_id as "userId",
    u.name as "user_name"
  FROM tasks t
  JOIN users u ON t.user_id = u.id
  WHERE t.title ILIKE ${searchPattern}
     OR u.name ILIKE ${searchPattern}
  ORDER BY
    CASE
      WHEN t.title ILIKE ${exactMatch} THEN 1
      WHEN t.title ILIKE ${startsWith} THEN 2
      WHEN t.title ILIKE ${searchPattern} THEN 3
      ELSE 4
    END,
    t.created_at DESC
  LIMIT ${parseInt(limit)}
`;
```

### Why Raw SQL Here

Prisma's query builder is great for CRUD and aggregations, but it has limits. Two things this query needs that the builder can't express cleanly:

1. **`ILIKE`** — PostgreSQL's case-insensitive pattern matching. Prisma exposes `contains` with `mode: "insensitive"`, but only for a single field; this query needs to match against both `t.title` and `u.name` in the same `WHERE`, with a relevance-ranked `ORDER BY` over both.
2. **Relevance ranking** — the `ORDER BY CASE WHEN ... THEN 1 ... END` ranks an exact match above a prefix match above a substring match. The Prisma builder has no abstraction for that; raw SQL is the natural way to express it.

When the question is "can I write this in Prisma without contorting it," and the answer is "not really," raw SQL is the right escape hatch.

### Parameterized Queries and SQL Injection

The dangerous way to build a search query would be string concatenation:

```js
// DO NOT DO THIS
const sql = `SELECT * FROM tasks WHERE title ILIKE '%${searchQuery}%'`;
```

If `searchQuery` is `' OR 1=1 --`, the resulting SQL is `WHERE title ILIKE '%' OR 1=1 --%'`, which returns every row in the table. Worse inputs can drop tables, exfiltrate data, or call admin functions.

`$queryRaw` avoids this by being a **tagged template literal**. The expressions in `${...}` aren't pasted into the SQL string, they're extracted and sent to PostgreSQL as separate parameter values. PostgreSQL receives the query template once and the parameter values separately, so the user's input is _data_, never _code_. No matter what `searchPattern` contains, it can't change the structure of the query.

You can see this in action with the four interpolations above (`searchPattern`, `exactMatch`, `startsWith`, `parseInt(limit)`). Each one is bound as a parameter; none of them is concatenated into the SQL string.

### `$queryRaw` vs. `$queryRawUnsafe`

Prisma exposes both methods, and the difference is exactly what the name suggests:

| Method            | Call shape                            | Parameter handling                                                                                                                                            |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$queryRaw`       | Tagged template: `` $queryRaw`...` `` | `${value}` is automatically bound as a parameter. Safe.                                                                                                       |
| `$queryRawUnsafe` | Function call: `$queryRawUnsafe(sql)` | The SQL is whatever string you pass. Concatenated values are concatenated into the query text. Vulnerable to injection unless you pass parameters separately. |

A direct comparison. Safe, the way this controller does it:

```js
await prisma.$queryRaw`SELECT * FROM tasks WHERE title ILIKE ${pattern}`;
```

Unsafe, the way you'd accidentally write it if you reached for the wrong method:

```js
await prisma.$queryRawUnsafe(
  `SELECT * FROM tasks WHERE title ILIKE '${pattern}'`,
);
```

`$queryRawUnsafe` does exist for the rare case where the SQL itself is dynamic (e.g. the column to sort by is chosen at runtime and there's no way to express that as a parameter). In that case, you can still pass parameters separately as additional arguments (e.g. `$queryRawUnsafe(sql, ...params)`) and you must hand-validate any piece of the SQL string you built yourself. For ordinary parameter-driven queries like this search endpoint, `$queryRaw` with template literals is always the right call.
