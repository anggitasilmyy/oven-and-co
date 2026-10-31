
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
const adminCalendarRoutes = require('./routes/admin/calendar.routes');
const adminProductRoutes = require('./routes/admin/product.routes');
const adminCustomOptionRoutes = require('./routes/admin/customOption.routes');
const adminStockRoutes = require('./routes/admin/stock.routes');
const adminRawMaterialRoutes = require('./routes/admin/rawMaterial.routes');
const paymentMethodRoutes = require('./routes/admin/paymentMethod.routes');
const adminDashboardRoutes = require('./routes/admin/dashboard.routes');
const adminReportRoutes = require('./routes/admin/report.routes');
const adminCustomerRoutes = require('./routes/admin/customer.routes');
const adminReviewRoutes = require('./routes/admin/review.routes');

const errorHandler = require('./middlewares/errorHandler');
const { getReferencePhotoDir } = require('./utils/referencePhotoStorage');
const { getReviewPhotoDir } = require('./utils/reviewPhotoStorage');
const { getProductPhotoDir } = require('./utils/productPhotoStorage');

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

// Foto unggahan (Step 6.3): referensi custom cake & foto ulasan; Step 6.4: foto produk. Hanya file di folder upload; tanpa listing
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
app.use('/uploads/products', express.static(getProductPhotoDir(), uploadStaticOptions));

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
app.use('/api/admin/calendar', adminCalendarRoutes);
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin/custom-options', adminCustomOptionRoutes);
app.use('/api/admin/stocks', adminStockRoutes);
app.use('/api/admin/raw-materials', adminRawMaterialRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/customers', adminCustomerRoutes);
app.use('/api/admin/reviews', adminReviewRoutes);
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
