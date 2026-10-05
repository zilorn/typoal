import { createEffect, createUniqueId, onCleanup, type JSX } from "solid-js";
import Icon from "./Icon";

export default function Dialog(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  const titleId = createUniqueId();
  let dialog!: HTMLDialogElement;
  createEffect(() => {
    if (props.open) dialog.showModal();
    else if (dialog.open) dialog.close();
    if (props.open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  });
  onCleanup(() => {
    if (typeof document !== "undefined") document.body.style.overflow = "";
  });
  return (
    <dialog
      ref={dialog}
      class="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog) props.onClose();
      }}
    >
      <div class="dialog-heading">
        <h2 id={titleId}>{props.title}</h2>
        <button
          class="icon-button"
          onClick={() => props.onClose()}
          aria-label="关闭弹窗"
        >
          <Icon name="close" />
        </button>
      </div>
      {props.children}
    </dialog>
  );
}
