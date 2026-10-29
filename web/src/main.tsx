import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <section className="w-full max-w-3xl rounded-3xl border border-white/60 bg-white/65 p-7 shadow-xl backdrop-blur-xl sm:p-14" aria-labelledby="title">
        <p className="mb-6 text-sm font-bold uppercase tracking-widest text-rose-800">Made for Pakistani kitchens</p>
        <h1 id="title" className="text-4xl font-black tracking-tight text-rose-950 sm:text-6xl">Pantry2Plate <span className="text-orange-700">PK</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-700">A little pantry inspiration. A delicious plate of possibilities.</p>
        <p className="mt-4 max-w-xl leading-relaxed text-stone-600">Your future kitchen companion for ingredient pairings, complete recipes, nutrition, and shopping estimates in PKR.</p>
        <div className="mt-8 inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">Coming soon · Your pantry is the starting point</div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
