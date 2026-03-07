export default function validateCode(req, res, next) {
  const code = req.params.code || req.body.roomCode;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ message: "Room code required" });
  }

  const valid = /^[A-Z0-9]{6}$/.test(code);

  if (!valid) {
    return res.status(400).json({ message: "Invalid room code format" });
  }

  next();
}