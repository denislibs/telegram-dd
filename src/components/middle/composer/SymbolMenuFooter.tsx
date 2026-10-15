import buildClassName from '../../../util/buildClassName';

import useOldLang from '../../../hooks/useOldLang';

import Button from '../../ui/Button';

type OwnProps = {
  activeTab: SymbolMenuTabs;
  onSwitchTab: (tab: SymbolMenuTabs) => void;
  onRemoveSymbol: () => void;
  isAttachmentModal?: boolean;
  canSendPlainText?: boolean;
};

export enum SymbolMenuTabs {
  Emoji,
  Stickers,
  GIFs,
}

export const SYMBOL_MENU_TAB_TITLES: Record<SymbolMenuTabs, string> = {
  [SymbolMenuTabs.Emoji]: 'Emoji',
  [SymbolMenuTabs.Stickers]: 'AccDescrStickers',
  [SymbolMenuTabs.GIFs]: 'GifsTab',
};

const SYMBOL_MENU_TAB_ICONS = {
  [SymbolMenuTabs.Emoji]: 'icon-smile',
  [SymbolMenuTabs.Stickers]: 'icon-stickers',
  [SymbolMenuTabs.GIFs]: 'icon-gifs',
};

const SymbolMenuFooter = (props: OwnProps) => {
  const lang = useOldLang();

  function renderTabButton(tab: SymbolMenuTabs) {
    return (
      <Button
        className={`symbol-tab-button ${props.activeTab === tab ? 'activated' : ''}`}

        onClick={() => props.onSwitchTab(tab)}
        ariaLabel={lang(SYMBOL_MENU_TAB_TITLES[tab])}
        round
        faded
        color="translucent"
      >
        <i class={buildClassName('icon', SYMBOL_MENU_TAB_ICONS[tab])} />
      </Button>
    );
  }

  function stopPropagation(event: any) {
    event.stopPropagation();
  }

  return (
    <div class="SymbolMenu-footer" onClick={stopPropagation} dir={lang.isRtl ? 'rtl' : undefined}>
      {props.canSendPlainText && renderTabButton(SymbolMenuTabs.Emoji)}
      {!props.isAttachmentModal && renderTabButton(SymbolMenuTabs.Stickers)}
      {!props.isAttachmentModal && renderTabButton(SymbolMenuTabs.GIFs)}

      {props.activeTab === SymbolMenuTabs.Emoji && (
        <Button
          className="symbol-delete-button"
          onClick={() => props.onRemoveSymbol()}
          ariaLabel="Remove Symbol"
          round
          faded
          color="translucent"
          iconName="delete-left"
        />
      )}
    </div>
  );
};

export default SymbolMenuFooter;
