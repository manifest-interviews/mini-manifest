import { useEffect, useRef } from "react";
import { ModalElement } from "./modal-container";

export const BUTTON = "border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50";
export const PRIMARY_BUTTON = "bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700";
export const DANGER_BUTTON = "px-3 py-1.5 text-sm text-red-600 hover:underline";
export const INPUT = "border border-gray-300 px-2 py-1.5 text-sm";

export function MemberBadge() {
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Member</span>
  );
}

/**
 * App-style modal: native <dialog> for the top layer and Escape handling, with
 * a header / scrolling body / action bar so it reads as a panel, not a box.
 */
export function Modal({
  title,
  subtitle,
  footer,
  onClose,
  children,
  wide = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => dialog.current?.showModal(), []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        // The dialog element itself is the backdrop; its children are the panel.
        if (event.target === dialog.current) {
          dialog.current.close();
        }
      }}
      className={`m-auto w-full rounded-xl p-0 shadow-2xl backdrop:bg-gray-900/40 ${
        wide ? "max-w-2xl" : "max-w-md"
      }`}
    >
      <ModalElement value={dialog}>
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
            <div className="flex-1">
              <h2 className="font-semibold">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
            </div>
            <button
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="text-xl leading-none text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </header>

          <div className="overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      </ModalElement>
    </dialog>
  );
}
