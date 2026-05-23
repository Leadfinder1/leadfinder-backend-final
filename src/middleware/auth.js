const jwt = require("jsonwebtoken");
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
function ownerOnly(req, res, next) {
  if (req.user?.role !== "OWNER" && req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Owner only" });
  }
  next();
}
module.exports = { auth, ownerOnly };
