// components/ui/FormError.jsx
// Step 3 · Authentication
// Pesan error umum form (di atas tombol submit)

export default function FormError({ id, message, className = 'text-sm' }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={`${className} text-error flex items-center gap-1.5`}>
      <span aria-hidden="true">⚠</span> {message}
    </p>
  );
}
