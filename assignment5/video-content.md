# Week 5: SQL and PostgreSQL

## 1. What are the key concepts of relational databases and how do they work?

### Primary and Foreign Keys

| Key             | What it does                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| **Primary key** | A column (or set of columns) that uniquely identifies each row in a table. Every table should have exactly one. |
| **Foreign key** | A column in one table that points at the primary key of another. This is the mechanism that links tables.       |

In the assignment schema, `orders.customer_id` is a foreign key into `customers.customer_id`. That single column is what lets a query like the one in [assignment5-sql.txt:4](assignment5-sql.txt#L4) say "for every order, find the customer who placed it" without ever copying the customer's name onto the order row.

### Table Relationships

| Relationship     | Example                                                              | How it's modeled                                                                     |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **One-to-one**   | A user and their profile settings                                    | A foreign key on either side, with a `UNIQUE` constraint so only one match can exist |
| **One-to-many**  | One customer places many orders                                      | The "many" side (orders) holds a foreign key pointing at the "one" side (customers)  |
| **Many-to-many** | One order contains many products; one product appears in many orders | A **join table** in between (`line_items`) with foreign keys to both sides           |

### Constraints

Constraints are rules the database enforces on every write.

- `PRIMARY KEY` — uniqueness + not-null, in one declaration.
- `FOREIGN KEY` — the referenced row must exist; you can't have a `line_item` for an `order_id` that was never created.
- `NOT NULL` — the column always has a value.
- `UNIQUE` — no two rows can share this value (used for emails, usernames).
- `CHECK` — arbitrary condition (e.g. `price > 0`).

## 2. What are the main SQL operations and how do you use them effectively?

### The Four CRUD Statements

| Statement | Purpose                           |
| --------- | --------------------------------- |
| `SELECT`  | Read rows from one or more tables |
| `INSERT`  | Create new rows                   |
| `UPDATE`  | Modify existing rows              |
| `DELETE`  | Remove rows                       |

A `SELECT` answers a question; the other three change state and should usually run inside a transaction so a failure halfway through doesn't leave the database in a half-updated mess. From [assignment5-sql.txt:9-12](assignment5-sql.txt#L9-L12):

```sql
BEGIN;
INSERT INTO orders (customer_id, employee_id, date)
  VALUES (16, 7, '2026-05-04') RETURNING order_id;
INSERT INTO line_items (order_id, product_id, quantity)
  VALUES (250, 23, 10), (250, 18, 10), (250, 43, 10), (250, 9, 10), (250, 44, 10);
COMMIT;
```

If the second `INSERT` fails (say, a bad `product_id`), `COMMIT` never runs and the order row is rolled back too. You don't end up with an order that has no line items.

### JOINs

A `JOIN` combines rows from two tables based on a related column. The most common is `INNER JOIN` (default), which returns only rows where the match exists on both sides:

```sql
SELECT o.order_id, c.customer_name
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id;
```

Other variants:

| Join type    | Returns                                                               |
| ------------ | --------------------------------------------------------------------- |
| `INNER JOIN` | Rows where the join condition matches on both sides                   |
| `LEFT JOIN`  | All rows from the left table, plus matches from the right (or `NULL`) |
| `RIGHT JOIN` | Mirror of `LEFT JOIN`                                                 |
| `FULL JOIN`  | All rows from both sides; unmatched cells are `NULL`                  |

### Aggregation: `GROUP BY` and `HAVING`

Aggregation collapses many rows into one summary row per group. From [assignment5-sql.txt:15](assignment5-sql.txt#L15):

```sql
SELECT first_name, last_name, COUNT(order_id) AS order_count
FROM employees e
JOIN orders o ON e.employee_id = o.employee_id
GROUP BY e.employee_id
HAVING COUNT(order_id) > 5
ORDER BY last_name;
```

Common aggregation functions are `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX`. They only make sense in the context of `GROUP BY` (or against the whole table).

### `WHERE` vs. `HAVING`

These look similar but operate at different stages of the query:

| Clause   | Runs                                      | Can reference                            |
| -------- | ----------------------------------------- | ---------------------------------------- |
| `WHERE`  | Before grouping — filters individual rows | Raw column values                        |
| `HAVING` | After grouping — filters the grouped rows | Aggregates like `COUNT(*)`, `SUM(price)` |

The query above uses `HAVING COUNT(order_id) > 5` because the filter depends on a count, which doesn't exist until rows are grouped. If you tried to write `WHERE COUNT(order_id) > 5`, the database would reject it — the count hasn't been computed yet at that stage.

## 3. How do you work with data from multiple tables and perform aggregations?

### Combining Tables with Multi-Way JOINs

Real questions usually span more than two tables. The "total price of an order" needs `orders` (which order), `line_items` (how many of each product), and `products` (the unit price). From [assignment5-sql.txt:2](assignment5-sql.txt#L2):

```sql
SELECT o.order_id, SUM(li.quantity * p.price) AS total_price
FROM orders o
JOIN line_items li ON o.order_id = li.order_id
JOIN products p ON p.product_id = li.product_id
GROUP BY o.order_id
ORDER BY o.order_id
LIMIT 5;
```

What's happening:

1. `orders` is joined to `line_items` to expand each order into its individual items.
2. `line_items` is joined to `products` to pull the unit price for each item.
3. `quantity * price` is computed per row, then `SUM` collapses all rows for one order into one total.
4. `GROUP BY o.order_id` is what makes the `SUM` per-order rather than across the whole table.
5. `ORDER BY` and `LIMIT` are applied last, after the totals are computed.

### Aggregations: `SUM`, `COUNT`, `AVG`

| Function            | Use                                                     |
| ------------------- | ------------------------------------------------------- |
| `COUNT(*)`          | Number of rows in the group                             |
| `SUM(x)`            | Total of `x` across the group (only on numeric columns) |
| `AVG(x)`            | Mean of `x` (returns `NULL` if all values are `NULL`)   |
| `MIN(x)` / `MAX(x)` | Smallest / largest value in the group                   |

You can layer aggregations using a CTE (common table expression) when you need to aggregate twice — for example, "average order total per customer" requires first summing each order, then averaging those sums. From [assignment5-sql.txt:4](assignment5-sql.txt#L4):

```sql
WITH OrderTotals AS (
  SELECT o.order_id, o.customer_id,
         SUM(li.quantity * p.price) AS total_price
  FROM orders o
  JOIN line_items li ON o.order_id = li.order_id
  JOIN products p ON p.product_id = li.product_id
  GROUP BY o.order_id
)
SELECT customer_name, AVG(total_price) AS average_order_price
FROM OrderTotals ot
JOIN customers c ON c.customer_id = ot.customer_id
GROUP BY c.customer_id
ORDER BY customer_name;
```

The CTE computes one total per order; the outer query averages those totals per customer. Trying to do this in a single `GROUP BY` would average line items, not orders.

### `WHERE` vs. `HAVING` in Practice

Same distinction as above, but worth restating in the multi-table context: `WHERE` filters rows _before_ they're grouped, `HAVING` filters _after_. If you only want orders placed in 2026 grouped by customer, the date filter goes in `WHERE` (it's a row-level condition). If you only want customers whose total spend exceeds $1,000, that filter goes in `HAVING` (it depends on the `SUM` that doesn't exist until grouping).

Putting an aggregate-based filter in `WHERE`, or a row-based filter in `HAVING`, is one of the most common SQL mistakes — and one of the easiest to fix once the two stages are clear.
