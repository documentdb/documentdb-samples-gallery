import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// GET /api/health - Health check with database ping
router.get('/', async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

// GET /ping - Simple ping without database check
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
