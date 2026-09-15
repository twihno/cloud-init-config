import { h } from "@/dom.ts";

// A styled, promise-based stand-in for window.confirm(), built on <dialog> so it matches
// the rest of the UI (and respects light/dark theme) instead of a native OS popup.
let dialogEl: HTMLDialogElement | undefined;
let titleEl: HTMLElement;
let messageEl: HTMLElement;
let cancelBtn: HTMLButtonElement;
let confirmBtn: HTMLButtonElement;
let resolveActive: ((result: boolean) => void) | null = null;

function ensureDialog(): void {
  if (dialogEl) return;
  titleEl = h("h2", {});
  messageEl = h("p", { class: "confirm-message" });
  cancelBtn = h(
    "button",
    { type: "button", class: "btn btn-ghost" },
    "Cancel",
  ) as HTMLButtonElement;
  confirmBtn = h(
    "button",
    { type: "button", class: "btn btn-primary" },
    "Continue",
  ) as HTMLButtonElement;

  dialogEl = h("dialog", { class: "confirm-dialog" }, [
    h("div", { class: "modal-form" }, [
      titleEl,
      messageEl,
      h("div", { class: "modal-actions" }, [cancelBtn, confirmBtn]),
    ]),
  ]) as HTMLDialogElement;
  document.body.appendChild(dialogEl);

  const settle = (result: boolean) => {
    if (dialogEl!.open) dialogEl!.close();
    if (resolveActive) {
      const resolve = resolveActive;
      resolveActive = null;
      resolve(result);
    }
  };
  cancelBtn.addEventListener("click", () => settle(false));
  confirmBtn.addEventListener("click", () => settle(true));
  dialogEl.addEventListener("cancel", () => settle(false)); // Esc key
}

export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function confirmDialog({
  title = "Are you sure?",
  message = "",
  confirmText = "Continue",
  cancelText = "Cancel",
  danger = false,
}: ConfirmOptions = {}): Promise<boolean> {
  ensureDialog();
  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  confirmBtn.classList.toggle("btn-danger", danger);
  confirmBtn.classList.toggle("btn-primary", !danger);

  return new Promise((resolve) => {
    resolveActive = resolve;
    dialogEl!.showModal();
    confirmBtn.focus();
  });
}
