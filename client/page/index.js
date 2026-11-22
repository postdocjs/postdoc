import '../index.js';

export async function navigateTo(url) {
  await globalThis.PostDoc.navigator.navigateTo(url);
}

export function onLeave(callback, options) {
  globalThis.PostDoc.navigator.registerOnLeaveCallback(callback, options);
}

export function onRender(callback, options) {
  globalThis.PostDoc.navigator.registerOnRenderCallback(callback, options);
}
