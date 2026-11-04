// Warm peach page with soft salmon glows, as in the reference designs.
// Purely decorative: hidden from assistive tech and never intercepts clicks.
export function Backdrop() {
  return (
    <div aria-hidden="true" className="print-hide pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#fff6f1] via-[#fff1ea] to-[#ffeee6]">
      <div className="absolute left-[64%] -top-16 h-40 w-44 rounded-full bg-red-400/55 blur-3xl" />
      <div className="absolute -bottom-10 -left-24 h-[24rem] w-[28rem] rounded-full bg-[#fb8e7e]/60 blur-3xl" />
      <div className="absolute bottom-0 left-[14%] h-40 w-72 rounded-full bg-[#fbb5a6]/40 blur-3xl" />
    </div>
  );
}
