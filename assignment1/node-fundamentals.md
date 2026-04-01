# Node.js Fundamentals

## What is Node.js?

Node is an application that runs JavaScript as a ruintime environment on your local machine. Node has no sandbox and operates in the same vein as any other programming language.

## How does Node.js differ from running JavaScript in the browser?

Running JS in Node isn't like running JS in the browser because the user controls the environment with Node. This means that unlike JS in the browser, one could access the file system, operating system information, networking, and more with Node.

## What is the V8 engine, and how does Node use it?

The V8 engine is a JS engine developed by Google and made to power the Google Chrome browser. The engine allows Node.js to execute JS on the service side as a runtime environment wrapper. This means that Node has access to many feautres of compiled code, like a garbage collector, call stack, and just-in-time compilation.

## What are some key use cases for Node.js?

Node.js is useful for programmers who are already familiar with JS and don't need to learn a much more complex language like C++ to get performant programs up and going.

## Explain the difference between CommonJS and ES Modules. Give a code example of each.

**CommonJS (default in Node.js):**

```js
// math.js
const add = (a, b) => a + b;
module.exports = { add };

// main.js
const { add } = require("./math");
add(6, 7);
```

**ES Modules (supported in modern Node.js):**

```js
// math.js
export const add = (a, b) => a + b;

// main.js
import { add } from "./math.js";
add(6, 7);
```
