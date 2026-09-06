import { useEffect } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') void onConfirm();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, onConfirm]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="playlist-modal confirm-modal" onClick={event => event.stopPropagation()}>
        <div className="playlist-modal-head">
          <div>
            <h3>{title}</h3>
            <p>{message}</p>
          </div>
        </div>

        <div className="playlist-modal-actions">
          <button className="library-action-btn secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`library-action-btn ${destructive ? 'danger' : ''}`} onClick={() => void onConfirm()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
