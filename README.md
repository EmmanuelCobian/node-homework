# CTD Node Final Project

A secure, full-featured task management REST API built with Node.js, Express, and PostgreSQL. This is my final project for Code the Dream's Node course, developed incrementally over the course of the program. It provides user accounts, per-user task management, and analytics endpoints, with a strong focus on authentication, security, and data validation.

The API is designed to be consumed by a separate React front end, but every endpoint can also be exercised directly with Postman or `curl`.

[Demo Video](https://youtu.be/TWBpCzpGuN0)

## Project Overview

This API lets a user:

- Register an account, protected by Google reCAPTCHA, or sign in with Google OAuth
- Authenticate via secure, HTTP-only JWT cookies with CSRF protection
- Create, read, update, and delete their own tasks
- Bulk-create multiple tasks in a single request
- Paginate and filter their task list
- View per-user analytics: task completion stats, recent activity, and weekly progress
- Run a relevance-ranked full-text search across tasks

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Database:** PostgreSQL
- **ORM:** Prisma 6
- **Authentication:** JSON Web Tokens (`jsonwebtoken`) stored in HTTP-only cookies, plus Google OAuth 2.0 (`google-auth-library`)
- **Validation:** Joi
- **Security:** Helmet, CORS, `express-rate-limit`, `express-xss-sanitizer`, scrypt password hashing, CSRF tokens, Google reCAPTCHA
- **Testing:** Jest + Supertest
- **Tooling:** ESLint, Prettier, nodemon
- **Deployment:** Render, Neon

## Setup Instructions

### Prerequisites

- Node.js
- PostgreSQL
- Git

### 1. Clone and install

```bash
git clone <your-repo-url> node-homework
cd node-homework
npm install
```

### 2. Create the database

Create a PostgreSQL database for the project (the app uses one database for the task/user data):

```sql
CREATE DATABASE tasklist OWNER <username>;
CREATE DATABASE testtasklist OWNER <username>;
```

### 4. Run database migrations

Prisma manages the `users` and `tasks` tables. Apply the migrations and generate the client:

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Start the server

```bash
npm run dev
```

Verify it's running:

```bash
curl http://localhost:3000/health
# { "status": "ok", "db": "connected" }
```

## API Endpoints

### Public / utility

| Method | Path      | Description                               |
| ------ | --------- | ----------------------------------------- |
| `GET`  | `/`       | Hello-world.                              |
| `GET`  | `/health` | Reports server and database connectivity. |

### Users — `/api/users`

| Method | Path           | Auth       | Description                                                     |
| ------ | -------------- | ---------- | --------------------------------------------------------------- |
| `POST` | `/register`    | reCAPTCHA  | Create an account; returns user, CSRF token, and welcome tasks. |
| `POST` | `/logon`       | —          | Log in with email + password.                                   |
| `POST` | `/googleLogon` | —          | Log in / sign up with a Google OAuth                            |
| `POST` | `/logoff`      | JWT + CSRF | Clear the auth cookie.                                          |

### Tasks — `/api/tasks` (all require JWT)

| Method   | Path    | Description                                                                                                          |
| -------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`     | List your tasks. Supports `?page`, `?limit`, and `?find=<text>` title search. Returns pagination metadata. |
| `POST`   | `/`     | Create a task.                                                                                                       |
| `POST`   | `/bulk` | Create many tasks in one request (`{ "tasks": [...] }`).                                                             |
| `GET`    | `/:id`  | Fetch one of your tasks by ID.                                                                                       |
| `PATCH`  | `/:id`  | Update a task's title, priority, or completion.                                                                      |
| `DELETE` | `/:id`  | Delete a task.                                                                                                       |

### Analytics — `/api/analytics` (all require JWT)

| Method | Path                     | Description                                                                       |
| ------ | ------------------------ | --------------------------------------------------------------------------------- |
| `GET`  | `/users`                 | Paginated list of users with task counts and a sample of incomplete tasks.        |
| `GET`  | `/users/:id`             | A user's task stats, 10 most recent tasks, and weekly progress.                   |
| `GET`  | `/tasks/search?q=<term>` | Relevance-ranked search across task titles and user names (raw SQL with `ILIKE`). |

## Running Tests

```bash
npm test
```

## Deployed Backend

The API is deployed on Render:

**https://node-homework-5kx0.onrender.com/**

Try the health check: [https://node-homework-5kx0.onrender.com/health](https://node-homework-5kx0.onrender.com/health)
