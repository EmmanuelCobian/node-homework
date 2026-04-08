const http = require("http");

const server = http.createServer({ keepAliveTimeout: 60000 }, (req, res) => {
  if (
    req.method === "POST" &&
    req.url === "/" &&
    req.headers["content-type"] === "application/json"
  ) {
    let body = "";
    req.on("data", (chunk) => (body += chunk)); // this is how you assemble the body.
    req.on("end", () => {
      // this event is emitted when the body is completely assembled.  If there isn't a body, it is emitted when the request arrives.
      const parsedBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          weReceived: parsedBody,
        }),
      );
    });
  } else if (req.method != "GET") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: "That route is not available.",
      }),
    );
  } else if (req.url === "/secret") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: "The secret word is 'Swordfish'.",
      }),
    );
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        pathEntered: req.url,
      }),
    );
  }
});

server.listen(8000);
