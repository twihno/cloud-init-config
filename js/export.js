import { confirmDialog } from "./confirm.js";

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export async function copyBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  await navigator.clipboard.writeText(btoa(binary));
}

export function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CLASSIC_CLOUD_INIT_FILES = ["user-data", "meta-data", "network-config"];
const RASPBERRY_PI_BOOT_HINTS = ["config.txt", "cmdline.txt"];

export function isDirectoryPickerSupported() {
  return "showDirectoryPicker" in window;
}

// Opens a directory picker, sanity-checks it actually looks like a cloud-init boot
// partition (rather than a random wrong folder), and writes every rendered file into it.
export async function replaceOnDisk(files) {
  if (!isDirectoryPickerSupported()) {
    throw new Error(
      'This browser does not support the File System Access API needed to write files directly. Try a current Chromium-based browser (e.g. Chrome or Edge), or use "Save to disk" instead.',
    );
  }
  const dirHandle = await window.showDirectoryPicker({
    mode: "readwrite",
    id: "cloud-init-boot-partition",
  });
  const existingNames = [];
  for await (const [name] of dirHandle.entries()) existingNames.push(name);

  const hasClassicFile = CLASSIC_CLOUD_INIT_FILES.some((f) =>
    existingNames.includes(f),
  );
  const hasPiHint = RASPBERRY_PI_BOOT_HINTS.some((f) =>
    existingNames.includes(f),
  );

  if (!hasClassicFile) {
    const proceed = await confirmDialog({
      title: hasPiHint
        ? "Empty Raspberry Pi boot partition?"
        : "Unrecognized folder",
      message: hasPiHint
        ? "This looks like a Raspberry Pi boot partition, but no existing user-data / meta-data / network-config files were found there yet. They will be created."
        : "None of the classic cloud-init files (user-data, meta-data, network-config) were found in the selected folder. This might be the wrong folder.",
      confirmText: "Continue anyway",
      danger: !hasPiHint,
    });
    if (!proceed) {
      return { cancelled: true, written: [] };
    }
  }

  const written = [];
  for (const file of files) {
    const handle = await dirHandle.getFileHandle(file.filename, {
      create: true,
    });
    const writable = await handle.createWritable();
    await writable.write(file.content);
    await writable.close();
    written.push(file.filename);
  }
  return { cancelled: false, written, directoryName: dirHandle.name };
}
