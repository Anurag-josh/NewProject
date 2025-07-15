const express = require('express');
const router = express.Router();
const Expert = require('../models/expert');
const Message = require('../models/message');
const ChatRoom = require('../models/chatRoom');

const EXPERT_SECRET_CODE = 'xyz';

router.get('/', async (req, res) => {
  const experts = await Expert.find({ isAvailable: true });
  res.render('ask-expert', { experts });
});

router.post('/register', async (req, res) => {
  const { name, email, code } = req.body;
  if (code !== EXPERT_SECRET_CODE) {
    return res.send('Invalid access code.');
  }
  await Expert.create({ name, email });
  req.session.expertId = (await Expert.findOne({ email }))._id;
  res.redirect("/experts/dashboard");
});

router.get("/dashboard", async (req, res) => {
  const expertId = req.session.expertId;

  // ✅ Fixed aggregation to get latest message per sender (roomId)
  const recentDoubts = await Message.aggregate([
    { $match: { receiverId: expertId.toString() } }, // ✅ Convert to string for matching
    {
      $sort: { timestamp: -1 } // ✅ Sort by latest first
    },
    {
      $group: {
        _id: "$roomId", // ✅ Group by roomId instead of senderId
        lastMessage: { $first: "$$ROOT" }, // ✅ Get the latest message
        totalMessages: { $sum: 1 } // ✅ Count total messages
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.senderId",
        foreignField: "_id",
        as: "farmer"
      }
    },
    {
      $lookup: { // ✅ Alternative lookup using string conversion
        from: "users",
        let: { senderIdStr: { $toString: "$lastMessage.senderId" } },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$senderIdStr"] } } }
        ],
        as: "farmerAlt"
      }
    },
    {
      $addFields: {
        farmer: {
          $cond: {
            if: { $gt: [{ $size: "$farmer" }, 0] },
            then: { $arrayElemAt: ["$farmer", 0] },
            else: { $arrayElemAt: ["$farmerAlt", 0] }
          }
        }
      }
    },
    {
      $match: { farmer: { $ne: null } } // ✅ Only include results with valid farmer
    },
    {
      $sort: { "lastMessage.timestamp": -1 } // ✅ Sort by latest message time
    }
  ]);

  console.log("📊 Dashboard data:", JSON.stringify(recentDoubts, null, 2));

  res.render("expert-dashboard", { 
    doubts: recentDoubts, 
    expertId: expertId.toString() 
  });
});

router.post('/login', async (req, res) => {
  const { email, code } = req.body;
  if (code !== EXPERT_SECRET_CODE) {
    return res.send('Invalid access code.');
  }
  const expert = await Expert.findOne({ email });
  if (!expert) {
    return res.send('Expert not found.');
  }
  req.session.expertId = expert._id;
  res.redirect(`/experts/chat?id=${expert._id}`);
});

router.get('/chat', async (req, res) => {
  const expertId = req.query.id;
  const roomId = expertId;

  // Check or create chat room
  let chatRoom = await ChatRoom.findOne({ roomId });
  if (!chatRoom) {
    chatRoom = await ChatRoom.create({ roomId, createdBy: expertId });
  }

  if (!chatRoom.active) {
    return res.send("This chat room has been closed.");
  }

  const expert = await Expert.findById(expertId);
  // ✅ Fixed query to get messages by roomId
  const messages = await Message.find({ roomId }).sort({ timestamp: 1 });
  const currentSender = req.session.expertId || (req.user && req.user._id);

  res.render('expert-chat', { expert, messages, currentSender, roomId });
});

router.post('/chat/send', async (req, res) => {
  const { expertId, content, receiverId } = req.body;
  const senderId = req.session.expertId;
  const roomId = expertId;

  if (!senderId) return res.status(403).send("Not authorized");

  await Message.create({
    roomId,
    senderId: senderId.toString(),
    receiverId: receiverId || null,
    content,
    senderType: 'expert',
    timestamp: new Date()
  });

  res.redirect(`/experts/chat?id=${expertId}`);
});

// ✅ Add route to end chat
router.post('/chat/end', async (req, res) => {
  const { roomId } = req.body;
  
  // Mark chat room as inactive
  await ChatRoom.findOneAndUpdate(
    { roomId },
    { active: false }
  );

  res.json({ success: true });
});

router.get('/logout', (req, res) => {
  req.session.expertId = null;
  res.redirect('/experts');
});

module.exports = router;