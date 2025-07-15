const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  roomId: String,
  senderType: String, // "expert" or "farmer"
  senderId: String,
  receiverId: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false }
});

module.exports = mongoose.model("Message", messageSchema);
