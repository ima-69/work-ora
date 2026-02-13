import getBuffer from "../utils/buffer.js";
import { sql } from "../utils/db.js";
import ErrorHandler from "../utils/errorHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import bcrypt from "bcrypt";
import axios from "axios";
import jwt from "jsonwebtoken";
import { forgotPasswordTemplate } from "../template.js";
import { publishToTopic } from "../producer.js";
import { redisClient } from "../index.js";

export const registerUser = TryCatch(async (req, res, next) => {
  const { name, email, password, phoneNumber, role, bio } = req.body;

  if (!name || !email || !password || !phoneNumber || !role) {
    throw new ErrorHandler(
      400,
      "Please provide all required fields: name, email, password, phoneNumber, role",
    );
  }

  const existingUser =
    await sql`SELECT user_id FROM users WHERE email = ${email}`;

  if (existingUser.length > 0) {
    throw new ErrorHandler(400, "User with this email already exists");
  }

  if (role !== "recruiter" && role !== "jobseeker") {
    throw new ErrorHandler(
      400,
      "Role must be either 'recruiter' or 'jobseeker'",
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  let registeredUser;

  if (role === "recruiter") {
    const [user] =
      await sql`INSERT INTO users (name, email, password, phone_number, role) VALUES 
        (${name}, ${email}, ${hashedPassword}, ${phoneNumber}, ${role}) RETURNING 
        user_id, name, email, phone_number, role, created_at`;

    registeredUser = user;
  } else if (role === "jobseeker") {
    const file = req.file;

    if (!file) {
      throw new ErrorHandler(400, "Resume file is required for jobseekers");
    }

    const fileBuffer = getBuffer(file);

    if (!fileBuffer || !fileBuffer.content) {
      throw new ErrorHandler(500, "Failed to generate buffer");
    }

    const { data } = await axios.post(
      `${process.env.UPLOAD_SERVICE_URL}/api/utils/upload`,
      { buffer: fileBuffer.content },
    );

    const [user] =
      await sql`INSERT INTO users (name, email, password, phone_number, role, bio, resume, resume_public_id) VALUES 
        (${name}, ${email}, ${hashedPassword}, ${phoneNumber}, ${role}, ${bio}, ${data.url}, ${data.public_id}) RETURNING 
        user_id, name, email, phone_number, role, bio, resume, created_at`;

    registeredUser = user;
  }

  const token = jwt.sign(
    { id: registeredUser?.user_id },
    process.env.JWT_SECRET as string,
    {
      expiresIn: "15d",
    },
  );

  res.status(201).json({
    message: "User registered successfully",
    registeredUser,
    token,
  });
});

export const loginUser = TryCatch(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ErrorHandler(400, "Please provide both email and password");
  }

  const user = await sql`
    SELECT u.user_id, u.name, u.email, u.password, u.phone_number, u.role, u.bio, u.resume, u.profile_pic, u.subscription, 
    ARRAY_AGG(s.name) 
    FILTER(WHERE s.name IS NOT NULL) AS skills
    FROM users u
    LEFT JOIN user_skills us ON u.user_id = us.user_id
    LEFT JOIN skills s ON us.skill_id = s.skill_id
    WHERE u.email = ${email}
    GROUP BY u.user_id
  `;

  if (user.length === 0) {
    throw new ErrorHandler(400, "Invalid credentials");
  }

  const userObject = user[0];

  const matchPassword = await bcrypt.compare(password, userObject.password);

  if (!matchPassword) {
    throw new ErrorHandler(400, "Invalid credentials");
  }

  userObject.skills = userObject.skills || [];

  delete userObject.password;

  const token = jwt.sign(
    { id: userObject.user_id },
    process.env.JWT_SECRET as string,
    {
      expiresIn: "15d",
    },
  );

  res.status(201).json({
    message: "User logged in successfully",
    userObject,
    token,
  });
});

export const forgotPassword = TryCatch(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    throw new ErrorHandler(400, "Email is required");
  }

  const users =
    await sql`SELECT user_id, email FROM users WHERE email = ${ email }`;

  if (users.length === 0) {
    return res.json({
      message: "If that email exists, we have sent a reset link",
    })
  }

  const user = users[0];

  const resetToken = jwt.sign({
    email: user.email,
    type: "reset"
  }, process.env.JWT_SECRET as string, {
    expiresIn: "15m",
  });

  const resetLink = `${process.env.FRONTEND_URL}/reset/${resetToken}`;

  await redisClient.set(`forgot:${email}`, resetToken, {
    EX: 15 * 60, 
  });

  const message = {
    to: email,
    subject: "Reset Your Password - Work-Ora",
    html: forgotPasswordTemplate(resetLink),
  };

  publishToTopic("send-mail", message).catch((err) => {
    console.error("Failed to send message:", err);
  });
  
  res.json({
    message: "If that email exists, we have sent a reset link",
  });
});