// App.jsx
// Step 2 · Layout & Komponen Dasar
// App hanya menjadi titik masuk routing — konten design system ada di /dev/design

import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
