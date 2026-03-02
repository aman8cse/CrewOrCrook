import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },

    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    players: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],

    maxPlayers: { type: Number, default: 6 },

    state: {
      type: String,
      enum: ["lobby", "started", "in-game", "meeting", "finished"],
      default: "lobby",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Room", roomSchema);
