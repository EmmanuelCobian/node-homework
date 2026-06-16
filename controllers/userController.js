const { StatusCodes } = require("http-status-codes");
const { userSchema } = require("../validation/userSchema");
const crypto = require("crypto");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");
const util = require("util");
const scrypt = util.promisify(crypto.scrypt);
const prisma = require("../db/prisma");
const { OAuth2Client } = require("google-auth-library");

const cookieFlags = (req) => {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };
};

const setJwtCookie = (req, res, user) => {
  const payload = { id: user.id, csrfToken: randomUUID() };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.cookie("jwt", token, { ...cookieFlags(req), maxAge: 3600000 });
  return payload.csrfToken;
};

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function comparePassword(inputPassword, storedHash) {
  const [salt, key] = storedHash.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = await scrypt(inputPassword, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

async function createWelcomeTasks(tx, userId) {
  const welcomeTaskData = [
    {
      title: "Complete your profile",
      userId,
      priority: "medium",
    },
    {
      title: "Add your first task",
      userId,
      priority: "high",
    },
    {
      title: "Explore the app",
      userId,
      priority: "low",
    },
  ];

  await tx.task.createMany({
    data: welcomeTaskData,
  });

  return tx.task.findMany({
    where: {
      userId,
      title: {
        in: welcomeTaskData.map((t) => t.title),
      },
    },
  });
}

async function createUserWithOnboarding(userData) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: userData,
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const welcomeTasks = await createWelcomeTasks(tx, user.id);

    return {
      user,
      welcomeTasks,
    };
  });
}

function createSession(req, res, user) {
  const csrfToken = setJwtCookie(req, res, user);

  return {
    name: user.name,
    email: user.email,
    csrfToken,
  };
}

async function findOrCreateGoogleUser({ email, name }) {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (existingUser) {
    return {
      user: existingUser,
      isNewUser: false,
    };
  }

  const result = await createUserWithOnboarding({
    email: email.toLowerCase(),
    name,
    hashedPassword: "OAUTH_USER_NO_PASSWORD",
  });

  return {
    ...result,
    isNewUser: true,
  };
}

const register = async (req, res, next) => {
  let isPerson = false;
  if (req.body.recaptchaToken) {
    const token = req.body.recaptchaToken;
    const params = new URLSearchParams();
    params.append("secret", process.env.RECAPTCHA_SECRET);
    params.append("response", token);
    params.append("remoteip", req.ip);
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        body: params.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    const data = await response.json();
    if (data.success) isPerson = true;
    delete req.body.recaptchaToken;
  } else if (
    process.env.RECAPTCHA_BYPASS &&
    req.get("X-Recaptcha-Test") === process.env.RECAPTCHA_BYPASS
  ) {
    isPerson = true;
  }
  if (!isPerson) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Bot verification failed. Please complete the reCAPTCHA.",
    });
  }

  const { error, value } = userSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Validation failed",
      details: error.details,
    });
  }

  const hashedPassword = await hashPassword(value.password);

  try {
    const { name, email } = value;
    const result = await createUserWithOnboarding({
      name,
      email: email.toLowerCase(),
      hashedPassword,
    });

    const csrfToken = setJwtCookie(req, res, result.user);

    return res.status(StatusCodes.CREATED).json({
      user: result.user,
      csrfToken: csrfToken,
      welcomeTasks: result.welcomeTasks,
      transactionStatus: "success",
    });
  } catch (e) {
    if (e.name === "PrismaClientKnownRequestError" && e.code === "P2002") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Validation failed. This email is already registered.",
      });
    }
    return next(e);
  }
};

const logon = async (req, res) => {
  const { email, password } = { ...req.body };

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      hashedPassword: true,
    },
  });

  if (!user) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "Authentication Failed" });
  }

  if (user.hashedPassword === "OAUTH_USER_NO_PASSWORD") {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "Authentication Failed" });
  }

  const isMatch = await comparePassword(password, user.hashedPassword);
  if (!isMatch) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "Authentication Failed" });
  }

  return res.json(createSession(req, res, user));
};

const logoff = (req, res) => {
  res.clearCookie("jwt", cookieFlags(req));
  return res.sendStatus(StatusCodes.OK);
};

const googleLogon = async (req, res, next) => {
  const { code } = req.body;

  if (!code) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Missing authorization code",
    });
  }

  try {
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001";
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { name, email } = ticket.getPayload();

    const result = await findOrCreateGoogleUser({ email, name });

    if (!result.isNewUser) {
      return res.json(createSession(req, res, result.user));
    }

    const csrfToken = setJwtCookie(req, res, result.user);
    return res.status(StatusCodes.CREATED).json({
      user: result.user,
      csrfToken: csrfToken,
      welcomeTasks: result.welcomeTasks,
      transactionStatus: "success",
    });
  } catch (error) {
    if (error?.message?.includes("Invalid authorization code")) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Authentication Failed" });
    }
    return next(error);
  }
};

module.exports = { register, logon, logoff, googleLogon };
