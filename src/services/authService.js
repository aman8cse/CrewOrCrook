import User from '../models/userModel.js';
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken } from '../utils/token.js';

const SALT_ROUNDS = 10;

//register new user through this function
export const register = async({ username, password, email, zealId, rollNo, section, avatar }) => {
    if(!username || !password) {
        throw new Error("Missing required fields");
    }

    const existingUser = await User.findOne({ username });
    if(existingUser) {
        console.log("User already exists");
        const err = new Error("User already exists");
        err.status = 400;
        throw err;
    }
    const existingMail = await User.findOne({ email });
    if(email && existingMail) {
        console.log("Email already exists");
        const err = new Error("Email already exists");
        err.status = 400;
        throw err;
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
        username,
        password: hashed,
        email,
        zealId,
        rollNo,
        section,
        avatar: avatar ?? null,
    });

    return {
        message: "User created",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    };
};

//user login function
export const login = async ({ username, password }) => {
    if(!username || !password) {
        const err = new Error("Missing credentials");
        err.status = 400;
        throw err;
    }

    const user = await User.findOne({ username });
    if(!user) {
        const err = new Error("User not exist");
        err.status = 400;
        throw err;
    }

    const match = await bcrypt.compare(password, user.password);
    if(!match) {
        const err = new Error("Wrong Password");
        err.status = 400;
        throw err;
    }

    const payload = { id: user._id, username: user.username};
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    return {
        user,
        accessToken,
        refreshToken
    };
};

//setup for additional details from user
export const setup = async (userId, { email, zealId, rollNo, section, avatar }) => {
  if (!email || !zealId || !rollNo || !section || !avatar) {
    const err = new Error("Some fields are missing");
    err.status = 400;
    throw err;
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
   {
    email,
    zealId,
    rollNo,
    section,
    avatar
   },
   { new: true }
   );

if (!updatedUser) {
  const err = new Error("User not found");
  err.status = 404;
  throw err;
}

return {
  message: "Setup completed successfully",
  user: updatedUser,
};

};
