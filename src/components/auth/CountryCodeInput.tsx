import { createEffect, createSignal } from 'frameact';
import { For } from 'frameact/dom';
import { withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';

import type { ApiCountryCode } from '../../api/types';

import { ANIMATION_END_DELAY } from '../../config';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_EMOJI_SUPPORTED } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { isoToEmoji } from '../../util/emoji/emoji';
import { prepareSearchWordsForNeedle } from '../../util/searchWords';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';

import DropdownMenu from '../ui/DropdownMenu';
import MenuItem from '../ui/MenuItem';
import Spinner from '../ui/Spinner';

import './CountryCodeInput.scss';

type StateProps = {
  phoneCodeList: ApiCountryCode[];
};

type OwnProps = {
  id: string;
  value?: ApiCountryCode;
  isLoading?: boolean;
  onChange: (value: ApiCountryCode) => void;
};

const MENU_HIDING_DURATION = 200 + ANIMATION_END_DELAY;
const SELECT_TIMEOUT = 50;

const CountryCodeInput = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const lang = useLang();
  let inputRef!: HTMLInputElement;

  const [filter, setFilter] = createSignal<string | undefined>(undefined);
  const [filteredList, setFilteredList] = createSignal<ApiCountryCode[]>([]);

  const updateFilter = (filterValue?: string) => {
    setFilter(filterValue);
    setFilteredList(getFilteredList(props.phoneCodeList, filterValue));
  };

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    () => [props.phoneCodeList, filter()],
    (_deps, prev) => {
      const [prevPhoneCodeList] = prev ?? [];
      if (!prevPhoneCodeList?.length && props.phoneCodeList.length) {
        setFilteredList(getFilteredList(props.phoneCodeList, filter()));
      }
    },
  );

  const handleChange = (country: ApiCountryCode) => {
    props.onChange(country);

    setTimeout(() => updateFilter(undefined), MENU_HIDING_DURATION);
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    updateFilter(e.currentTarget.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.keyCode !== 8) {
      return;
    }

    const target = e.currentTarget;
    if (props.value && filter() === undefined) {
      target.value = '';
    }

    updateFilter(target.value);
  };

  const CodeInput: FC<{ onTrigger: () => void; isOpen?: boolean }> = ({ onTrigger, isOpen }) => {
    const handleTrigger = () => {
      if (isOpen) {
        return;
      }

      setTimeout(() => {
        inputRef!.select();
      }, SELECT_TIMEOUT);

      onTrigger();

      const formEl = document.getElementById('auth-phone-number-form')!;
      formEl.scrollTo({ top: formEl.scrollHeight, behavior: 'smooth' });
    };

    const handleCodeInput = (e: React.FormEvent<HTMLInputElement>) => {
      handleInput(e);
      handleTrigger();
    };

    const emoji = props.value && IS_EMOJI_SUPPORTED && isoToEmoji(props.value.iso2);
    const name = props.value?.name || props.value?.defaultName || '';
    const inputValue = filter() ?? [emoji, name].filter(Boolean).join(' ');

    return (
      <div class={buildClassName('input-group', props.value && 'touched')}>
        <input
          ref={inputRef}
          class={buildClassName('form-control', isOpen && 'focus')}
          type="text"
          id={props.id}
          value={inputValue}
          autoComplete="off"
          spellCheck={IS_TAURI ? false : undefined}
          onClick={handleTrigger}
          onFocus={handleTrigger}
          onInput={handleCodeInput}
          onKeyDown={handleInputKeyDown}
        />
        <label>{lang('LoginSelectCountryTitle')}</label>
        {props.isLoading ? (
          <Spinner color="black" />
        ) : (
          <i onClick={handleTrigger} class={buildClassName('css-icon-down', isOpen && 'open')} />
        )}
      </div>
    );
  };

  return (
    <DropdownMenu className="CountryCodeInput" trigger={CodeInput}>
      <For each={filteredList()} keyed={(country) => `${country.iso2}-${country.countryCode}`}>
        {(country: ApiCountryCode) => (
          <MenuItem
            className={props.value && country().iso2 === props.value.iso2 ? 'selected' : ''}

            onClick={() => handleChange(country())}
          >
            <span class="country-flag">{renderText(isoToEmoji(country().iso2), ['hq_emoji'])}</span>
            <span class="country-name">{country().name || country().defaultName}</span>
            <span class="country-code">+{country().countryCode}</span>
          </MenuItem>
        )}
      </For>
      {!filteredList().length && (
        <MenuItem className="no-results" disabled>
          <span>{lang('CountryNone')}</span>
        </MenuItem>
      )}
    </DropdownMenu>
  );
};

function getFilteredList(countryList: ApiCountryCode[], filter = ''): ApiCountryCode[] {
  if (!filter.length) {
    return countryList;
  }

  const searchWords = prepareSearchWordsForNeedle(filter);

  return countryList.filter(
    (country) => searchWords(country.defaultName) || (country.name && searchWords(country.name)),
  );
}

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const {
    countryList: { phoneCodes: phoneCodeList },
  } = global;
  return {
    phoneCodeList,
  };
};

export default CountryCodeInput;
