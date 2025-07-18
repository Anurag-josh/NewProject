const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
});

// This adds username, hash, salt, and methods like register(), authenticate(), etc.
userSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("User", userSchema);
