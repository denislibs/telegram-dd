import { createRoot } from 'frameact';
import { setAttribute } from 'frameact/dom';

/**
 * Workaround for a frameact gap: `use:value` / `use:checked` install their rollback listeners (input, change,
 * composition) on `el.ownerDocument` at bind time, but a compiled template clone still belongs to the inert
 * `<template>` document at that moment (`cloneNode` keeps the node document until the node is inserted), so for
 * inputs bound from JSX the listeners land on that inert document and the real one never gets any. The initial
 * value and programmatic updates work; a rejected user input is not rolled back.
 *
 * Binding a throwaway detached input (created by `document.createElement`, so its owner is the live document)
 * installs the listeners on the live document. Call it once before the first render; tests call it again after
 * `clearDelegatedEvents()`, which removes them. Drop it when the framework binds against the live document itself.
 */
export function installControlledInputListeners(): void {
  createRoot((dispose) => {
    setAttribute(document.createElement('input'), 'use:value', () => '');
    dispose();
  });
}
