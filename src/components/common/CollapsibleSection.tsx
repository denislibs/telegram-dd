import { createMutationEffect, onMount, requestForcedReflow, requestMutation } from 'frameact';

import buildClassName from '../../util/buildClassName';
import { waitForTransitionEnd } from '../../util/cssAnimationEndListeners';

import Icon from './icons/Icon';

import styles from './CollapsibleSection.module.scss';

type OwnProps = {
  title: string;
  isCollapsed: boolean;
  className?: string;
  children: React.ReactNode;
  onToggle: NoneToVoidFunction;
};

const TRANSITION_DURATION = 250;
const CLEANUP_FALLBACK_MS = TRANSITION_DURATION + 100;

const CollapsibleSection = (props: OwnProps) => {
  let contentRef!: HTMLDivElement;
  let cancelCleanupRef: NoneToVoidFunction | undefined;

  // Deviation: the first apply of a mutation effect runs when the component is created, before the element exists, so
  // tt's "first run" branch (a section that is collapsed from the start gets its height at once) is `onMount`.
  onMount(() => {
    const content = contentRef;
    if (props.isCollapsed) {
      requestMutation(() => {
        content.style.height = '0px';
      });
    }
  });

  createMutationEffect(
    () => props.isCollapsed,
    (isCollapsed2, prev) => {
      const content = contentRef;
      if (!content) return;

      cancelCleanupRef?.();
      cancelCleanupRef = undefined;

      if (prev === undefined) return;

      if (isCollapsed2) {
        requestForcedReflow(() => {
          const height = content.scrollHeight;

          return () => {
            content.style.height = `${height}px`;

            requestForcedReflow(() => {
              void content.offsetHeight;

              return () => {
                content.style.height = '0px';
              };
            });
          };
        });
      } else {
        requestForcedReflow(() => {
          const height = content.scrollHeight;

          return () => {
            content.style.height = `${height}px`;

            cancelCleanupRef = waitForTransitionEnd(
              content,
              () => {
                requestMutation(() => {
                  content.style.height = '';
                });
              },
              'height',
              CLEANUP_FALLBACK_MS,
            );
          };
        });
      }
    },
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onToggle();
    }
  };

  return (
    <div class={props.className}>
      <div
        role="button"
        tabIndex={0}
        // Deviation: ARIA states are strings; a boolean `false` attribute is removed by frameact (teact rendered "false").
        aria-expanded={props.isCollapsed ? 'false' : 'true'}
        class={styles.header}
        onClick={() => props.onToggle()}
        onKeyDown={handleKeyDown}
      >
        <p class={styles.title}>{props.title}</p>
        <Icon name="up" className={buildClassName(styles.chevron, props.isCollapsed && styles.chevronCollapsed)} />
      </div>
      <div
        ref={contentRef}
        aria-hidden={props.isCollapsed ? 'true' : 'false'}
        class={buildClassName(styles.content, props.isCollapsed && styles.contentCollapsed)}
      >
        {props.children}
      </div>
    </div>
  );
};

export default CollapsibleSection;
