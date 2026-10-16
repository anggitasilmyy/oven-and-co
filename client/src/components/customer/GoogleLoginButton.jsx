// components/customer/GoogleLoginButton.jsx
// FR-02 · C-02 Masuk — tombol "Masuk dengan Google"

export default function GoogleLoginButton({ onClick, loading }) {
  return (
    <button
      id="masuk-google-btn"
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full h-[52px] rounded-btn border border-beige bg-white text-cocoa font-sans font-semibold
                 text-sm flex items-center justify-center gap-3 hover:bg-cream transition-colors
                 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      aria-label="Masuk dengan Google"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-cocoa/40 border-t-transparent rounded-full animate-spin" />
      ) : (
        /* Google "G" icon SVG */
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M44.5 20H24v8.5h11.9C34.2 33.2 29.6 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.1-2.7-.5-4z"/>
          <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3 0 5.8 1.1 7.9 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.2 3 9.4 7.8 6.3 14.7z"/>
          <path fill="#FBBC05" d="M24 45c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.7 36 27 37 24 37c-5.6 0-10.2-3.8-11.9-8.9l-7 5.4C8.9 40.8 16 45 24 45z"/>
          <path fill="#EA4335" d="M44.5 20H24v8.5h11.9c-.8 2.3-2.3 4.3-4.3 5.9l6.7 5.5C41.8 36.4 45 30.7 45 24c0-1.4-.1-2.7-.5-4z"/>
        </svg>
      )}
      Masuk dengan Google
    </button>
  );
}
