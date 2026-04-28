const express = require("express");
const router = express.Router();
const { ValidationError, NotFoundError } = require("../errors");
const dogs = require("../dogData.js");

router.get("/dogs", (req, res) => {
  res.json(dogs);
});

router.post("/adopt", (req, res) => {
  const { name, address, email, dogName } = req.body;
  if (!name || !email || !dogName) {
    throw new ValidationError("Missing required fields");
  }

  const dog = dogs.find((d) => d.name === dogName);
  if (!dog || dog.status !== "available") {
    throw new NotFoundError("Dog not found or not available");
  }

  return res.status(201).json({
    message: `Adoption request received. We will contact you at ${email} for further details.`,
  });
});

router.get("/error", (req, res) => {
  throw new Error();
});

module.exports = router;
