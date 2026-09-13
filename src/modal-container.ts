import { createContext, use } from "react";

/**
 * A modal lives in the browser's top layer, so anything portalled to <body>
 * renders behind it. Popups inside a modal portal into its <dialog> instead.
 */
export const ModalElement = createContext<React.RefObject<HTMLDialogElement | null> | null>(null);

export function useModalContainer() {
  return use(ModalElement);
}
