const { StatusCodes } = require("http-status-codes");
const { userSchema } = require("../validation/userSchema");

const register = (req, res) => {
  if (!req.body) req.body = {};
  const { error, value } = userSchema.validate(
    { ...req.body },
    { abortEarly: false },
  );

  if (error)
    return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });

  global.users.push(value);
  global.user_id = value;
  delete req.body.password;
  res.status(StatusCodes.CREATED).json(req.body);
};

const logon = (req, res) => {
  const { email, password } = { ...req.body };
  const user = global.users.find((user) => user.email === email);
  if (user && user.password === password) {
    global.user_id = user;
    res.status(StatusCodes.OK).json({ name: user.name, email: user.email });
  } else {
    res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "Authentication Failed" });
  }
};

const logoff = (req, res) => {
  global.user_id = null;
  res.sendStatus(StatusCodes.OK);
};

module.exports = { register, logon, logoff };
