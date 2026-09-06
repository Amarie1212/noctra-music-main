import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Playlist, Track } from '@music/core';
import { formatDuration } from '@music/core';
import { createTranslator } from '../i18n';
import { useLibraryStore, usePlayerStore, usePlaylistStore, useSettingsStore, useToastStore } from '../store';
import { CustomSelect } from './CustomSelect';


interface Props {
  tracks: Track[];
  selectionToolbarHost?: HTMLElement | null;
  defaultPlaylistId?: string;
  showAlbum?: boolean;
  showGenre?: boolean;
  reorderable?: boolean;
  onReorder?: (trackIds: string[]) => Promise<void>;
  onRemoveTracks?: (trackIds: string[]) => Promise<void>;
}

type MenuState = {
  x: number;
  y: number;
  trackId: string;
};

type SelectMenuState = {
  x: number;
  y: number;
  trackId: string;
};

type ModalState =
  | { type: 'playlist'; track: Track }
  | { type: 'manage'; track: Track }
  | { type: 'lyrics'; track: Track }
  | { type: 'confirmRemove'; track: Track }
  | null;

import ConfirmDialog from './ConfirmDialog';

const MENU_WIDTH = 220;
const MENU_HEIGHT = 280;
const MENU_GAP = 10;

const ROW_HEIGHT = 58;
const INITIAL_VIRTUAL_ROWS = 72;

function getInitialWindowRange(trackCount: number, rowHeight: number, shouldVirtualize: boolean) {
  if (!shouldVirtualize) {
    return {
      start: 0,
      end: trackCount,
      topPad: 0,
      bottomPad: 0,
    };
  }

  const initialEnd = Math.min(trackCount, INITIAL_VIRTUAL_ROWS);
  return {
    start: 0,
    end: initialEnd,
    topPad: 0,
    bottomPad: Math.max(0, (trackCount - initialEnd) * rowHeight),
  };
}

export default function TrackList({
  tracks,
  selectionToolbarHost = null,
  defaultPlaylistId,
  showAlbum = true,
  showGenre = true,
  reorderable = false,
  onReorder,
  onRemoveTracks,
}: Props) {
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playTrack = usePlayerStore(s => s.playTrack);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const removeTrack = useLibraryStore(s => s.removeTrack);
  const updateTrack = useLibraryStore(s => s.updateTrack);
  const playlists = usePlaylistStore(s => s.playlists);
  const createPlaylist = usePlaylistStore(s => s.createPlaylist);
  const addTrackToPlaylist = usePlaylistStore(s => s.addTrackToPlaylist);
  const addTracksToPlaylist = usePlaylistStore(s => s.addTracksToPlaylist);
  const addToast = useToastStore(s => s.addToast);
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const queueTrackIds = useMemo(() => tracks.map(track => track.id), [tracks]);
  const tracksById = useMemo(() => new Map(tracks.map(track => [track.id, track])), [tracks]);
  const playlistTrackIdSets = useMemo(
    () => new Map(playlists.map(playlist => [playlist.id, new Set(playlist.trackIds)])),
    [playlists]
  );

  const [contextMenu, setContextMenu] = useState<MenuState | null>(null);
  const [selectMenu, setSelectMenu] = useState<SelectMenuState | null>(null);
  const [activeModal, setActiveModal] = useState<ModalState>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [bulkPlaylistOpen, setBulkPlaylistOpen] = useState(false);
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState(false);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const selectedTrackIdSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);
  const selectionToolbarTarget = selectionToolbarHost ?? (typeof document !== 'undefined' ? document.body : null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const listTopOffsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const selectMenuRef = useRef<HTMLDivElement | null>(null);

  // Balance DOM size and scroll smoothness for medium and large libraries.
  const shouldVirtualize = tracks.length > (reorderable ? 260 : 180);
  const OVERSCAN = 20;

  const [windowRange, setWindowRange] = useState(() => getInitialWindowRange(tracks.length, ROW_HEIGHT, shouldVirtualize));
  const windowRangeRef = useRef(windowRange);
  useEffect(() => {
    windowRangeRef.current = windowRange;
  }, [windowRange]);

  const updateVirtualWindow = useCallback(() => {
    if (!shouldVirtualize) return;
    const scrollEl = scrollElRef.current;
    if (!scrollEl) return;

    const scrollTop = scrollEl.scrollTop;
    const viewportH = scrollEl.clientHeight || 1;
    const localY = Math.max(0, scrollTop - listTopOffsetRef.current);

    const start = Math.max(0, Math.floor(localY / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(tracks.length, Math.ceil((localY + viewportH) / ROW_HEIGHT) + OVERSCAN);

    const next = {
      start,
      end,
      topPad: start * ROW_HEIGHT,
      bottomPad: Math.max(0, (tracks.length - end) * ROW_HEIGHT),
    };

    const prev = windowRangeRef.current;
    if (prev.start === next.start && prev.end === next.end && prev.topPad === next.topPad && prev.bottomPad === next.bottomPad) {
      return;
    }

    setWindowRange(next);
  }, [shouldVirtualize, tracks.length]);

  const handlePlay = useCallback((track: Track) => {
    playTrack(track.id, queueTrackIds);
  }, [playTrack, queueTrackIds]);

  const closeMenu = useCallback(() => setContextMenu(null), []);
  const closeSelectMenu = useCallback(() => setSelectMenu(null), []);

  const openContextMenu = useCallback((x: number, y: number, trackId: string) => {
    setSelectMenu(null);
    setContextMenu({ x, y, trackId });
  }, []);

  const openSelectMenu = useCallback((x: number, y: number, trackId: string) => {
    setContextMenu(null);
    setSelectMenu({ x, y, trackId });
  }, []);

  const toggleTrackSelection = useCallback((trackId: string) => {
    setSelectedTrackIds(current =>
      current.includes(trackId)
        ? current.filter(id => id !== trackId)
        : [...current, trackId]
    );
  }, []);

  const resetSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedTrackIds([]);
    setBulkPlaylistOpen(false);
  }, []);

  // Close menus by clicking anywhere outside the track list (more flexible than requiring a precise click).
  useEffect(() => {
    if (!contextMenu && !selectMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      // Only close on left click/tap (right click is used to open the select menu).
      if (typeof (event as any).button === 'number' && (event as any).button !== 0) return;
      const target = event.target as Node | null;
      if (!target) return;

      // Let kebab button handle toggle itself, otherwise a capture-close would immediately re-open it.
      if (target instanceof Element && target.closest('.btn-kebab')) return;

      const inMenu =
        (contextMenuRef.current && contextMenuRef.current.contains(target)) ||
        (selectMenuRef.current && selectMenuRef.current.contains(target));
      if (inMenu) return;

      closeMenu();
      closeSelectMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMenu();
      closeSelectMenu();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMenu, closeSelectMenu, contextMenu, selectMenu]);

  useEffect(() => {
    if (!shouldVirtualize) return;
    const listEl = listRef.current;
    const scrollEl = scrollContainerRef.current ?? ((listEl?.closest('.library-content') as HTMLElement | null) ?? null);
    if (!scrollEl || !listEl) return;
    scrollElRef.current = scrollEl;
    listTopOffsetRef.current = listEl.offsetTop;

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        updateVirtualWindow();
      });
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      listTopOffsetRef.current = listEl.offsetTop;
      updateVirtualWindow();
    });
    ro.observe(scrollEl);
    ro.observe(listEl);

    // Initial measurement.
    updateVirtualWindow();

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [shouldVirtualize, updateVirtualWindow]);

  useLayoutEffect(() => {
    const nextRange = getInitialWindowRange(tracks.length, ROW_HEIGHT, shouldVirtualize);
    setWindowRange(current =>
      current.start === nextRange.start &&
      current.end === nextRange.end &&
      current.topPad === nextRange.topPad &&
      current.bottomPad === nextRange.bottomPad
        ? current
        : nextRange
    );
  }, [shouldVirtualize, tracks.length]);

  useEffect(() => {
    setSelectedTrackIds(current => current.filter(trackId => tracks.some(track => track.id === trackId)));
  }, [tracks]);

  useLayoutEffect(() => {
    if (!shouldVirtualize) return;
    updateVirtualWindow();
  }, [shouldVirtualize, tracks.length, selectionMode, updateVirtualWindow]);

  useEffect(() => {
    const listEl = listRef.current;
    const songsSection = listEl?.closest('.library-songs-section');
    const libraryContent = listEl?.closest('.library-content');
    if (!songsSection || !libraryContent) return;

    if (selectionMode) {
      libraryContent.classList.add('selection-scroll-lock');
    } else {
      libraryContent.classList.remove('selection-scroll-lock');
    }

    return () => {
      libraryContent.classList.remove('selection-scroll-lock');
    };
  }, [selectionMode]);

  const handleContextMenu = useCallback((event: React.MouseEvent, trackId: string) => {
    event.preventDefault();
    if (selectionMode) return;
    setContextMenu(null);
    setSelectMenu(current => {
      // Toggle: right-click the same track again closes the select menu.
      if (current && current.trackId === trackId) return null;
      return { x: event.clientX, y: event.clientY, trackId };
    });
  }, [selectionMode]);

  const handleOpenKebabMenu = useCallback((event: React.MouseEvent, trackId: string) => {
    event.preventDefault();
    event.stopPropagation();
    // Toggle: click the same kebab again closes.
    if (contextMenu?.trackId === trackId) {
      closeMenu();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(rect.left + rect.width, rect.top + rect.height, trackId);
  }, [closeMenu, contextMenu?.trackId, openContextMenu]);

  const selectedTrack = contextMenu ? tracksById.get(contextMenu.trackId) || null : null;
  const menuPosition = contextMenu ? getContextMenuPosition(contextMenu.x, contextMenu.y, MENU_WIDTH, MENU_HEIGHT) : null;
  const selectMenuPosition = selectMenu ? getContextMenuPosition(selectMenu.x, selectMenu.y, 130, 60) : null;
  const selectMenuTrackId = selectMenu?.trackId ?? null;
  const selectedTracks = useMemo(
    () => tracks.filter(track => selectedTrackIdSet.has(track.id)),
    [selectedTrackIdSet, tracks]
  );
  const visibleTracks = useMemo(
    () => (shouldVirtualize ? tracks.slice(windowRange.start, windowRange.end) : tracks),
    [shouldVirtualize, tracks, windowRange.end, windowRange.start]
  );
  const allVisibleSelected = tracks.length > 0 && selectedTrackIds.length === tracks.length;
  const isPlaylistScoped = Boolean(onRemoveTracks);

  const handleAddToPlaylist = async (trackId: string, playlistId: string) => {
    await addTrackToPlaylist(playlistId, trackId);
    addToast(t('addedToPlaylist'));
    setActiveModal(null);
    closeMenu();
  };

  const handleAddSelectedToPlaylist = async (playlistId: string, trackIds: string[]) => {
    if (!trackIds.length) return;
    await addTracksToPlaylist(playlistId, trackIds);
    addToast(`${trackIds.length} ${t('addedToPlaylist')}`);
    resetSelection();
  };

  const handleRemove = async (trackId: string) => {
    await removeTrack(trackId);
    addToast(t('removedFromLibraryToast'));
    setActiveModal(null);
    closeMenu();
  };

  const handleRemoveFromPlaylist = async (trackIds: string[]) => {
    if (!onRemoveTracks || !trackIds.length) return;
    await onRemoveTracks(trackIds);
    addToast(`${trackIds.length} ${t('removeFromPlaylist')}`);
    setActiveModal(null);
    setBulkRemoveConfirmOpen(false);
    closeMenu();
    if (selectionMode) resetSelection();
  };

  const handleRemoveSelected = async (trackIds: string[]) => {
    if (!trackIds.length) return;
    if (isPlaylistScoped) {
      await handleRemoveFromPlaylist(trackIds);
      return;
    }

    await Promise.all(trackIds.map(trackId => removeTrack(trackId)));
    addToast(t('removedFromLibraryToast'));
    setActiveModal(null);
    setBulkRemoveConfirmOpen(false);
    closeMenu();
    if (selectionMode) resetSelection();
  };

  const handleReorder = useCallback(async (draggedTrackId: string, targetTrackId: string) => {
    if (!onReorder || draggedTrackId === targetTrackId) return;

    const currentIds = tracks.map(track => track.id);
    const sourceIndex = currentIds.indexOf(draggedTrackId);
    const targetIndex = currentIds.indexOf(targetTrackId);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const nextIds = [...currentIds];
    const [movedId] = nextIds.splice(sourceIndex, 1);
    nextIds.splice(targetIndex, 0, movedId);

    await onReorder(nextIds);
    addToast(t('playlistOrderSaved'));
  }, [addToast, onReorder, t, tracks]);

  const buildTrackDetails = (track: Track) => {
    const details = [track.artist];
    if (showAlbum && track.album && track.album !== 'Unknown Album') details.push(track.album);
    if (showGenre && track.genre && track.genre !== 'Unknown') details.push(track.genre);
    return details.filter(Boolean).join(' - ');
  };

  if (!tracks.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">Music</div>
        <div className="empty-state-title">{t('noTracksHere')}</div>
        <div className="empty-state-desc">{t('addMusicFromComputer')}</div>
      </div>
    );
  }

  const selectionToolbar = (
    <div className={`track-selection-collapse ${selectionMode ? 'open' : ''}`} aria-hidden={!selectionMode}>
      <div className="track-selection-toolbar" role="toolbar" aria-label="Selection actions">
        <div className="track-selection-actions">
          <button
            type="button"
            className="track-selection-seg"
            onClick={() => setSelectedTrackIds(allVisibleSelected ? [] : tracks.map(track => track.id))}
            aria-label={allVisibleSelected ? t('unselectAll') : t('selectAll')}
            title={allVisibleSelected ? t('unselectAll') : t('selectAll')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="3.5" width="17" height="17" rx="3"></rect>
              {allVisibleSelected && <polyline points="7.5 12.5 10.5 15.5 16.5 8.5"></polyline>}
            </svg>
          </button>

          <button
            type="button"
            className="track-selection-seg"
            disabled={!selectedTrackIds.length}
            onClick={() => startTransition(() => setBulkPlaylistOpen(true))}
            aria-label={t('addToPlaylist')}
            title={t('addToPlaylist')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <button
            type="button"
            className="track-selection-seg"
            disabled={!selectedTrackIds.length}
            onClick={() => startTransition(() => setBulkRemoveConfirmOpen(true))}
            aria-label={isPlaylistScoped ? t('removeFromPlaylist') : t('removeFromLibrary')}
            title={isPlaylistScoped ? t('removeFromPlaylist') : t('removeFromLibrary')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4.8c0-.66.54-1.2 1.2-1.2h5.6c.66 0 1.2.54 1.2 1.2V6"></path>
              <path d="M18 6v12.2c0 .66-.54 1.2-1.2 1.2H7.2c-.66 0-1.2-.54-1.2-1.2V6"></path>
              <path d="M10 10v6"></path>
              <path d="M14 10v6"></path>
            </svg>
          </button>

          <button
            type="button"
            className="track-selection-seg"
            onClick={resetSelection}
            aria-label={t('done')}
            title={t('done')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`track-list-shell ${selectionMode ? 'selection-active' : ''}`}>
      {selectionToolbarTarget ? createPortal(selectionToolbar, selectionToolbarTarget) : selectionToolbar}

      <div className={`track-list ${selectionMode ? 'selection-active' : ''}`} ref={listRef}>
        {shouldVirtualize && windowRange.topPad > 0 && (
          <div style={{ height: windowRange.topPad }} aria-hidden="true" />
        )}

        {visibleTracks.map((track, index) => {
          const absoluteIndex = shouldVirtualize ? windowRange.start + index : index;
          return (
            <TrackRow
              key={track.id}
              track={track}
              index={absoluteIndex}
              selectionMode={selectionMode}
              isSelected={selectedTrackIdSet.has(track.id)}
              isCurrentTrack={track.id === currentTrackId}
              isCurrentPlaying={track.id === currentTrackId && isPlaying}
              reorderable={reorderable}
              draggingTrackId={draggingTrackId}
              dropTargetTrackId={dropTargetTrackId}
              onPlay={handlePlay}
              onTogglePlay={togglePlay}
              onContextMenu={handleContextMenu}
              onToggleSelection={toggleTrackSelection}
              onOpenKebab={handleOpenKebabMenu}
              onDragStart={(id: string, e: React.DragEvent) => {
                if (!reorderable || selectionMode) return e.preventDefault();
                setDraggingTrackId(id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={(id: string, e: React.DragEvent) => {
                if (!reorderable || selectionMode || !draggingTrackId || draggingTrackId === id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropTargetTrackId(id);
              }}
              onDrop={async (id: string, e: React.DragEvent) => {
                if (!reorderable || selectionMode) return;
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain') || draggingTrackId;
                setDropTargetTrackId(null);
                setDraggingTrackId(null);
                if (draggedId) await handleReorder(draggedId, id);
              }}
              onDragEnd={() => {
                setDraggingTrackId(null);
                setDropTargetTrackId(null);
              }}
              showAlbum={showAlbum}
              showGenre={showGenre}
              t={t}
            />
          );
        })}

        {shouldVirtualize && windowRange.bottomPad > 0 && (
          <div style={{ height: windowRange.bottomPad }} aria-hidden="true" />
        )}
      </div>

      {contextMenu && selectedTrack && menuPosition && createPortal(
        <>
          <div className="context-menu-backdrop" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div
            ref={node => { contextMenuRef.current = node; }}
            className="context-menu"
            style={{
              left: menuPosition.x,
              top: menuPosition.y
            }}
          >
            <div className="context-menu-item" onClick={() => { playTrack(selectedTrack.id, tracks.map(track => track.id)); closeMenu(); }}>
              {t('play')}
            </div>
            <div className="context-menu-sep" />
            <div className="context-menu-item" onClick={() => { closeMenu(); startTransition(() => setActiveModal({ type: 'playlist', track: selectedTrack })); }}>
              {t('addToPlaylist')}
            </div>
            <div className="context-menu-item" onClick={() => { closeMenu(); startTransition(() => setActiveModal({ type: 'manage', track: selectedTrack })); }}>
              {t('manageSong')}
            </div>
            <div className="context-menu-item" onClick={() => { closeMenu(); startTransition(() => setActiveModal({ type: 'lyrics', track: selectedTrack })); }}>
              {t('editLyrics')}
            </div>
            <div className="context-menu-sep" />
            <div className="context-menu-item danger" onClick={() => { closeMenu(); startTransition(() => setActiveModal({ type: 'confirmRemove', track: selectedTrack })); }}>
              {isPlaylistScoped ? t('removeFromPlaylist') : t('removeFromLibrary')}
            </div>
          </div>
        </>,
        document.body
      )}

      {selectMenu && selectMenuPosition && selectMenuTrackId && createPortal(
        <>
          <div className="context-menu-backdrop" onClick={closeSelectMenu} onContextMenu={(e) => { e.preventDefault(); closeSelectMenu(); }} />
          <div
            ref={node => { selectMenuRef.current = node; }}
            className="context-menu action-popover"
            style={{
              left: selectMenuPosition.x,
              top: selectMenuPosition.y
            }}
          >
            <div
              className="context-menu-item"
              onClick={() => {
                const trackId = selectMenuTrackId;
                closeSelectMenu();
                setSelectionMode(true);
                setSelectedTrackIds(current => (current.includes(trackId) ? current : [...current, trackId]));
              }}
            >
              {t('select')}
            </div>
          </div>
        </>,
        document.body
      )}

      {activeModal?.type === 'playlist' && createPortal(
        <SingleTrackPlaylistModal track={activeModal.track} playlists={playlists} playlistTrackIdSets={playlistTrackIdSets} defaultPlaylistId={defaultPlaylistId} onCreatePlaylist={createPlaylist} onClose={() => setActiveModal(null)} onAdd={handleAddToPlaylist} />,
        document.body
      )}

      {activeModal?.type === 'manage' && createPortal(
        <ManageSongModal
          track={activeModal.track}
          onClose={() => setActiveModal(null)}
          onRemove={handleRemove}
          onUpdate={updateTrack}
          onSaved={(updatedTrack) => setActiveModal({ type: 'manage', track: { ...activeModal.track, ...updatedTrack } })}
        />,
        document.body
      )}

      {activeModal?.type === 'lyrics' && createPortal(
        <EditLyricsModal
          track={activeModal.track}
          onClose={() => setActiveModal(null)}
          onSaved={() => {
            addToast(t('lyricsSaved'));
            setActiveModal(null);
            closeMenu();
          }}
        />,
        document.body
      )}

      {activeModal?.type === 'confirmRemove' && createPortal(
        <ConfirmDialog
          title={isPlaylistScoped ? t('removeFromPlaylist') : t('removeFromLibrary')}
          message={`${t('deletePlaylistWarn')} ${activeModal.track.title}?`}
          confirmLabel={t('remove')}
          cancelLabel={t('cancel')}
          destructive
          onConfirm={() => isPlaylistScoped ? handleRemoveFromPlaylist([activeModal.track.id]) : handleRemove(activeModal.track.id)}
          onCancel={() => setActiveModal(null)}
        />,
        document.body
      )}

      {bulkRemoveConfirmOpen && createPortal(
        <ConfirmDialog
          title={isPlaylistScoped ? t('removeFromPlaylist') : t('removeFromLibrary')}
          message={`${t('deletePlaylistWarn') || 'Are you sure you want to remove'} ${selectedTrackIds.length} ${t('songsSelected')}?`}
          confirmLabel={t('remove')}
          cancelLabel={t('cancel')}
          destructive
          onConfirm={async () => {
            await handleRemoveSelected(selectedTrackIds);
          }}
          onCancel={() => setBulkRemoveConfirmOpen(false)}
        />,
        document.body
      )}

      {bulkPlaylistOpen && createPortal(
        <MultiTrackPlaylistModal tracks={selectedTracks} playlists={playlists} playlistTrackIdSets={playlistTrackIdSets} defaultPlaylistId={defaultPlaylistId} onCreatePlaylist={createPlaylist} onClose={() => setBulkPlaylistOpen(false)} onAdd={handleAddSelectedToPlaylist} />,
        document.body
      )}
    </div>
  );
}

import { memo } from 'react';

const TrackRow = memo(({
  track,
  index,
  isCurrentTrack,
  isCurrentPlaying,
  selectionMode,
  isSelected,
  reorderable,
  draggingTrackId,
  dropTargetTrackId,
  onPlay,
  onTogglePlay,
  onContextMenu,
  onToggleSelection,
  onOpenKebab,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  showAlbum,
  showGenre,
  t
}: {
  track: Track;
  index: number;
  isCurrentTrack: boolean;
  isCurrentPlaying: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  reorderable: boolean;
  draggingTrackId: string | null;
  dropTargetTrackId: string | null;
  onPlay: (t: Track) => void;
  onTogglePlay: () => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onToggleSelection: (id: string) => void;
  onOpenKebab: (e: React.MouseEvent, id: string) => void;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string, e: React.DragEvent) => Promise<void>;
  onDragEnd: () => void;
  showAlbum?: boolean;
  showGenre?: boolean;
  t: (key: string) => string;
}) => {
  const details = [track.artist];
  if (showAlbum && track.album && track.album !== 'Unknown Album') details.push(track.album);
  if (showGenre && track.genre && track.genre !== 'Unknown') details.push(track.genre);
  const subtitle = details.filter(Boolean).join(' - ');

  return (
    <div
      className={`track-item ${isCurrentTrack ? 'playing' : ''} ${selectionMode ? 'selecting' : ''} ${isSelected ? 'selected' : ''} ${reorderable ? 'reorderable' : ''} ${draggingTrackId === track.id ? 'dragging' : ''} ${dropTargetTrackId === track.id ? 'drop-target' : ''}`}
      draggable={reorderable && !selectionMode}
      onClick={() => {
        if (!selectionMode) return;
        onToggleSelection(track.id);
      }}
      onDoubleClick={() => onPlay(track)}
      onContextMenu={event => onContextMenu(event, track.id)}
      onDragStart={e => onDragStart(track.id, e)}
      onDragOver={e => onDragOver(track.id, e)}
      onDrop={e => onDrop(track.id, e)}
      onDragEnd={onDragEnd}
    >
      <div className="track-num">
        {selectionMode ? (
          <button
            type="button"
            className={`track-select-box ${isSelected ? 'checked' : ''}`}
            aria-label={isSelected ? `${t('unselectAll')} ${track.title}` : `${t('selectAll')} ${track.title}`}
            onClick={event => {
              event.stopPropagation();
              onToggleSelection(track.id);
            }}
          >
            <span>{isSelected ? '✓' : ''}</span>
          </button>
        ) : (
          <div className="track-index-stack">
            {reorderable && <span className="track-drag-grip" aria-hidden="true">::</span>}
            {isCurrentTrack ? <span className="track-playing-icon">Now</span> : index + 1}
          </div>
        )}
      </div>

      <div className="track-info">
        <div className="track-meta">
          <div className="track-title">{track.title}</div>
          <div className="track-artist">{subtitle}</div>
        </div>
      </div>

      <div className="track-duration-cell">
        <span className="track-duration">{formatDuration(track.duration)}</span>
      </div>

      <div className="track-actions">
        {!selectionMode && (
          <button
            type="button"
            className="btn-kebab"
            onClick={event => onOpenKebab(event, track.id)}
            onContextMenu={event => onOpenKebab(event, track.id)}
            onMouseDown={event => {
              event.stopPropagation();
            }}
            onMouseUp={event => event.stopPropagation()}
            aria-label={`${t('manageSong')} ${track.title}`}
            title={t('manageSong')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        )}

        <button
          className="btn-icon"
          onClick={event => {
            event.stopPropagation();
            if (selectionMode) return;
            if (isCurrentTrack) {
              onTogglePlay();
              return;
            }
            onPlay(track);
          }}
          style={{ fontSize: 16 }}
          title={isCurrentPlaying ? t('pause') : t('play')}
          aria-label={`${isCurrentPlaying ? t('pause') : t('play')} ${track.title}`}
        >
          {isCurrentPlaying ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="8,5 20,12 8,19" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}, (prev, next) => (
  prev.track === next.track &&
  prev.index === next.index &&
  prev.isCurrentTrack === next.isCurrentTrack &&
  prev.isCurrentPlaying === next.isCurrentPlaying &&
  prev.selectionMode === next.selectionMode &&
  prev.isSelected === next.isSelected &&
  prev.reorderable === next.reorderable &&
  prev.draggingTrackId === next.draggingTrackId &&
  prev.dropTargetTrackId === next.dropTargetTrackId &&
  prev.showAlbum === next.showAlbum &&
  prev.showGenre === next.showGenre &&
  prev.t === next.t
));

function getContextMenuPosition(x: number, y: number, width: number, height: number) {
  const maxX = window.innerWidth - width - MENU_GAP;
  const maxY = window.innerHeight - height - MENU_GAP;

  let finalY = y;
  // If insufficient space below, flip it upwards
  if (y + height > window.innerHeight - MENU_GAP) {
    finalY = y - height;
  }
  
  return {
    x: Math.max(MENU_GAP, Math.min(x, maxX)),
    y: Math.max(MENU_GAP, Math.min(finalY, maxY)),
  };
}

function SingleTrackPlaylistModal({
  track,
  playlists,
  playlistTrackIdSets,
  defaultPlaylistId,
  onCreatePlaylist,
  onClose,
  onAdd,
}: {
  track: Track;
  playlists: Playlist[];
  playlistTrackIdSets: Map<string, Set<string>>;
  defaultPlaylistId?: string;
  onCreatePlaylist: (name: string) => Promise<string>;
  onClose: () => void;
  onAdd: (trackId: string, playlistId: string) => Promise<void>;
}) {
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const [playlistId, setPlaylistId] = useState(defaultPlaylistId || '');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const playlistOptions = useMemo(
    () => playlists.map(playlist => ({ id: playlist.id, label: playlist.name })),
    [playlists]
  );
  const selectedPlaylistTrackIds = playlistId ? playlistTrackIdSets.get(playlistId) : null;
  const alreadyInSelectedPlaylist = Boolean(selectedPlaylistTrackIds?.has(track.id));

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const newId = await onCreatePlaylist(name);
      setPlaylistId(newId);
      setNewPlaylistName('');
      await onAdd(track.id, newId);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="playlist-modal" onClick={event => event.stopPropagation()}>
        <div className="playlist-modal-head">
          <h3>{t('addToPlaylist')}</h3>
          <div className="playlist-modal-header-actions">
            <button type="button" className="library-back-btn" onClick={onClose}>{t('cancel')}</button>
            <button
              type="button"
              className="library-action-btn secondary playlist-modal-confirm-btn"
              disabled={!playlistId || alreadyInSelectedPlaylist}
              onClick={() => onAdd(track.id, playlistId)}
            >
              {t('add')}
            </button>
          </div>
        </div>

        <div className="playlist-modal-controls-row">
          <div className="playlist-modal-control-group">
            <span className="playlist-modal-input-label">{t('playlist')}</span>
            <CustomSelect
              value={playlistId}
              onChange={val => setPlaylistId(val)}
              options={playlistOptions}
              triggerClassName="playlist-modal-select"
              placeholder={t('selectPlaylist') || 'Select Playlist'}
            />
          </div>

          <div className="playlist-modal-control-group">
            <span className="playlist-modal-input-label">{t('create')}</span>
            <div className="playlist-create-inline">
              <input
                type="text"
                value={newPlaylistName}
                onChange={event => setNewPlaylistName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void handleCreatePlaylist();
                }}
                placeholder={t('createPlaylistInline')}
              />
              <button type="button" className="library-action-btn secondary btn-inline-create" disabled={isCreating || !newPlaylistName.trim()} onClick={() => void handleCreatePlaylist()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="playlist-modal-list single-preview">
          <div className="playlist-modal-track picker static-preview">
            <div className="playlist-modal-track-meta">
              <span>{track.title}</span>
              <small>{track.artist || t('unknownArtist')}</small>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}

function MultiTrackPlaylistModal({
  tracks,
  playlists,
  playlistTrackIdSets,
  defaultPlaylistId,
  onCreatePlaylist,
  onClose,
  onAdd,
}: {
  tracks: Track[];
  playlists: Playlist[];
  playlistTrackIdSets: Map<string, Set<string>>;
  defaultPlaylistId?: string;
  onCreatePlaylist: (name: string) => Promise<string>;
  onClose: () => void;
  onAdd: (playlistId: string, trackIds: string[]) => Promise<void>;
}) {
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const trackIds = tracks.map(track => track.id);
  const [playlistId, setPlaylistId] = useState(defaultPlaylistId || '');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>(trackIds);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const playlistOptions = useMemo(
    () => playlists.map(playlist => ({ id: playlist.id, label: playlist.name })),
    [playlists]
  );
  const selectedTrackIdSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);
  const selectedPlaylistTrackIds = playlistId ? playlistTrackIdSets.get(playlistId) : null;
  const addableTrackIds = useMemo(() => {
    if (!selectedPlaylistTrackIds) return selectedTrackIds;
    return selectedTrackIds.filter(trackId => !selectedPlaylistTrackIds.has(trackId));
  }, [selectedPlaylistTrackIds, selectedTrackIds]);

  const toggleTrack = (trackId: string) => {
    setSelectedTrackIds(current =>
      current.includes(trackId)
        ? current.filter(id => id !== trackId)
        : [...current, trackId]
    );
  };

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const newId = await onCreatePlaylist(name);
      setPlaylistId(newId);
      setNewPlaylistName('');
      await onAdd(newId, selectedTrackIds);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="playlist-modal" onClick={event => event.stopPropagation()}>
        <div className="playlist-modal-head">
          <h3>{t('addSelectedToPlaylist')}</h3>
          <div className="playlist-modal-header-actions">
            <button type="button" className="library-back-btn" onClick={onClose}>{t('cancel')}</button>
            <button
              type="button"
              className="library-action-btn secondary playlist-modal-confirm-btn"
              disabled={!playlistId || !addableTrackIds.length}
              onClick={() => onAdd(playlistId, addableTrackIds)}
            >
              {t('add')}
            </button>
          </div>
        </div>

        <div className="playlist-modal-controls-row">
          <div className="playlist-modal-control-group">
            <span className="playlist-modal-input-label">{t('playlist')}</span>
            <CustomSelect
              value={playlistId}
              onChange={val => setPlaylistId(val)}
              options={playlistOptions}
              triggerClassName="playlist-modal-select"
              placeholder={t('selectPlaylist') || 'Select Playlist'}
            />
          </div>

          <div className="playlist-modal-control-group">
            <span className="playlist-modal-input-label">{t('create')}</span>
            <div className="playlist-create-inline">
              <input
                type="text"
                value={newPlaylistName}
                onChange={event => setNewPlaylistName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void handleCreatePlaylist();
                }}
                placeholder={t('createPlaylistInline')}
              />
              <button type="button" className="library-action-btn secondary btn-inline-create" disabled={isCreating || !newPlaylistName.trim()} onClick={() => void handleCreatePlaylist()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="playlist-modal-summary">
          <strong>{selectedTrackIds.length}</strong> {t('songsSelected')}
        </div>

        <div className="playlist-modal-list">
          {tracks.map(track => (
            <button
              key={track.id}
              type="button"
              className={`playlist-modal-track picker ${selectedTrackIdSet.has(track.id) ? 'selected' : ''}`}
              onClick={() => toggleTrack(track.id)}
              aria-pressed={selectedTrackIdSet.has(track.id)}
            >
              <div className="playlist-modal-track-meta">
                <span>{track.title}</span>
                <small>{track.artist || t('unknownArtist')}</small>
              </div>
              <span className="playlist-modal-track-check" aria-hidden="true">
                {selectedTrackIdSet.has(track.id) ? '\u2713' : ''}
              </span>
            </button>
          ))}
        </div>


      </div>
    </div>
  );
}

function ManageSongModal({
  track,
  onClose,
  onRemove,
  onUpdate,
  onSaved,
}: {
  track: Track;
  onClose: () => void;
  onRemove: (trackId: string) => Promise<void>;
  onUpdate: (track: { id: string; title?: string; artist?: string; album?: string; genre?: string; year?: number; trackNumber?: number }) => Promise<boolean>;
  onSaved: (updated: { title: string; artist: string; album: string; genre: string; artworkData?: string }) => void;
}) {
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const addToast = useToastStore(s => s.addToast);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
    year: track.year?.toString() || '',
    trackNumber: track.trackNumber?.toString() || '',
  });
  const [artworkData, setArtworkData] = useState(track.artworkData);

  const updateLibraryArtwork = useLibraryStore(s => s.updateArtwork);
  const setLibraryArtworkFromFile = useLibraryStore(s => s.setArtworkFromFile);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onUpdate({
      id: track.id,
      title: formData.title || undefined,
      artist: formData.artist || undefined,
      album: formData.album || undefined,
      genre: formData.genre || undefined,
      year: formData.year ? parseInt(formData.year, 10) : undefined,
      trackNumber: formData.trackNumber ? parseInt(formData.trackNumber, 10) : undefined,
    });
    setSaving(false);
    if (ok) {
      addToast(t('trackUpdated'));
      onSaved({ 
        title: formData.title, 
        artist: formData.artist, 
        album: formData.album, 
        genre: formData.genre,
        artworkData 
      });
      setIsEditing(false);
    } else {
      addToast(t('failedToUpdateTrack'));
    }
  };

  const handleChangeArtwork = async () => {
    const paths = await window.api.dialog.openImages();
    if (paths && paths.length > 0) {
      const data = await setLibraryArtworkFromFile(track.id, paths[0]);
      if (data) {
        setArtworkData(data);
        addToast(t('trackUpdated'));
      }
    }
  };

  const handleCancel = () => {
    setFormData({
      title: track.title,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      year: track.year?.toString() || '',
      trackNumber: track.trackNumber?.toString() || '',
    });
    setIsEditing(false);
  };

  // Sync form when track prop updates (after parent state merge)
  useEffect(() => {
    if (!isEditing) {
      setFormData({
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        year: track.year?.toString() || '',
        trackNumber: track.trackNumber?.toString() || '',
      });
      setArtworkData(track.artworkData);
    }
  }, [track, isEditing]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="playlist-modal manage-song-modal" onClick={event => event.stopPropagation()}>
        {/* Header */}
        <div className="playlist-modal-head">
          <div className="manage-song-header-info">
            <h3>{t('manageSong')}</h3>
            <p className={`manage-song-subtitle ${isEditing ? 'editing' : ''}`}>
              {isEditing ? t('editTrackDetails') : track.title}
            </p>
          </div>
          <div className="playlist-modal-header-actions">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="library-action-btn secondary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="library-action-btn secondary" onClick={handleCancel}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="library-action-btn secondary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
                <button type="button" className="library-action-btn secondary" onClick={onClose}>
                  {t('close') || 'Close'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body with animated slide */}
        <div className={`manage-song-body ${isEditing ? 'is-editing' : 'is-viewing'}`}>
          {/* View mode */}
          <div className="manage-song-panel view-panel">
            <div className="manage-song-view-layout">
              <div className="manage-song-artwork-section">
                <div className="manage-song-artwork">
                  {artworkData ? (
                    <img src={artworkData} alt="" decoding="async" draggable={false} />
                  ) : (
                    <div className="manage-song-no-artwork">No Art</div>
                  )}
                </div>
              </div>
              <div className="manage-song-grid">
                <div>
                  <span>{t('artistLabel')}</span>
                  <strong className="manage-song-item-val">{track.artist}</strong>
                </div>
                <div>
                  <span>{t('albumLabel')}</span>
                  <strong className="manage-song-item-val">{track.album}</strong>
                </div>
                <div>
                  <span>{t('genreLabel')}</span>
                  <strong className="manage-song-item-val">{track.genre}</strong>
                </div>
                <div>
                  <span>{t('durationLabel')}</span>
                  <strong className="manage-song-item-val">{formatDuration(track.duration)}</strong>
                </div>
                <div className="full">
                  <span>{t('folderLabel')}</span>
                  <strong className="manage-song-item-val path">{track.filePath}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Edit mode */}
          <div className="manage-song-panel edit-panel">
            <div className="manage-song-edit-layout">
              <div className="manage-song-artwork-section editing">
                <div className="manage-song-artwork">
                  {artworkData ? (
                    <img src={artworkData} alt="" decoding="async" draggable={false} />
                  ) : (
                    <div className="manage-song-no-artwork">No Art</div>
                  )}
                  <button type="button" className="manage-song-change-art" onClick={handleChangeArtwork}>
                    Change Cover
                  </button>
                </div>
              </div>
              <div className="manage-song-edit-form">
                <div className="manage-song-edit-row full">
                  <label>{t('titleLabel')}</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={t('titleLabel')}
                    tabIndex={isEditing ? 0 : -1}
                  />
                </div>
                <div className="manage-song-edit-row full">
                  <label>{t('artistLabel')}</label>
                  <input
                    type="text"
                    value={formData.artist}
                    onChange={e => setFormData(prev => ({ ...prev, artist: e.target.value }))}
                    placeholder={t('artistLabel')}
                    tabIndex={isEditing ? 0 : -1}
                  />
                </div>
                <div className="manage-song-edit-row full">
                  <label>{t('albumLabel')}</label>
                  <input
                    type="text"
                    value={formData.album}
                    onChange={e => setFormData(prev => ({ ...prev, album: e.target.value }))}
                    placeholder={t('albumLabel')}
                    tabIndex={isEditing ? 0 : -1}
                  />
                </div>
                <div className="manage-song-edit-row full">
                  <label>{t('genreLabel')}</label>
                  <input
                    type="text"
                    value={formData.genre}
                    onChange={e => setFormData(prev => ({ ...prev, genre: e.target.value }))}
                    placeholder={t('genreLabel')}
                    tabIndex={isEditing ? 0 : -1}
                  />
                </div>
                <div className="manage-song-edit-row half">
                  <label>{t('yearLabel')}</label>
                  <input
                    type="number"
                    className="no-stepper"
                    value={formData.year}
                    onChange={e => setFormData(prev => ({ ...prev, year: e.target.value }))}
                    placeholder={t('yearLabel')}
                    tabIndex={isEditing ? 0 : -1}
                  />
                </div>
                <div className="manage-song-edit-row half">
                  <label>{t('trackNumberLabel')}</label>
                  <input
                    type="number"
                    className="no-stepper"
                    value={formData.trackNumber}
                    onChange={e => setFormData(prev => ({ ...prev, trackNumber: e.target.value }))}
                    placeholder={t('trackNumberLabel')}
                    tabIndex={isEditing ? 0 : -1}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {/* Modal actions moved to header */}
      </div>
    </div>
  );
}

function EditLyricsModal({
  track,
  onClose,
  onSaved,
}: {
  track: Track;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addToast = useToastStore(s => s.addToast);
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const [lyrics, setLyrics] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const localLyrics = await window.api.lyrics.loadLocal(track.filePath);
      if (cancelled) return;
      setLyrics(localLyrics || '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [track.filePath]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await window.api.lyrics.saveLocal(track.filePath, lyrics);
    setSaving(false);
    if (ok) onSaved();
    else addToast(t('failedToSaveLyrics'));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="playlist-modal lyrics-edit-modal" onClick={event => event.stopPropagation()}>
        <div className="playlist-modal-head">
          <div>
            <h3>{t('editLyrics')}</h3>
            <p>{track.title}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="library-action-btn secondary"
              disabled={saving || loading}
              onClick={handleSave}
            >
              {saving ? t('savingLyrics') : t('saveLyrics')}
            </button>
            <button type="button" className="library-action-btn secondary" onClick={onClose}>{t('close')}</button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state" style={{ minHeight: 180 }}>
            <p>{t('loadingLyrics')}</p>
          </div>
        ) : (
          <textarea
            className="lyrics-editor"
            value={lyrics}
            onChange={event => setLyrics(event.target.value)}
            placeholder={t('lyricsPlaceholder')}
          />
        )}

        {/* Modal actions moved to header */}
      </div>
    </div>
  );
}
