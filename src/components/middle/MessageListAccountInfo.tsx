import { createEffect, createMemo } from 'frameact';
import { getActions, getGlobal, withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';

import type { ApiBotInfo, ApiChat, ApiCountryCode, ApiUserCommonChats, ApiUserFullInfo } from '../../api/types';

import {
  getBotCoverMediaHash,
  getChatTitle,
  getPhotoFullDimensions,
  getVideoDimensions,
  getVideoMediaHash,
  isChatWithVerificationCodesBot,
} from '../../global/helpers';
import { selectBot, selectChat, selectPeer, selectUserCommonChats, selectUserFullInfo } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import { formatPastDatetime, formatRegistrationMonth } from '../../util/dates/oldDateFormat';
import { isoToEmoji } from '../../util/emoji/emoji';
import { getCountryCodeByIso } from '../../util/phoneNumber';
import stopEvent from '../../util/stopEvent';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';
import useMedia from '../../hooks/useMedia';
import useOldLang from '../../hooks/useOldLang';

import AvatarList from '../common/AvatarList';
import Icon from '../common/icons/Icon';
import MiniTable, { type TableEntry } from '../common/MiniTable';
import Link from '../ui/Link';
import OptimizedVideo from '../ui/OptimizedVideo';
import Skeleton from '../ui/placeholder/Skeleton';

import styles from './MessageListAccountInfo.module.scss';

type OwnProps = {
  chatId: string;
  hasMessages?: boolean;
};

type StateProps = {
  chat?: ApiChat;
  botInfo?: ApiBotInfo;
  isLoadingFullUser?: boolean;
  phoneCodeList?: ApiCountryCode[];
  commonChats?: ApiUserCommonChats;
  userFullInfo?: ApiUserFullInfo;
};

const MessageListAccountInfo = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { loadCommonChats, openChatWithInfo } = getActions();
  const oldLang = useOldLang();
  const lang = useLang();

  const source = createMemo(() => props.userFullInfo?.settings || {});
  const phoneCountry = () => source().phoneCountry;
  const registrationMonth = () => source().registrationMonth;
  const nameChangeDate = () => source().nameChangeDate;
  const photoChangeDate = () => source().photoChangeDate;

  createEffect(() => props.chatId, (chatId2) => {
    loadCommonChats({ userId: chatId2 });
  });

  const country = createMemo(() => {
    if (!props.phoneCodeList || !phoneCountry()) return undefined;
    return getCountryCodeByIso(props.phoneCodeList, phoneCountry());
  });

  const botInfoPhotoUrl = useMedia(() => props.botInfo?.photo ? getBotCoverMediaHash(props.botInfo.photo) : undefined);
  const botInfoGifUrl = useMedia(() => props.botInfo?.gif ? getVideoMediaHash(props.botInfo.gif, 'full') : undefined);
  const botInfoDimensions = createMemo(() => props.botInfo?.photo
    ? getPhotoFullDimensions(props.botInfo.photo)
    : props.botInfo?.gif
      ? getVideoDimensions(props.botInfo.gif)
      : undefined);
  const isBotInfoEmpty = createMemo(() => props.botInfo && !props.botInfo.description && !props.botInfo.gif && !props.botInfo.photo);
  const isChatInfoEmpty = createMemo(() => !country() || !registrationMonth());

  const isVerifyCodes = createMemo(() => isChatWithVerificationCodesBot(props.chatId));

  const source2 = createMemo(() => botInfoDimensions() || {});
  const width = () => source2().width;
  const height = () => source2().height;

  const handleClick = (e: React.SyntheticEvent<any>) => {
    stopEvent(e);
    openChatWithInfo({
      id: props.chatId,
      shouldReplaceHistory: true,
      profileTab: 'commonChats',
      forceScrollProfileTab: true,
    });
  };

  const securityNameInfo =
    createMemo(() => nameChangeDate() && props.chat ? (
      <div class="local-action-message">
        <span>
          {lang(
            'UserUpdatedName',
            {
              user: props.chat.title,
              time: formatPastDatetime(lang, nameChangeDate()),
            },
            { withNodes: true, withMarkdown: true },
          )}
        </span>
      </div>
    ) : undefined);

  const securityPhotoInfo =
    createMemo(() => photoChangeDate() && props.chat ? (
      <div class="local-action-message">
        <span>
          {lang(
            'UserUpdatedPhoto',
            {
              user: props.chat.title,
              time: formatPastDatetime(lang, photoChangeDate()),
            },
            { withNodes: true, withMarkdown: true },
          )}
        </span>
      </div>
    ) : undefined);

  // TODO(codemod): dependency on a container (userFullInfo) keeps its identity while its content changes: the memo must read the fields it needs (store contract §12.7)
  const tableData = createMemo((): TableEntry[] => {
    const entries: TableEntry[] = [];
    if (country()) {
      entries.push([
        oldLang('PrivacyPhone'),
        <span class={styles.chatDescription}>
          <span class={styles.country}>{renderText(isoToEmoji(country()?.iso2))}</span>
          {country()?.defaultName}
        </span>,
      ]);
    }
    if (registrationMonth()) {
      entries.push([lang('ContactInfoRegistration'), formatRegistrationMonth(lang.code, registrationMonth())]);
    }
    if (props.userFullInfo?.commonChatsCount) {
      // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
      const global = getGlobal();
      const peers = props.commonChats?.ids
        .slice(0, 3)
        .map((id) => selectPeer(global, id)!)
        .filter(Boolean);
      entries.push([
        lang('ChatNonContactUserGroups'),
        <Link className={styles.link} onClick={handleClick}>
          <span class={styles.linkInfo}>
            {lang(
              'ChatGroups',
              {
                count: props.userFullInfo.commonChatsCount,
              },
              {
                pluralValue: props.userFullInfo.commonChatsCount,
              },
            )}
          </span>
          {Boolean(peers?.length) && <AvatarList size="micro" peers={peers} />}
          <Icon name="next" className={styles.icon} />
        </Link>,
      ]);
    }
    return entries;
  });

  return (
    <div class={buildClassName(styles.root, 'empty')}>
      {props.isLoadingFullUser && isChatInfoEmpty() && <span>{oldLang('Loading')}</span>}
      {isBotInfoEmpty() && isChatInfoEmpty() && !props.isLoadingFullUser && !props.hasMessages && <span>{oldLang('NoMessages')}</span>}
      {props.botInfo && (
        <div
          class={buildClassName(styles.chatInfo, styles.botBackground)}
          style={buildStyle(width() ? `width: ${width()}px` : undefined)}
        >
          {botInfoPhotoUrl && (
            <img class={styles.media} src={botInfoPhotoUrl} width={width()} height={height()} alt="Bot info" />
          )}
          {botInfoGifUrl && (
            <OptimizedVideo
              canPlay
              className={styles.media}
              src={botInfoGifUrl}
              loop
              disablePictureInPicture
              muted
              playsInline
              style={buildStyle(Boolean(width()) && `width: ${width()}px`, Boolean(height()) && `height: ${height()}px`)}
            />
          )}
          {botInfoDimensions() && !botInfoPhotoUrl && !botInfoGifUrl && (
            <Skeleton className={styles.media} width={width()} height={height()} forceAspectRatio animation="pulse" />
          )}
          {isVerifyCodes() && <div class={styles.botInfoDescription}>{oldLang('VerifyChatInfo')}</div>}
          {!isVerifyCodes() && props.botInfo.description && (
            <div class={styles.botInfoDescription}>
              <p class={styles.botInfoTitle}>{oldLang('BotInfoTitle')}</p>
              {renderText(props.botInfo.description, ['br', 'emoji', 'links'])}
            </div>
          )}
        </div>
      )}
      {!isChatInfoEmpty() && props.chat && (
        <div class={buildClassName(styles.chatInfo, styles.chatBackground)}>
          <h3 class={styles.chatInfoTitle}>{renderText(getChatTitle(lang, props.chat))}</h3>
          <p class={buildClassName(styles.chatInfoSubtitle, styles.textColor)}>
            {lang('ChatNonContactUserSubtitle')}
          </p>
          <MiniTable keyClassName={styles.textColor} data={tableData()} />
          {!props.chat?.isVerified && (
            <div class={buildClassName(styles.chatNotVerified, styles.textColor)}>
              <Icon name="info-filled" />
              <p class={styles.verifiedTitle}>{lang('ContactInfoNotVerified')}</p>
            </div>
          )}
        </div>
      )}
      {securityNameInfo()}
      {securityPhotoInfo()}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { chatId }: OwnProps) => {
    const {
      countryList: { phoneCodes: phoneCodeList },
    } = global;
    const chat = selectChat(global, chatId);
    const userFullInfo = selectUserFullInfo(global, chatId);
    const commonChats = selectUserCommonChats(global, chatId);
    const chatBot = selectBot(global, chatId);

    let isLoadingFullUser = false;
    let botInfo;
    if (chatBot) {
      if (userFullInfo) {
        botInfo = userFullInfo.botInfo;
      } else {
        isLoadingFullUser = true;
      }
    }

    return {
      chat,
      userFullInfo,
      botInfo,
      isLoadingFullUser,
      phoneCodeList,
      commonChats,
    };
  };

export default MessageListAccountInfo;
