import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";

import lobbySocketHandler from "./sockets/lobbySocket.js";
import gameSocketHandler from "./sockets/gameSocket.js";
import { getGameState, resolveVoting, isTimerExpired, finishGame } from "./services/gameStateService.js";

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
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());



//ROUTES
app.use("/room", roomRoutes);
app.use("/auth", authRoutes);
app.use("/reAuth", refreshRoutes);


//normal and protected route for testing
app.get("/", (req, res) => {
  res.json({ ok: true, message: "CrewOrCrook backend is running" });
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

import redisClient from "./redis/redisClient.js";


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

// GAME TIMER LOOP
setInterval(async () => {
  try {
    const keys = await redisClient.keys("game:*");

    for (const key of keys) {
      const roomCode = key.split(":")[1];
      const state = await getGameState(roomCode);

      if (!state) continue;

      // Only care about meetings
      if (state.phase === "meeting" && isTimerExpired(state, "meetingEndAt")) {

        console.log(`Meeting timer expired for room ${roomCode}`);

        const result = await resolveVoting(roomCode);

        io.to(roomCode).emit("game:vote-result", result);

        if (result.winner) {
          io.to(roomCode).emit("game:ended", {
            winner: result.winner
          });

          await finishGame(roomCode);
        } else {
          io.to(roomCode).emit("game:freeplay-resumed");
        }
      }
    }

  } catch (err) {
    console.error("Timer loop error:", err.message);
  }
}, 3000); // every 3 seconds


//SERVER + DB START

const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/creworcrook";

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err.message));
