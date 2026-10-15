// server.js — Entry point, listen port
// Step 1 · Setup Project

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅  Oven & Co. API berjalan di http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
