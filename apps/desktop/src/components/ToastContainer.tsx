import { useToastStore } from '../store';

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast">{t.message}</div>
      ))}
    </div>
  );
}
