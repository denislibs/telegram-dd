import { createMutationEffect, requestForcedReflow, requestMutation } from 'frameact';

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
  let isFirstRunRef = true;
  let cancelCleanupRef: NoneToVoidFunction | undefined;

  createMutationEffect(
    () => props.isCollapsed,
    (isCollapsed2) => {
      const content = contentRef;
      if (!content) return;

      cancelCleanupRef?.();
      cancelCleanupRef = undefined;

      if (isFirstRunRef) {
        isFirstRunRef = false;
        if (isCollapsed2) {
          requestMutation(() => {
            content.style.height = '0px';
          });
        }
        return;
      }

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
        aria-expanded={!props.isCollapsed}
        class={styles.header}
        onClick={(e) => props.onToggle?.(e)}
        onKeyDown={handleKeyDown}
      >
        <p class={styles.title}>{props.title}</p>
        <Icon name="up" className={buildClassName(styles.chevron, props.isCollapsed && styles.chevronCollapsed)} />
      </div>
      <div
        ref={contentRef}
        aria-hidden={props.isCollapsed}
        class={buildClassName(styles.content, props.isCollapsed && styles.contentCollapsed)}
      >
        {props.children}
      </div>
    </div>
  );
};

export default CollapsibleSection;
