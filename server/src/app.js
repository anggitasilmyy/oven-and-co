
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/customer/auth.routes');
const categoryRoutes = require('./routes/customer/category.routes');
const productRoutes = require('./routes/customer/product.routes');
const customOptionsRoutes = require('./routes/customer/customOptions.routes');
const customCakeDesignRoutes = require('./routes/customer/customCakeDesign.routes');
const cartRoutes = require('./routes/customer/cart.routes');
const checkoutRoutes = require('./routes/customer/checkout.routes');
const meRoutes = require('./routes/customer/me.routes');
const promoRoutes = require('./routes/customer/promo.routes');
const orderRoutes = require('./routes/customer/order.routes');
const paymentRoutes = require('./routes/customer/payment.routes');
const adminOrderRoutes = require('./routes/admin/order.routes');
const paymentMethodRoutes = require('./routes/admin/paymentMethod.routes');

const errorHandler = require('./middlewares/errorHandler');
const { getReferencePhotoDir } = require('./utils/referencePhotoStorage');
const { getReviewPhotoDir } = require('./utils/reviewPhotoStorage');

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

// Foto unggahan (Step 6.3): referensi custom cake & foto ulasan. Hanya file di folder upload; tanpa listing
// direktori, dotfile ditolak, dan tipe konten tidak boleh ditebak ulang oleh browser.
const uploadStaticOptions = {
  index: false,
  dotfiles: 'deny',
  redirect: false,
  setHeaders: (res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'");
  },
};
app.use('/uploads/custom-cakes', express.static(getReferencePhotoDir(), uploadStaticOptions));
app.use('/uploads/reviews', express.static(getReviewPhotoDir(), uploadStaticOptions));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Oven & Co. API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Auth API
app.use('/api/auth', authRoutes);

// Customer API
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/custom-options', customOptionsRoutes);
app.use('/api/custom-cake-designs', customCakeDesignRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/me', meRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);

// Admin API
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);

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
