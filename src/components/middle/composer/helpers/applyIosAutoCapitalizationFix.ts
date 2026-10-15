import { forceMutation } from 'frameact/stricterdom';

import { IS_IOS } from '../../../../util/browser/windowEnvironment';

let resetInput: HTMLInputElement;

if (IS_IOS) {
  resetInput = document.createElement('input');
  resetInput.classList.add('for-ios-autocapitalization-fix');
  // Deviation: the module is evaluated when the chunk that imports it loads, in whatever frame phase that happens
  forceMutation(() => document.body.appendChild(resetInput), document.body);
}

// https://stackoverflow.com/a/55652503
export default function applyIosAutoCapitalizationFix(inputEl: HTMLElement) {
  resetInput.focus();
  inputEl.focus();
}
