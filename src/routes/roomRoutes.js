import express from "express";
const router = express.Router();
import { createRoom, getRoomByCode, getAvailableRooms } from "../services/roomService.js";
import authMiddleware from "../middleware/authMiddleware.js";
import validateCode from '../middleware/validateCode.js';

// get all rooms that are not full and still in lobby
router.get("/available", authMiddleware, async (req, res) => {
  try {
    const rooms = await getAvailableRooms();
    res.json(rooms);
  } catch (err) {
    console.error("getAvailableRooms error", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// create a new room by host
router.post("/createNew", authMiddleware, async (req, res) => {
  try {
    const hostUserId = req.user.id;

    const room = await createRoom(hostUserId);
    res.status(201).json(room);
  } catch (err) {
    console.error("createRoom error", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// lookup for existing room
router.get("/:code/lookup", validateCode, authMiddleware, async (req, res) => {
  try {
    const code = req.params.code;

    if (!code) return res.status(404).json({ message: "Code not found" });

    const room = await getRoomByCode(code);

    if (!room) return res.status(404).json({ message: "Room not found" });

    // populate players for the lookup response
    await room.populate("players");
    res.json(room);

  } catch (err) {
    console.error("getRoomByCode error", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;