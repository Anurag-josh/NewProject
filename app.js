const express = require('express');
const app = express();
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const mongoose = require("mongoose");
const session = require("express-session");
const LocalStrategy = require("passport-local");
const passport = require("passport");
const flash = require('connect-flash');
const indexRoutes = require('./routes/index');
const labRoutes = require('./routes/labs');
const landingRoutes = require('./routes/landing');
const signupRoute = require('./routes/user');
const MongoStore = require('connect-mongo');
const User = require("./models/user.js");
const historyRoutes = require('./routes/history');
const chatbotRoutes = require('./routes/chatbot');
const weatherRoutes = require('./routes/weather');
const marketplaceRoutes = require('./routes/marketplace.js');
const expertRoutes = require('./routes/experts.js');
const Message = require('./models/message');

const socketUserMap = new Map();


//-----------------------
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server);
//-------spcket-------------






const i18n = require('i18n');
const cookieParser = require('cookie-parser');

// --- Connect MongoDB ---
const MONGO_URL = "mongodb://127.0.0.1:27017/framfriend";
mongoose.connect(MONGO_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log(err));

// --- Session Store Setup ---
const store = MongoStore.create({
  mongoUrl: MONGO_URL,
  crypto: { secret: "mycode" },
  touchAfter: 24 * 3600
});

store.on("error", (err) => {
  console.log("ERROR in MONGO SESSION STORE", err);
});

// --- Session Config ---
const sessionOptions = {
  store,
  secret: "mycode",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true
  }
};

// --- i18n Config ---
app.use(cookieParser()); // ✅ must come before i18n.init

i18n.configure({
  locales: ['en', 'hi', 'mr'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'en',
  cookie: 'lang',
  queryParameter: 'lang',
  autoReload: true,
  syncFiles: true
});

app.use(i18n.init);

// ✅ Set locale from cookie on each request
app.use((req, res, next) => {
  const lang = req.cookies.lang;
  if (lang && ['en', 'hi', 'mr'].includes(lang)) {
    req.setLocale(lang);
  }
  res.locals.locale = req.getLocale();
  next();
});

// --- View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


//----socket.io setup---
// ✅ Updated socket.io setup in app.js
io.on('connection', (socket) => {
  console.log('🔌 New socket connected:', socket.id);

  // 🧠 Expert registers so we can target him later
  socket.on('registerExpert', (expertId) => {
    socketUserMap.set(expertId.toString(), socket.id);
    console.log(`✅ Expert ${expertId} mapped to socket ${socket.id}`);
  });

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // ✅ Enhanced chatMessage handler
  socket.on("chatMessage", async ({ roomId, message, senderId, receiverId, senderType }) => {
    console.log("📥 Received chatMessage", { roomId, message, senderId, receiverId, senderType });

    try {
      // ✅ Save message to database
      const savedMessage = await Message.create({
        roomId,
        senderId,
        receiverId,
        content: message,
        senderType,
        timestamp: new Date()
      });

      // ✅ Emit to room participants
      io.to(roomId).emit("chatMessage", { 
        message, 
        senderId,
        messageId: savedMessage._id,
        timestamp: savedMessage.timestamp
      });

      // ✅ If this is a farmer message, notify expert dashboard
      if (senderType === 'user' && receiverId) {
        const expertSocketId = socketUserMap.get(receiverId.toString());
        console.log("🔎 Looking for expert socket:", receiverId, "=>", expertSocketId);

        if (expertSocketId) {
          // ✅ Get additional info for dashboard notification
          const User = require('./models/user');
          let farmerInfo = null;
          
          try {
            farmerInfo = await User.findById(senderId);
          } catch (err) {
            console.log("❌ Could not find farmer info:", err);
          }

          io.to(expertSocketId).emit("newMessageInDashboard", {
            senderId,
            message,
            roomId,
            farmerName: farmerInfo ? farmerInfo.name : 'Unknown User',
            timestamp: savedMessage.timestamp
          });
          
          console.log("📤 Sent newMessageInDashboard to expert socket:", expertSocketId);
        } else {
          console.log("❌ Expert socket not found in map.");
        }
      }
    } catch (error) {
      console.error("❌ Error handling chatMessage:", error);
    }
  });

  // ✅ Alternative registration method
  socket.on("register", expertId => {
    socketUserMap.set(expertId.toString(), socket.id);
    console.log(`✅ Expert ${expertId} registered with socket ${socket.id}`);
  });

  // ✅ Enhanced endChat handler
  socket.on("endChat", async (roomId) => {
    try {
      // ✅ Mark chat room as inactive in database
      await ChatRoom.findOneAndUpdate(
        { roomId },
        { active: false }
      );

      // ✅ Notify all participants
      io.to(roomId).emit("chatEnded", { roomId });
      
      // ✅ Remove all clients from room
      const clients = io.sockets.adapter.rooms.get(roomId);
      if (clients) {
        clients.forEach(socketId => {
          io.sockets.sockets.get(socketId)?.leave(roomId);
        });
      }
      
      console.log(`✅ Room ${roomId} ended and marked inactive`);
    } catch (error) {
      console.error("❌ Error ending chat:", error);
    }
  });

  // ✅ Enhanced disconnect handler
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
    
    // ✅ Remove expert from socketUserMap
    for (const [expertId, sockId] of socketUserMap.entries()) {
      if (sockId === socket.id) {
        socketUserMap.delete(expertId);
        console.log(`✅ Removed expert ${expertId} from socket map`);
        break;
      }
    }
  });
});



// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use('/uploads', express.static('uploads'));


passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// --- Pass common variables to all EJS templates ---
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// --- Debugging Auth State ---
app.use((req, res, next) => {
  console.log("Is Authenticated:", req.isAuthenticated());
  console.log("Current User:", req.user);
  next();
});

// --- Routes ---
app.use('/', landingRoutes);
app.use('/diagnosis', indexRoutes);
app.use('/labs', labRoutes);
app.use('/', signupRoute);
app.use('/history', historyRoutes);
app.use('/chatbot', chatbotRoutes);
app.use('/weather', weatherRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/experts', expertRoutes);





// --- Error Handlers ---
app.use((req, res, next) => {
  res.status(404).render('error', { message: 'Page not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'Something went wrong!' });
});

// --- Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server + Socket.IO running on port ${PORT}`));

