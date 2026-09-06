import { useEffect, useMemo, useRef, useState } from 'react';
import { EQ_FREQUENCIES, EQ_PRESETS } from '@music/core';
import { createTranslator } from '../i18n';
import { useLibraryStore, usePlayerStore, usePlaylistStore, useSettingsStore, useToastStore } from '../store';
import { CustomSelect } from './CustomSelect';
import ConfirmDialog from './ConfirmDialog';
import { clearArtworkCaches } from '../artwork';

const THEME_OPTIONS = [
  { id: 'dark', labelKey: 'darkGlass' },
  { id: 'light', labelKey: 'softLight' },
  { id: 'midnight', labelKey: 'midnight' },
  { id: 'forest', labelKey: 'forest' },
  { id: 'sunset', labelKey: 'sunset' },
  { id: 'aqua', labelKey: 'aqua' },
  { id: 'beach', labelKey: 'beach' },
  { id: 'sky', labelKey: 'sky' },
  { id: 'gold', labelKey: 'gold' },
  { id: 'frost', labelKey: 'frost' },
  { id: 'rose', labelKey: 'rose' },
  { id: 'ember', labelKey: 'ember' },
  { id: 'aurora', labelKey: 'aurora' },
  { id: 'graphite', labelKey: 'graphite' },
  { id: 'system', labelKey: 'followSystem' },
] as const;

const LIGHT_THEME_OPTIONS = [
  { id: 'light', labelKey: 'softLight' },
  { id: 'beach', labelKey: 'beach' },
  { id: 'sky', labelKey: 'sky' },
  { id: 'frost', labelKey: 'frost' },
] as const;

const DARK_THEME_OPTIONS = [
  { id: 'dark', labelKey: 'darkGlass' },
  { id: 'midnight', labelKey: 'midnight' },
  { id: 'forest', labelKey: 'forest' },
  { id: 'sunset', labelKey: 'sunset' },
  { id: 'aqua', labelKey: 'aqua' },
  { id: 'gold', labelKey: 'gold' },
  { id: 'rose', labelKey: 'rose' },
  { id: 'ember', labelKey: 'ember' },
  { id: 'aurora', labelKey: 'aurora' },
  { id: 'graphite', labelKey: 'graphite' },
] as const;

const PLAYER_LAYOUTS = [
  { id: 'spotlight', labelKey: 'spotlight', descKey: 'spotlightDesc' },
  { id: 'poster', labelKey: 'posterLayout', descKey: 'posterLayoutDesc' },
  { id: 'vinyl', labelKey: 'vinylDeck', descKey: 'vinylDeckDesc' },
  { id: 'musicbox', labelKey: 'musicBoxLayout', descKey: 'musicBoxLayoutDesc' },
  { id: 'cassette', labelKey: 'cassetteDeck', descKey: 'cassetteDeckDesc' },
  { id: 'galleryframe', labelKey: 'galleryFrame', descKey: 'galleryFrameDesc' },
] as const;

const LANGUAGE_OPTIONS = [
  { id: 'system', labelKey: 'followSystem' },
  { id: 'id', labelKey: 'indonesia' },
  { id: 'en', labelKey: 'english' },
  { id: 'ja', labelKey: 'japanese' },
] as const;

type SettingsSection = 'theme' | 'language' | 'player' | 'startup' | 'app' | 'updates' | 'library' | 'eq';

export default function MainHeader() {
  const settingsBodyRef = useRef<HTMLDivElement | null>(null);
  const addFolders = useLibraryStore(s => s.addFolders);
  const clearLibrary = useLibraryStore(s => s.clearAll);
  const tracks = useLibraryStore(s => s.tracks);
  const libraryTrackCount = useLibraryStore(s => s.tracks.length);
  const playlists = usePlaylistStore(s => s.playlists);
  const addTracksToPlaylist = usePlaylistStore(s => s.addTracksToPlaylist);
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isNowPlayingOpen = usePlayerStore(s => s.isNowPlayingOpen);
  const setNowPlayingOpen = usePlayerStore(s => s.setNowPlayingOpen);
  const addToast = useToastStore(s => s.addToast);
  const settings = useSettingsStore(s => s.settings);
  const saveSettings = useSettingsStore(s => s.saveSettings);

  const [time, setTime] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>('theme');
  const [clearCacheConfirmOpen, setClearCacheConfirmOpen] = useState(false);
  const [clearLibraryConfirmOpen, setClearLibraryConfirmOpen] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [isScanningFolders, setIsScanningFolders] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('...');
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
    currentVersion: string;
    latestVersion?: string;
    progress?: number;
    message?: string;
  }>({
    status: 'idle',
    currentVersion: '...',
  });

  const t = useMemo(() => createTranslator(settings.language), [settings.language]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    settingsBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeSettingsSection]);

  useEffect(() => {
    let unsub: null | (() => void) = null;
    let unsubUpdates: null | (() => void) = null;
    if (window.api?.window) {
      void window.api.window.isMaximized().then(value => setIsMaximized(Boolean(value)));
      void window.api.window.getVersion().then(version => setAppVersion(version || '...')).catch(() => setAppVersion('...'));
      unsub = window.api.window.onMaximizeChange(value => setIsMaximized(Boolean(value)));
    }
    if (window.api?.updates) {
      void window.api.updates.getState().then(state => {
        setUpdateState(state);
        setAppVersion(state.currentVersion || '...');
      }).catch(() => undefined);
      unsubUpdates = window.api.updates.onStatusChange(state => {
        setUpdateState(state);
        setAppVersion(state.currentVersion || '...');
      });
    }
    return () => {
      if (unsub) unsub();
      if (unsubUpdates) unsubUpdates();
    };
  }, []);

  const handleCheckForUpdate = async () => {
    try {
      const result = await window.api.updates.check();
      setUpdateState(result);
      setAppVersion(result.currentVersion || appVersion);
    } catch {
      setUpdateState(current => ({ ...current, status: 'error' }));
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      const result = await window.api.updates.download();
      setUpdateState(result);
    } catch {
      setUpdateState(current => ({ ...current, status: 'error' }));
    }
  };

  const handleInstallUpdate = async () => {
    await window.api.updates.install();
  };

  const handlePickFolder = async () => {
    const results = normalizeFolderSelection(await window.api?.dialog?.openFolder());
    if (!results.length) return;
    setSelectedFolders(current => [...new Set([...current, ...results])]);
  };

  const handleScan = async () => {
    if (!selectedFolders.length) return;
    setIsScanningFolders(true);
    try {
      await addFolders(selectedFolders);
      setSelectedFolders([]);
      setScanOpen(false);
    } catch {
      addToast(t('scanFailed'));
    } finally {
      setIsScanningFolders(false);
    }
  };

  const handleRescan = async () => {
    if (!selectedFolders.length) return;
    setIsScanningFolders(true);
    try {
      const normalizedFolders = selectedFolders.map(normalizePathForCompare);
      const selectedTracks = tracks.filter(track => isPathInsideFolders(track.filePath, normalizedFolders));
      const selectedTracksById = new Map(selectedTracks.map(track => [track.id, track]));
      const selectedTrackIds = new Set(selectedTracks.map(track => track.id));
      const filePathToPlaylistIds = new Map<string, string[]>();

      playlists.forEach(playlist => {
        playlist.trackIds.forEach(trackId => {
          if (!selectedTrackIds.has(trackId)) return;
          const track = selectedTracksById.get(trackId);
          if (!track) return;
          const key = normalizePathForCompare(track.filePath);
          const current = filePathToPlaylistIds.get(key);
          if (current) current.push(playlist.id);
          else filePathToPlaylistIds.set(key, [playlist.id]);
        });
      });

      await clearLibrary();
      await addFolders(selectedFolders);

      const rescannedTracks = useLibraryStore.getState().tracks;
      const playlistAssignments = new Map<string, string[]>();

      rescannedTracks.forEach(track => {
        const playlistIds = filePathToPlaylistIds.get(normalizePathForCompare(track.filePath));
        if (!playlistIds?.length) return;
        playlistIds.forEach(playlistId => {
          const current = playlistAssignments.get(playlistId);
          if (current) current.push(track.id);
          else playlistAssignments.set(playlistId, [track.id]);
        });
      });

      for (const [playlistId, trackIds] of playlistAssignments) {
        await addTracksToPlaylist(playlistId, trackIds);
      }

      setSelectedFolders([]);
      setScanOpen(false);
    } finally {
      setIsScanningFolders(false);
    }
  };

  const handleRemoveAll = async () => {
    setIsScanningFolders(true);
    try {
      await clearLibrary();
      setSelectedFolders([]);
    } finally {
      setIsScanningFolders(false);
    }
  };

  const handleClearLibraryFromSettings = async () => {
    setIsScanningFolders(true);
    try {
      await clearLibrary();
      setSelectedFolders([]);
      setClearLibraryConfirmOpen(false);
    } finally {
      setIsScanningFolders(false);
    }
  };

  const handleClearCache = () => {
    try {
      window.localStorage.removeItem('music.library.scroll-positions');
      window.localStorage.removeItem('music.perf-debug');
      clearArtworkCaches();
    } catch {
      // Ignore cache reset errors.
    } finally {
      setClearCacheConfirmOpen(false);
    }
  };

  const currentThemeLabel = useMemo(() => {
    const option = THEME_OPTIONS.find(theme => theme.id === settings.theme);
    return option ? t(option.labelKey) : t('theme');
  }, [settings.theme, t]);

  const currentLayoutLabel = useMemo(() => {
    const option = PLAYER_LAYOUTS.find(layout => layout.id === settings.playerLayout);
    return option ? t(option.labelKey) : settings.playerLayout;
  }, [settings.playerLayout, t]);

  const updateStatusLabel = useMemo(() => {
    if (updateState.status === 'checking') return t('checkingForUpdate');
    if (updateState.status === 'up_to_date') return t('upToDate');
    if (updateState.status === 'available') return `${t('updateAvailable')}${updateState.latestVersion ? ` • v${updateState.latestVersion}` : ''}`;
    if (updateState.status === 'downloading') return `${t('downloadingUpdate')}${typeof updateState.progress === 'number' ? ` ${updateState.progress}%` : ''}`;
    if (updateState.status === 'downloaded') return t('updateReadyToInstall');
    if (updateState.status === 'unsupported') return t('updaterOnlyInRelease');
    if (updateState.status === 'error') return updateState.message || t('updateCheckFailed');
    return '';
  }, [t, updateState]);

  const updateButtonLabel = useMemo(() => {
    if (updateState.status === 'checking') return t('checkingForUpdate');
    if (updateState.status === 'available') return t('downloadUpdate');
    if (updateState.status === 'downloading') return t('downloadingUpdate');
    if (updateState.status === 'downloaded') return t('installNow');
    return t('checkForUpdate');
  }, [t, updateState.status]);

  const handleUpdateAction = async () => {
    if (updateState.status === 'available') {
      await handleDownloadUpdate();
      return;
    }
    if (updateState.status === 'downloaded') {
      await handleInstallUpdate();
      return;
    }
    if (updateState.status !== 'downloading' && updateState.status !== 'checking') {
      await handleCheckForUpdate();
    }
  };

  const setEQPreset = (name: string) => {
    const preset = EQ_PRESETS[name];
    if (!preset) return;
    saveSettings({
      eq: {
        enabled: true,
        presetName: name,
        bands: preset.map((gain, index) => ({ frequency: EQ_FREQUENCIES[index], gain })),
      },
    });
  };

  const getEQMacroValue = (indices: number[]) => {
    const total = indices.reduce((sum, index) => sum + (settings.eq.bands[index]?.gain ?? 0), 0);
    return Number((total / indices.length).toFixed(1));
  };

  const setEQMacroValue = (indices: number[], gain: number) => {
    const newBands = [...settings.eq.bands];
    indices.forEach(index => {
      newBands[index] = { ...newBands[index], gain };
    });
    saveSettings({ eq: { ...settings.eq, enabled: true, presetName: 'Custom', bands: newBands } });
  };

  return (
    <>
      <header className="main-header app-drag-region">
        <div className="header-info">
          <div className="header-brand no-drag" aria-label="Noctra">
            <span className="header-brand-text">NOCTRA</span>
          </div>
          <div className="header-clock-block no-drag">
            <span className="time-display">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="header-date">
              {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="header-right">
          <button className="btn-header-action icon-only no-drag" onClick={() => setScanOpen(true)} title={t('scanFolder')}>
            <span style={{ fontSize: '1.4rem' }}>+</span>
          </button>
          <button className="btn-header-action icon-only no-drag" onClick={() => setSettingsOpen(true)} title={t('settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <div className="window-controls no-drag">
            <button className="window-control-btn" onClick={() => window.api?.window?.minimize()} title="Minimize" aria-label="Minimize">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10.5h12" />
              </svg>
            </button>
            <button
              className="window-control-btn"
              onClick={() => window.api?.window?.maximize()}
              title={isMaximized ? 'Restore' : 'Maximize'}
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                {isMaximized ? (
                  <>
                    <rect x="6.5" y="3.5" width="10" height="10" rx="0.5" />
                    <rect x="3.5" y="6.5" width="10" height="10" rx="0.5" />
                  </>
                ) : (
                  <rect x="4.5" y="4.5" width="11" height="11" rx="0.5" />
                )}
              </svg>
            </button>
            <button className="window-control-btn danger" onClick={() => window.api?.window?.close()} title="Close" aria-label="Close">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10" />
                <path d="M15 5L5 15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {scanOpen && (
        <div className="modal-backdrop" onClick={() => !isScanningFolders && setScanOpen(false)}>
          <div className="playlist-modal scan-modal" onClick={event => event.stopPropagation()}>
            <div className="playlist-modal-head">
              <div>
                <h3>{t('scanMultipleFolders')}</h3>
                <p>{t('scanMultipleHint')}</p>
              </div>
              <button className="library-back-btn" onClick={() => !isScanningFolders && setScanOpen(false)} disabled={isScanningFolders}>{t('close')}</button>
            </div>

            <div className="scan-folder-toolbar">
              <button className="library-action-btn" onClick={handlePickFolder}>{t('addFolder')}</button>
              <span>{selectedFolders.length} {t('folderSelected')}</span>
            </div>

            <div className="scan-folder-list">
              {selectedFolders.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 180 }}>
                  <p>{t('scanMultipleHint')}</p>
                </div>
              ) : (
                selectedFolders.map(folder => (
                  <div key={folder} className="scan-folder-row">
                    <span>{folder}</span>
                    <button
                      className="library-back-btn"
                      onClick={() => setSelectedFolders(current => current.filter(item => item !== folder))}
                    >
                      {t('remove')}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="playlist-modal-actions">
              <button
                className="library-action-btn secondary"
                onClick={() => void handleRemoveAll()}
                disabled={isScanningFolders}
              >
                {t('removeAll')}
              </button>
              <button
                className="library-action-btn secondary"
                onClick={() => void handleRescan()}
                disabled={!selectedFolders.length || isScanningFolders}
              >
                {isScanningFolders ? t('scanning') : t('rescan')}
              </button>
              <button
                className="library-action-btn"
                onClick={() => void handleScan()}
                disabled={!selectedFolders.length || isScanningFolders}
              >
                {isScanningFolders ? t('scanning') : t('scanSelected')}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal-panel" onClick={event => event.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <h2>{t('playerSettings')}</h2>
                  <p>{currentThemeLabel} • {currentLayoutLabel}</p>
              </div>
              <button className="library-back-btn" onClick={() => setSettingsOpen(false)}>{t('close')}</button>
            </div>

            <div className="settings-modal-shell">
              <aside className="settings-sidebar">
                {[
                  { id: 'theme', label: t('theme') },
                  { id: 'language', label: t('language') },
                  { id: 'player', label: t('playerModel') },
                  { id: 'startup', label: t('startupTab') },
                  { id: 'app', label: t('appBehavior') },
                  { id: 'updates', label: t('checkForUpdate') },
                  { id: 'library', label: t('library') },
                  { id: 'eq', label: t('soundEq') },
                ].map(section => (
                  <button
                    key={section.id}
                    type="button"
                    className={`settings-sidebar-link ${activeSettingsSection === section.id ? 'active' : ''}`}
                    onClick={() => setActiveSettingsSection(section.id as SettingsSection)}
                  >
                    {section.label}
                  </button>
                ))}
              </aside>

              <div ref={settingsBodyRef} className="settings-modal-body">
              {activeSettingsSection === 'theme' && (
                <section className="settings-card">
                <h3>{t('theme')}</h3>
                <div className="settings-theme-sections">
                  <div className="settings-theme-group">
                    <span className="settings-select-label">Light Themes</span>
                    <div className="settings-option-grid">
                      {LIGHT_THEME_OPTIONS.map(theme => (
                        <button
                          key={theme.id}
                          type="button"
                          className={`theme-chip theme-option-chip ${settings.theme === theme.id ? 'active' : ''}`}
                          data-theme-option={theme.id}
                          onClick={() => saveSettings({ theme: theme.id as never })}
                        >
                          <span className={`theme-chip-swatch ${theme.id}`} aria-hidden="true" />
                          <span>{t(theme.labelKey)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-theme-group">
                    <span className="settings-select-label">Dark Themes</span>
                    <div className="settings-option-grid">
                      {DARK_THEME_OPTIONS.map(theme => (
                        <button
                          key={theme.id}
                          type="button"
                          className={`theme-chip theme-option-chip ${settings.theme === theme.id ? 'active' : ''}`}
                          data-theme-option={theme.id}
                          onClick={() => saveSettings({ theme: theme.id as never })}
                        >
                          <span className={`theme-chip-swatch ${theme.id}`} aria-hidden="true" />
                          <span>{t(theme.labelKey)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              )}

              {activeSettingsSection === 'language' && (
                <section className="settings-card">
                <h3>{t('language')}</h3>
                <div className="theme-grid">
                  {LANGUAGE_OPTIONS.map(language => (
                    <button
                      key={language.id}
                      className={`theme-chip ${settings.language === language.id ? 'active' : ''}`}
                      onClick={() => saveSettings({ language: language.id as never })}
                    >
                      {t(language.labelKey)}
                    </button>
                  ))}
                </div>
              </section>
              )}

              {activeSettingsSection === 'player' && (
                <section className="settings-card">
                <h3>{t('playerModel')}</h3>
                <div className="layout-grid">
                  {PLAYER_LAYOUTS.map(layout => (
                    <button
                      key={layout.id}
                      className={`layout-card ${settings.playerLayout === layout.id ? 'active' : ''}`}
                      onClick={() => saveSettings({ playerLayout: layout.id })}
                    >
                      <strong>{t(layout.labelKey)}</strong>
                      <span>{t(layout.descKey)}</span>
                    </button>
                  ))}
                </div>
              </section>
              )}

              {activeSettingsSection === 'startup' && (
                <section className="settings-card">
                <h3>{t('startupTab')}</h3>
                <div className="settings-inline-row">
                  <CustomSelect
                    value={settings.startupTab || 'songs'}
                    onChange={val => saveSettings({ startupTab: val as any })}
                    options={[
                      { id: 'songs', label: t('songs') },
                      { id: 'artists', label: t('artists') },
                      { id: 'albums', label: t('albums') },
                      { id: 'folders', label: t('folders') },
                      { id: 'playlists', label: t('playlists') }
                    ]}
                    triggerClassName="settings-select"
                  />
                </div>
                <div className="settings-save-note">{t('autoSaveNote')}</div>
              </section>
              )}

              {activeSettingsSection === 'app' && (
                <section className="settings-card">
                <h3>{t('appBehavior')}</h3>
                <div className="settings-danger-copy">
                  <strong>{t('closeButtonAction')}</strong>
                  <p>{t('closeButtonActionDesc')}</p>
                </div>
                <div className="layout-grid" style={{ marginTop: 14 }}>
                  <button
                    className={`layout-card ${settings.closeAction === 'exit' ? 'active' : ''}`}
                    onClick={() => saveSettings({ closeAction: 'exit' })}
                  >
                    <strong>{t('closeActionExit')}</strong>
                    <span>{t('closeActionExitDesc')}</span>
                  </button>
                  <button
                    className={`layout-card ${settings.closeAction === 'tray' ? 'active' : ''}`}
                    onClick={() => saveSettings({ closeAction: 'tray' })}
                  >
                    <strong>{t('closeActionTray')}</strong>
                    <span>{t('closeActionTrayDesc')}</span>
                  </button>
                </div>
                <div className="settings-save-note">{t('autoSaveNote')}</div>
              </section>
              )}

              {activeSettingsSection === 'updates' && (
                <section className="settings-card">
                <h3>{t('checkForUpdate')}</h3>
                <div className="settings-update-row">
                  <div className="settings-update-meta">
                    <span className="settings-update-label">{t('currentVersion')}</span>
                    <strong className="settings-update-version">v{appVersion}</strong>
                    {updateState.latestVersion && updateState.latestVersion !== appVersion ? (
                      <span className="settings-update-latest">{t('latestVersion')}: v{updateState.latestVersion}</span>
                    ) : null}
                    {updateStatusLabel ? <span className="settings-update-status">{updateStatusLabel}</span> : null}
                  </div>
                  <button
                    className="library-action-btn secondary"
                    onClick={handleUpdateAction}
                    disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
                  >
                    {updateButtonLabel}
                  </button>
                </div>
              </section>
              )}

              {activeSettingsSection === 'library' && (
                <section className="settings-card">
                <h3>{t('library')}</h3>
                <div className="settings-danger-card">
                  <div className="settings-danger-copy">
                    <strong>{t('clearCache')}</strong>
                    <p>{t('clearCacheDesc')}</p>
                  </div>
                  <button
                    type="button"
                    className="library-action-btn secondary"
                    onClick={() => setClearCacheConfirmOpen(true)}
                  >
                    {t('clearCache')}
                  </button>
                </div>

                <div className="settings-danger-card">
                  <div className="settings-danger-copy">
                    <strong>{t('clearLibrary')}</strong>
                    <p>{t('clearLibraryDesc')}</p>
                    <span className="settings-save-note">
                      {libraryTrackCount} {t('songUnit')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="library-action-btn danger"
                    onClick={() => setClearLibraryConfirmOpen(true)}
                    disabled={!libraryTrackCount || isScanningFolders}
                  >
                    {t('clearLibrary')}
                  </button>
                </div>
              </section>
              )}

              {activeSettingsSection === 'eq' && (
                <section className="settings-card">
                <h3>{t('soundEq')}</h3>
                <div className="settings-inline-row">
                  <label className="toggle-row">
                    <span>{t('enableEqualizer')}</span>
                    <input
                      className="settings-checkbox"
                      type="checkbox"
                      checked={settings.eq.enabled}
                      onChange={event => saveSettings({ eq: { ...settings.eq, enabled: event.target.checked } })}
                    />
                  </label>
                  <CustomSelect
                    value={settings.eq.presetName}
                    onChange={val => setEQPreset(val)}
                    options={[
                      { id: 'Custom', label: 'Custom' },
                      ...Object.keys(EQ_PRESETS).map(name => ({ id: name, label: name }))
                    ]}
                    triggerClassName="settings-select"
                  />
                </div>
                <div className="settings-save-note">{t('autoSaveNote')}</div>

                <div className="simple-eq-grid">
                  <label className="simple-eq-card">
                    <div>
                      <strong>{t('bass')}</strong>
                      <span>32Hz - 125Hz</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={getEQMacroValue([0, 1, 2])}
                      onChange={event => setEQMacroValue([0, 1, 2], Number(event.target.value))}
                    />
                  </label>

                  <label className="simple-eq-card">
                    <div>
                      <strong>{t('mid')}</strong>
                      <span>250Hz - 2kHz</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={getEQMacroValue([3, 4, 5, 6])}
                      onChange={event => setEQMacroValue([3, 4, 5, 6], Number(event.target.value))}
                    />
                  </label>

                  <label className="simple-eq-card">
                    <div>
                      <strong>{t('treble')}</strong>
                      <span>4kHz - 16kHz</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={getEQMacroValue([7, 8, 9])}
                      onChange={event => setEQMacroValue([7, 8, 9], Number(event.target.value))}
                    />
                  </label>
                </div>
              </section>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {clearLibraryConfirmOpen && (
        <ConfirmDialog
          title={t('clearLibrary')}
          message={t('clearLibraryWarn')}
          confirmLabel={t('clearLibrary')}
          cancelLabel={t('cancel')}
          destructive
          onConfirm={handleClearLibraryFromSettings}
          onCancel={() => setClearLibraryConfirmOpen(false)}
        />
      )}

      {clearCacheConfirmOpen && (
        <ConfirmDialog
          title={t('clearCache')}
          message={t('clearCacheWarn')}
          confirmLabel={t('clearCache')}
          cancelLabel={t('cancel')}
          onConfirm={handleClearCache}
          onCancel={() => setClearCacheConfirmOpen(false)}
        />
      )}
    </>
  );
}

function normalizePathForCompare(value: string) {
  return value.replace(/[\\/]+/g, '\\').replace(/[\\]+$/, '').toLowerCase();
}

function isPathInsideFolders(filePath: string, normalizedFolders: string[]) {
  const normalizedFilePath = normalizePathForCompare(filePath);
  return normalizedFolders.some(folder => normalizedFilePath === folder || normalizedFilePath.startsWith(`${folder}\\`));
}

function normalizeFolderSelection(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}
