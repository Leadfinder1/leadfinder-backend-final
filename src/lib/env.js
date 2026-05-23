function requiredEnv(name, fallback = null) {
  const value = process.env[name] || fallback;
  if (!value) console.warn(`Missing env ${name}`);
  return value;
}
module.exports = { requiredEnv };
