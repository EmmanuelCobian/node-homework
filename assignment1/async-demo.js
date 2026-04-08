const fs = require("fs");
const path = require("path");

// Write a sample file for demonstration
const filePath = path.join(__dirname, "sample-files", "sample.txt");

fs.writeFile(filePath, "Hello, async world!", (err) => {
  if (err) throw err;
});

// 1. Callback style
fs.readFile(filePath, "utf-8", (err, data) => {
  if (err) throw err;
  console.log("Callback read", data);
});

// Callback hell example (test and leave it in comments):
// fs.readFile(filePath, "utf-8", (err, data) => {
//   if (err) throw err;
//   fs.readFile(filePath, "utf-8", (err, data2) => {
//     if (err) throw err;
//     fs.readFile(filePath, "utf-8", (err, data3) => {
//       if (err) throw err;
//       console.log("Deeply nested callbacks.");
//     });
//   });
// });

// 2. Promise style
const readSampleFile = () => {
  fs.promises
    .readFile(filePath, "utf-8")
    .then((data) => console.log("Promise read:", data))
    .catch((err) => console.log("An error occurred.", err));
};

readSampleFile();

// 3. Async/Await style
const readFileAsyncAwait = async () => {
  try {
    const data = await fs.promises.readFile(filePath, "utf-8");
    console.log("Async/Await read:", data);
  } catch (err) {
    console.log("An error occurred:", err);
  }
};

readFileAsyncAwait();
