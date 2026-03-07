import mongoose from "mongoose";
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: {type: String, required: true},
    avatar: { type: String, default: null },
    zealId: {type: String},
    rollNo: {type: String},
    section: {type: String},
    email: {type: String, unique: true, sparse: true}
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);