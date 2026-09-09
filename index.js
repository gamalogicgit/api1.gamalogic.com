// index.js
import app from './src/app.js';
import mySqlPool from './src/config/database.js';

const port = process.env.PORT || 3001;

// Test database connection and start server
mySqlPool
  .query("SELECT 1")
  .then(() => {
    console.log("✅ MySQL DB connected");
    app.listen(port, () => {
      console.log(`🚀 Domain Finder API running on port ${port}`);
      console.log(`📍 http://localhost:${port}/v1/company/resolve?name=google`);
    });
  })
  .catch((error) => {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  });