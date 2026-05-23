const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

function signToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });
}
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
function referralCode(email) {
  return Buffer.from(email).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase();
}
module.exports = { signToken, hashPassword, verifyPassword, referralCode };
