import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

    socketId: { type: String },

    role: {
      type: String,
      enum: ["crewmate", "imposter"],
      default: "crewmate",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Player", playerSchema);
