const os = require("os");
const path = require("path");
const fs = require("fs");

console.log("Platform:", os.platform());
console.log("CPU:", os.cpus()[0].model);
console.log("Total Memory:", os.totalmem());

const run = async () => {
  const filePath = path.join(__dirname, "sample-files", "demo.txt");
  console.log("Joined path:", filePath);

  await fs.promises.writeFile(filePath, "Hello from fs.promises!");
  const data = await fs.promises.readFile(filePath, "utf-8");
  console.log("fs.promises read:", data);

  const largeFilePath = path.join(__dirname, "sample-files", "largefile.txt");
  const lines = Array.from(
    { length: 100 },
    (_, i) => `This is line ${i + 1} in a large file.\n`,
  ).join("");
  await fs.promises.writeFile(largeFilePath, lines);

  const readStream = fs.createReadStream(largeFilePath, {
    encoding: "utf8",
    highWaterMark: 1024,
  });

  readStream.on("data", (chunk) => {
    console.log("Read chunk:", chunk.slice(0, 40));
  });

  readStream.on("end", () => {
    console.log("Finished reading large file with streams.");
  });

  readStream.on("error", (err) => {
    console.error("Error reading file:", err);
  });
};

run();
