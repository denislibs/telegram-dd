import { createSignal } from 'frameact';

export default function App() {
  const [count, setCount] = createSignal(0);
  return (
    <main>
      <h1>Telegram on frameact</h1>
      <button type="button" onClick={() => setCount(count() + 1)}>
        clicks: {count()}
      </button>
    </main>
  );
}
