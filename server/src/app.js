
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/customer/auth.routes');
const categoryRoutes = require('./routes/customer/category.routes');
const productRoutes = require('./routes/customer/product.routes');
const adminOrderRoutes = require('./routes/admin/order.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Oven & Co. API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Auth API — Step 6.2
app.use('/api/auth', authRoutes);

// Customer API — Step 6.3
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);

// Admin API — Step 6.4.1
app.use('/api/admin/orders', adminOrderRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint tidak ditemukan.',
  });
});

// Error handler harus berada setelah seluruh routes
app.use(errorHandler);

module.exports = app;
