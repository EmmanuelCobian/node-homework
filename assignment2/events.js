const EventEmitter = require("events");
const emitter = new EventEmitter();

emitter.on("time", (time) => {
  console.log(`Time received: ${time}`);
});

emitter.on("error", (error) => {
  console.log(`The emitter reported an error: ${error}`);
});

setInterval(() => {
  emitter.emit("time", new Date().toString());
}, 5000);

module.exports = emitter;
