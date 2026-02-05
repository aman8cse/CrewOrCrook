import jwt from "jsonwebtoken";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import lobbySocketHandler from "./sockets/lobbySocket.js";
import gameSocketHandler from "./sockets/gameSocket.js";

import roomRoutes from "./routes/roomRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import refreshRoutes from "./routes/refreshRoute.js";
import cookieParser from "cookie-parser";
import authMiddleware from "./middleware/authMiddleware.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

//CORS_CONFIG
const CLIENT_ORIGIN = "http://localhost:3000";

const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true,
  },
});



// middleware
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());



//ROUTES
app.use("/room", roomRoutes);
app.use("/auth", authRoutes);
app.use("/reAuth", refreshRoutes);


//for testing normal and protected route
app.get("/", (req, res) => {
  res.send("CrewOrCrook backend is running");
});
app.get("/protected", authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});



//GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
});





//SOCKET AUTH MIDDLEWARE

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = decoded;

    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

//redis temporary check
import redisClient from "./redis/redisClient.js";

await redisClient.set("test:key", "hello");
const val = await redisClient.get("test:key");
console.log("Redis test value:", val);




//SOCKET LOGIC

io.on("connection", (socket) => {
  console.log(
    `New socket connected: ${socket.id} | user: ${socket.user?.id}`
  );

  lobbySocketHandler(io, socket);
  gameSocketHandler(io, socket);

  socket.on("disconnect", () => {
    console.log(
      `Socket disconnected: ${socket.id} | user: ${socket.user?.id}`
    );
  });
});





//SERVER + DB START

const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb+srv://aman8cse_db_user:lPvDkZMRdelca6qi@cluster0.xy6rfhm.mongodb.net/";

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err.message));
