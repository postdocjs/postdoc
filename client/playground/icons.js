/**
 * The icons of the panel: VS Code's own, the codicons, from a CDN.
 */

const CODICONS = 'https://cdn.jsdelivr.net/npm/@vscode/codicons@0.0.45/dist/codicon.css';

export function loadIcons() {
  if (!document.querySelector(`link[href="${CODICONS}"]`)) {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: CODICONS }));
  }
}

// An icon, which assistive technology skips: the control that holds it has a name.
export function icon(name) {
  const element = document.createElement('span');

  element.className = `codicon codicon-${name}`;
  element.setAttribute('aria-hidden', 'true');

  return element;
}

// A button that is an icon, named for assistive technology and in its tooltip.
export function iconButton(name, label, className = 'playground-icon-button') {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = className;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(icon(name));

  return button;
}

// Swaps the icon of a button, as a toggle does.
export function setIcon(button, name) {
  button.querySelector('.codicon').className = `codicon codicon-${name}`;
}
