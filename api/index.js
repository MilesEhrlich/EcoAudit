// Vercel serverless function: every /api/* and /auth/* request is rewritten here (see vercel.json).
const { handle } = require('../lib/handler');

module.exports = (req, res) => handle(req, res);
