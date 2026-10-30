// Warm cream page with blurred crimson/orange/mint blobs and faint garnish at the edges.
// Purely decorative: hidden from assistive tech and never intercepts clicks.

function Chilli({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path d="M14 50c10 2 30-6 38-26 2-5-3-8-6-4-6 9-16 18-30 22-4 1-6 7-2 8z" fill="#c81e3a" />
      <path d="M46 20c1-5 4-8 8-9" stroke="#2f855a" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Tomato({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="36" r="22" fill="#e5383b" />
      <path d="M32 14l4 8 8-3-5 7 7 5-9 0-5 6-5-6-9 0 7-5-5-7 8 3z" fill="#2f855a" />
    </svg>
  );
}

function Garlic({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path d="M32 8c3 8 18 14 18 30 0 11-8 18-18 18S14 49 14 38C14 22 29 16 32 8z" fill="#f4ede1" stroke="#cbbca4" strokeWidth="2" />
      <path d="M32 18v36M24 26c-3 8-3 18 2 28M40 26c3 8 3 18-2 28" stroke="#cbbca4" strokeWidth="2" fill="none" />
    </svg>
  );
}

function Cardamom({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <ellipse cx="32" cy="32" rx="12" ry="22" transform="rotate(30 32 32)" fill="#7cb342" />
      <path d="M22 50L42 14" stroke="#558b2f" strokeWidth="2" />
    </svg>
  );
}

function Lemon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <ellipse cx="32" cy="32" rx="24" ry="17" fill="#fbd34d" />
      <ellipse cx="32" cy="32" rx="18" ry="12" fill="#fde68a" />
    </svg>
  );
}

export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-rose-300/50 blur-3xl" />
      <div className="absolute -right-24 top-1/4 h-[24rem] w-[24rem] rounded-full bg-orange-200/60 blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-emerald-200/50 blur-3xl" />
      <div className="opacity-[0.16]">
        <Chilli className="absolute -left-3 top-24 h-20 w-20 rotate-12" />
        <Tomato className="absolute bottom-16 -left-4 h-24 w-24" />
        <Garlic className="absolute -right-2 top-10 h-20 w-20 -rotate-12" />
        <Cardamom className="absolute bottom-1/3 -right-3 h-16 w-16" />
        <Lemon className="absolute -bottom-3 right-1/4 h-20 w-20 rotate-6" />
        <Chilli className="absolute bottom-6 right-4 hidden h-16 w-16 -rotate-45 md:block" />
      </div>
    </div>
  );
}
