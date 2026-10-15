import { createEffect } from 'frameact';
import { keys } from 'frameact/store';
import { getActions, getGlobal, withGlobal } from '../../global';

import type { GlobalState, TabState } from '../../global/types';
import { ApiMediaFormat } from '../../api/types';

import { selectTabState } from '../../global/selectors';
import { IS_OPFS_SUPPORTED, IS_SERVICE_WORKER_SUPPORTED, MAX_BUFFER_SIZE } from '../../util/browser/windowEnvironment';
import download, { sanitizeDownloadFilename } from '../../util/download';
import generateUniqueId from '../../util/generateUniqueId';
import * as mediaLoader from '../../util/mediaLoader';

import useRunDebounced from '../../hooks/useRunDebounced';

type StateProps = {
  activeDownloads: TabState['activeDownloads'];
};

const GLOBAL_UPDATE_DEBOUNCE = 1000;

const processedHashes = new Set<string>();
const downloadedHashes = new Set<string>();

const DownloadManager = () => {
  const props = withGlobal({}, mapStateToProps);
  const { cancelMediaHashDownloads, showNotification } = getActions();

  const runDebounced = useRunDebounced(GLOBAL_UPDATE_DEBOUNCE, true);

  const handleMediaDownloaded = (hash: string) => {
    downloadedHashes.add(hash);
    runDebounced(() => {
      if (downloadedHashes.size) {
        cancelMediaHashDownloads({ mediaHashes: Array.from(downloadedHashes) });
        downloadedHashes.clear();
      }
    });
  };

  // Deviation: `activeDownloads` is a container that the store merges in place, so the identity of the record never
  // changes: the effect depends on its keys (a download added or removed), and reads the record from the global.
  createEffect(
    () => keys(props.activeDownloads),
    () => {
      const activeDownloads2 = selectTabState(getGlobal()).activeDownloads;
      if (!Object.keys(activeDownloads2).length) {
        processedHashes.clear();
        return;
      }

      Object.entries(activeDownloads2).forEach(([mediaHash, metadata]) => {
        if (processedHashes.has(mediaHash)) {
          return;
        }
        processedHashes.add(mediaHash);

        const { size, format: mediaFormat } = metadata;
        // Deviation (untrusted): the file name comes from the sender.
        const filename = sanitizeDownloadFilename(metadata.filename);

        const mediaData = mediaLoader.getFromMemory(mediaHash);

        if (mediaData) {
          download(mediaData, filename);
          handleMediaDownloaded(mediaHash);
          return;
        }

        if (size > MAX_BUFFER_SIZE && !IS_OPFS_SUPPORTED && !IS_SERVICE_WORKER_SUPPORTED) {
          showNotification({
            message: 'Downloading files bigger than 2GB is not supported in your browser.',
          });
          handleMediaDownloaded(mediaHash);
          return;
        }

        const handleProgress = () => {
          const currentDownloads = selectTabState(getGlobal()).activeDownloads;
          if (!currentDownloads[mediaHash]) {
            mediaLoader.cancelProgress(handleProgress);
          }
        };

        mediaLoader.fetch(mediaHash, mediaFormat, true, handleProgress, generateUniqueId()).then((result) => {
          if (mediaFormat === ApiMediaFormat.DownloadUrl) {
            const url = new URL(result, window.document.baseURI);
            url.searchParams.set('filename', encodeURIComponent(filename));
            const downloadWindow = window.open(url.toString());

            downloadWindow?.addEventListener(
              'beforeunload',
              () => {
                showNotification({
                  message: 'Download started. Please, do not close the app before it is finished.',
                });
              },
              { once: true },
            );
          } else if (result) {
            download(result, filename);
          }

          handleMediaDownloaded(mediaHash);
        });
      });
    },
  );

  return undefined;
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const activeDownloads = selectTabState(global).activeDownloads;

  return {
    activeDownloads,
  };
};

export default DownloadManager;
