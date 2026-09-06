import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibrarySort, Playlist, Track } from '@music/core';
import { createTranslator } from '../i18n';
import { useLibraryStore, usePlayerStore, usePlaylistStore, useSettingsStore, useToastStore } from '../store';
import TrackList from './TrackList';
import ConfirmDialog from './ConfirmDialog';
import { CustomSelect } from './CustomSelect';
import { markPerfEnd, markPerfStart, scheduleMemorySnapshot } from '../perf';
import { getTrackArtworkSrc } from '../artwork';

type LibraryTab = 'songs' | 'artists' | 'albums' | 'folders' | 'playlists';
type GroupType = 'artist' | 'album' | 'folder';
type PlaylistDetailSort = LibrarySort | 'playlist-order';

const TAB_ORDER: LibraryTab[] = ['songs', 'artists', 'albums', 'folders', 'playlists'];

interface LibraryGroup {
  id: string;
  title: string;
  subtitle: string;
  cover?: string;
  tracks: Track[];
  folderPath?: string;
  // Precomputed stats for fast subtitle + sorting (avoid scanning tracks arrays during render/sort).
  songCount?: number;
  albumCount?: number;
  artistName?: string;
  year?: number;
  latestAddedAt?: number;
  latestPlayedAt?: number;
  latestYear?: number;
}

const SORT_OPTIONS: Array<{ id: LibrarySort; labelKey: string }> = [
  { id: 'name-asc', labelKey: 'nameAsc' },
  { id: 'name-desc', labelKey: 'nameDesc' },
  { id: 'date-added', labelKey: 'newest' },
  { id: 'last-played', labelKey: 'lastPlayed' },
  { id: 'year', labelKey: 'year' },
];

const normalizedTextCache = new Map<string, string>();
const queryTokenCache = new Map<string, string[]>();
const trackTitleCache = new WeakMap<Track, string>();

const PLAYLIST_SORT_OPTIONS: Array<{ id: PlaylistDetailSort; labelKey: string }> = [
  { id: 'playlist-order', labelKey: 'playlistOrder' },
  ...SORT_OPTIONS,
];

const SMART_PLAYLIST_IDS = {
  frequent: '__smart-frequent',
  recent: '__smart-recent',
} as const;

export default function LibraryPane() {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const selectionHostRef = useRef<HTMLDivElement | null>(null);
  const swapShellRef = useRef<HTMLElement | null>(null);
  const detailHeaderRef = useRef<HTMLDivElement | null>(null);
  const detailTitleRowRef = useRef<HTMLDivElement | null>(null);
  const detailActionsRef = useRef<HTMLDivElement | null>(null);
  const songGridSentinelRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const tabsInnerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const headerCollapseRafRef = useRef<number | null>(null);
  const tabCommitRafRef = useRef<number | null>(null);
  const headerCollapsedRef = useRef(false);
  const tracks = useLibraryStore(s => s.tracks);
  const sort = useLibraryStore(s => s.sort);
  const setSort = useLibraryStore(s => s.setSort);
  const libraryTab = useLibraryStore(s => s.libraryTab);
  const setLibraryTab = useLibraryStore(s => s.setLibraryTab);
  const viewMode = useLibraryStore(s => s.viewMode);
  const setViewMode = useLibraryStore(s => s.setViewMode);
  const playlists = usePlaylistStore(s => s.playlists);
  const createPlaylist = usePlaylistStore(s => s.createPlaylist);
  const deletePlaylist = usePlaylistStore(s => s.deletePlaylist);
  const addTracksToPlaylist = usePlaylistStore(s => s.addTracksToPlaylist);
  const reorderPlaylist = usePlaylistStore(s => s.reorderPlaylist);
  const updatePlaylistArtwork = usePlaylistStore(s => s.updatePlaylistArtwork);
  const setPlaylistCoverFromFile = usePlaylistStore(s => s.setPlaylistCoverFromFile);
  const playTrack = usePlayerStore(s => s.playTrack);
  const addToast = useToastStore(s => s.addToast);
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);

  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [playlistModal, setPlaylistModal] = useState<{ title: string; tracks: Track[] } | null>(null);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [playlistDetailSort, setPlaylistDetailSort] = useState<PlaylistDetailSort>('playlist-order');
  const [playlistDeleteConfirm, setPlaylistDeleteConfirm] = useState<Playlist | null>(null);
  const [renamingPlaylist, setRenamingPlaylist] = useState<Playlist | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [detailHeaderWrapped, setDetailHeaderWrapped] = useState(false);

  const tabs = useMemo<Array<{ id: LibraryTab; label: string }>>(() => [
    { id: 'songs', label: t('songs') },
    { id: 'artists', label: t('artists') },
    { id: 'albums', label: t('albums') },
    { id: 'folders', label: t('folders') },
    { id: 'playlists', label: t('playlists') },
  ], [t]);

  const [swapState, setSwapState] = useState({ enterX: '26px', enterY: '0px', nonce: 0 });

  const triggerSwap = (x: string, y: string) => {
    setSwapState(current => ({
      enterX: x,
      enterY: y,
      nonce: current.nonce + 1,
    }));
  };

  const setTabAnimated = (nextTab: LibraryTab) => {
    if (nextTab === libraryTab) return;
    const prevIdx = TAB_ORDER.indexOf(libraryTab);
    const nextIdx = TAB_ORDER.indexOf(nextTab);
    
    saveCurrentScroll();
    triggerSwap(nextIdx > prevIdx ? '26px' : '-26px', '0px');
    if (tabCommitRafRef.current != null) {
      window.cancelAnimationFrame(tabCommitRafRef.current);
    }
    tabCommitRafRef.current = window.requestAnimationFrame(() => {
      tabCommitRafRef.current = null;
      startTransition(() => {
        setSelectedGroupId(null);
        // Force list view for songs tab, allow grid/list for others.
        if (nextTab === 'songs') {
          setViewMode('list');
        }

        setLibraryTab(nextTab);
      });
    });
  };

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    if (!contentRef.current) return;
    contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleScrollTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollEl = contentRef.current;
    const track = event.currentTarget;
    if (!scrollEl || event.target !== track) return;
    const bounds = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    scrollEl.scrollTo({ top: ratio * (scrollEl.scrollHeight - scrollEl.clientHeight), behavior: 'smooth' });
  };

  const handleScrollThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollEl = contentRef.current;
    const thumb = event.currentTarget;
    const track = thumb.parentElement;
    if (!scrollEl || !track) return;
    event.preventDefault();
    const trackHeight = track.clientHeight;
    const thumbHeight = thumb.offsetHeight;
    const startY = event.clientY;
    const startScrollTop = scrollEl.scrollTop;
    const scrollRange = scrollEl.scrollHeight - scrollEl.clientHeight;
    const thumbRange = Math.max(1, trackHeight - thumbHeight);

    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      scrollEl.scrollTop = startScrollTop + (delta / thumbRange) * scrollRange;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const ScrollButtons = () => (
    <div className="library-scroll-btn-wrap">
      <button
        className={`library-action-btn secondary icon-only library-scroll-btn ${isHeaderCollapsed ? 'pointing-up' : 'pointing-down'}`}
        onClick={isHeaderCollapsed ? scrollToTop : scrollToBottom}
        title={isHeaderCollapsed ? t('backToTop') || "Back to Top" : t('scrollToBottom') || "Scroll to Bottom"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
        </button>
    </div>
  );

  const ScrollIndicators = () => (
    <div
      className={`library-scroll-rail ${showContentScrollbar ? 'visible' : ''}`}
      style={{ '--scroll-thumb-size': `${Math.max(12, scrollThumbRatio * 100)}%`, '--scroll-thumb-position': `${scrollRatio * (1 - scrollThumbRatio) * 100}%` } as React.CSSProperties}
      aria-label="Scroll controls"
    >
      <button type="button" className="library-scroll-arrow" onClick={scrollToTop} disabled={!canScrollUp} title="Scroll to top" aria-label="Scroll to top">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </button>
      <div className="library-scroll-track" onPointerDown={handleScrollTrackPointerDown}>
        <div className="library-scroll-thumb" onPointerDown={handleScrollThumbPointerDown} />
      </div>
      <button type="button" className="library-scroll-arrow" onClick={scrollToBottom} disabled={!canScrollDown} title="Scroll to bottom" aria-label="Scroll to bottom">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
  );

  useLayoutEffect(() => {
    const el = swapShellRef.current;
    if (!el) return;
    // Restart the swap animation without forcing a synchronous layout (offsetWidth can jank on low-end PCs).
    el.classList.remove('swap-run');
    const raf = window.requestAnimationFrame(() => {
      el.classList.add('swap-run');
    });
    return () => window.cancelAnimationFrame(raf);
  }, [swapState.nonce]);

  const [tabIndicator, setTabIndicator] = useState<{ x: number; w: number; visible: boolean }>({
    x: 0,
    w: 0,
    visible: false,
  });

  useEffect(() => {
    const container = tabsRef.current;
    const inner = tabsInnerRef.current;
    const active = tabRefs.current.get(libraryTab);
    if (!container || !inner || !active) return;

    const update = () => {
      setTabIndicator({
        // offsetLeft is stable for flex children, and unaffected by transforms.
        x: Math.round(active.offsetLeft),
        w: Math.round(active.offsetWidth),
        visible: true,
      });
    };

    // One frame for layout settle, then update.
    const raf = requestAnimationFrame(update);

    const ro = new ResizeObserver(() => update());
    ro.observe(inner);
    ro.observe(active);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [libraryTab, language]);

  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const [showContentScrollbar, setShowContentScrollbar] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [scrollThumbRatio, setScrollThumbRatio] = useState(1);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });
  const hasMovedRef = useRef(false);
  const tabsDragResetRafRef = useRef<number | null>(null);
  const viewPerfKeyRef = useRef('');

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    const container = tabsRef.current;
    if (!container) return;
    setIsDraggingTabs(true);
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: e.pageX - container.offsetLeft,
      scrollLeft: container.scrollLeft,
    };
  };

  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingTabs) return;
    const container = tabsRef.current;
    if (!container) return;
    
    const x = e.pageX - container.offsetLeft;
    const walk = (x - dragStartRef.current.x) * 1.5;
    
    if (Math.abs(x - dragStartRef.current.x) > 5) {
      hasMovedRef.current = true;
    }
    
    if (hasMovedRef.current) {
      e.preventDefault();
      container.scrollLeft = dragStartRef.current.scrollLeft - walk;
    }
  };

  const handleTabsMouseUp = () => {
    if (tabsDragResetRafRef.current != null) {
      window.cancelAnimationFrame(tabsDragResetRafRef.current);
    }
    tabsDragResetRafRef.current = window.requestAnimationFrame(() => {
      tabsDragResetRafRef.current = null;
      setIsDraggingTabs(false);
    });
  };

  useEffect(() => () => {
    if (tabsDragResetRafRef.current != null) {
      window.cancelAnimationFrame(tabsDragResetRafRef.current);
      tabsDragResetRafRef.current = null;
    }
    if (tabCommitRafRef.current != null) {
      window.cancelAnimationFrame(tabCommitRafRef.current);
      tabCommitRafRef.current = null;
    }
  }, []);

useEffect(() => {
    const scrollEl = contentRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      if (headerCollapseRafRef.current != null) return;
      headerCollapseRafRef.current = window.requestAnimationFrame(() => {
        headerCollapseRafRef.current = null;
        const collapsed = scrollEl.scrollTop > 60;
        headerCollapsedRef.current = collapsed;
        const scrollableHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
        const nextCanScrollUp = scrollEl.scrollTop > 8;
        const nextCanScrollDown = scrollEl.scrollTop < scrollableHeight - 8;
        const nextThumbRatio = scrollEl.scrollHeight > 0 ? Math.min(1, scrollEl.clientHeight / scrollEl.scrollHeight) : 1;
        const nextScrollRatio = scrollableHeight > 0 ? scrollEl.scrollTop / scrollableHeight : 0;
        setIsHeaderCollapsed(current => current === collapsed ? current : collapsed);
        setCanScrollUp(current => current === nextCanScrollUp ? current : nextCanScrollUp);
        setCanScrollDown(current => current === nextCanScrollDown ? current : nextCanScrollDown);
        setScrollThumbRatio(current => Math.abs(current - nextThumbRatio) < 0.005 ? current : nextThumbRatio);
        setScrollRatio(current => Math.abs(current - nextScrollRatio) < 0.005 ? current : nextScrollRatio);
      });
    };

    handleScroll();
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
      if (headerCollapseRafRef.current != null) {
        window.cancelAnimationFrame(headerCollapseRafRef.current);
        headerCollapseRafRef.current = null;
      }
    };
  }, []);

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = normalizeSearchText(deferredSearch);

  const filteredSongs = useMemo(() => {
    // RAM Optimization: Avoid redundant sorting. The store already provides 'tracks' pre-sorted by 'sort'.
    if (!normalizedSearch) return tracks;
    return rankTracksBySearch(tracks, normalizedSearch, sort);
  }, [tracks, normalizedSearch, sort]);

  const [songGridLimit, setSongGridLimit] = useState(72);

  useEffect(() => {
    if (libraryTab !== 'songs' || viewMode !== 'grid') return;
    setSongGridLimit(Math.min(filteredSongs.length, 72));
  }, [filteredSongs.length, libraryTab, viewMode]);

  useEffect(() => {
    if (libraryTab !== 'songs' || viewMode !== 'grid') return;
    const root = contentRef.current;
    const target = songGridSentinelRef.current;
    if (!root || !target) return;
    if (songGridLimit >= filteredSongs.length) return;

    const io = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setSongGridLimit(current => Math.min(filteredSongs.length, current + 96));
    }, { root, threshold: 0.12 });

    io.observe(target);
    return () => io.disconnect();
  }, [filteredSongs.length, libraryTab, songGridLimit, viewMode]);

  // Build heavy groups only for the active tab (keeps tab switching snappy).
  const artistGroups = useMemo(
    () => (libraryTab === 'artists' ? buildGroupsFast(filteredSongs, 'artist', sort, normalizedSearch) : []),
    [filteredSongs, libraryTab, normalizedSearch, sort]
  );
  const albumGroups = useMemo(
    () => (libraryTab === 'albums' ? buildGroupsFast(filteredSongs, 'album', sort, normalizedSearch) : []),
    [filteredSongs, libraryTab, normalizedSearch, sort]
  );
  const folderGroups = useMemo(
    () => (libraryTab === 'folders' ? buildGroupsFast(filteredSongs, 'folder', sort, normalizedSearch) : []),
    [filteredSongs, libraryTab, normalizedSearch, sort]
  );

  const tracksMap = useMemo(() => new Map(tracks.map(t => [t.id, t])), [tracks]);

  const filteredPlaylists = useMemo(() => {
    if (libraryTab !== 'playlists') return [];

    const frequentTracks = [...tracks]
      .filter(track => track.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount || (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, 50);
    const recentTracks = [...tracks]
      .filter(track => Boolean(track.lastPlayedAt))
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, 50);
    const smartPlaylists = [
      { id: SMART_PLAYLIST_IDS.frequent, name: 'Sering Didengar', tracks: frequentTracks },
      { id: SMART_PLAYLIST_IDS.recent, name: 'Terakhir Diputar', tracks: recentTracks },
    ].map(({ id, name, tracks: smartTracks }) => ({
      playlist: { id, name, trackIds: smartTracks.map(track => track.id), createdAt: 0, updatedAt: 0 } as Playlist,
      tracks: smartTracks,
    }));

    let result = [
      ...smartPlaylists,
      ...playlists.map(playlist => ({
      playlist,
      tracks: playlist.trackIds.map(id => tracksMap.get(id)).filter(Boolean) as Track[],
      })),
    ];

    if (normalizedSearch) {
      result = result.filter(item => getPlaylistSearchScore(item.playlist, item.tracks, normalizedSearch) > 0);
    }

    return result.sort((a, b) =>
      comparePlaylistBySort(a.playlist, b.playlist, a.tracks, b.tracks, sort)
    );
  }, [libraryTab, normalizedSearch, playlists, sort, tracks, tracksMap]);

  const activeGroups = libraryTab === 'artists'
    ? artistGroups
    : libraryTab === 'albums'
      ? albumGroups
      : folderGroups;

  const selectedGroup = useMemo(() => {
    if (libraryTab === 'playlists') return null;
    return activeGroups.find(group => group.id === selectedGroupId) || null;
  }, [activeGroups, libraryTab, selectedGroupId]);

  const selectedPlaylistView = useMemo(() => {
    if (libraryTab !== 'playlists') return null;
    return filteredPlaylists.find(item => item.playlist.id === selectedGroupId) || null;
  }, [filteredPlaylists, libraryTab, selectedGroupId]);

  const selectedPlaylistIsSmart = selectedPlaylistView
    ? selectedPlaylistView.playlist.id === SMART_PLAYLIST_IDS.frequent || selectedPlaylistView.playlist.id === SMART_PLAYLIST_IDS.recent
    : false;

  useLayoutEffect(() => {
    const headerEl = detailHeaderRef.current;
    const titleRowEl = detailTitleRowRef.current;
    const actionsEl = detailActionsRef.current;
    const hasDetail = Boolean(selectedGroup || selectedPlaylistView);

    if (!headerEl || !titleRowEl || !actionsEl || !hasDetail) {
      setDetailHeaderWrapped(false);
      return;
    }

    let rafId: number | null = null;

    const measure = () => {
      rafId = null;
      headerEl.classList.remove('actions-wrapped');
      const titleRowRect = titleRowEl.getBoundingClientRect();
      const actionsRect = actionsEl.getBoundingClientRect();
      const safetyGap = 6;
      const shouldWrap = actionsRect.left <= titleRowRect.right + safetyGap;
      setDetailHeaderWrapped(current => (current === shouldWrap ? current : shouldWrap));
    };

    const requestMeasure = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(measure);
    };

    requestMeasure();
    window.addEventListener('resize', requestMeasure);
    return () => {
      window.removeEventListener('resize', requestMeasure);
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [
    selectedGroup?.id,
    selectedGroup?.title,
    selectedPlaylistView?.playlist.id,
    selectedPlaylistView?.playlist.name,
    playlistDetailSort,
    sort,
    language,
  ]);

  const sortedSelectedGroupTracks = useMemo(
    () => (selectedGroup ? sortTracksForView(selectedGroup.tracks, sort) : []),
    [selectedGroup, sort]
  );
  const sortedSelectedPlaylistTracks = useMemo(
    () => {
      if (!selectedPlaylistView) return [];
      // Fast path: playlist-order is already the trackIds order used to build selectedPlaylistView.tracks.
      if (playlistDetailSort === 'playlist-order') return selectedPlaylistView.tracks;
      return sortTracksForView(selectedPlaylistView.tracks, playlistDetailSort);
    },
    [playlistDetailSort, selectedPlaylistView]
  );

  const pageStats = libraryTab === 'songs'
    ? `${filteredSongs.length} songs`
    : libraryTab === 'playlists'
      ? `${filteredPlaylists.length} playlists`
      : `${activeGroups.length} ${libraryTab}`;
  const isDetailOpen = Boolean(selectedGroup || selectedPlaylistView);

  useLayoutEffect(() => {
    const scrollEl = contentRef.current;
    const contentEl = scrollEl?.querySelector('.library-content-swap') as HTMLElement | null;
    if (!scrollEl) return;

    let frameId: number | null = null;
    const updateOverflowState = () => {
      const overflowAmount = scrollEl.scrollHeight - scrollEl.clientHeight;
      const nextValue = overflowAmount > 12;
      setShowContentScrollbar(current => (current === nextValue ? current : nextValue));
    };

    const scheduleUpdate = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateOverflowState();
      });
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(scrollEl);
    if (contentEl) resizeObserver.observe(contentEl);

    return () => {
      resizeObserver.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [
    libraryTab,
    selectedGroupId,
    filteredSongs.length,
    filteredPlaylists.length,
    activeGroups.length,
    playlistDetailSort,
    sort,
    viewMode,
    songGridLimit,
    isDetailOpen,
  ]);

  useEffect(() => {
    const viewKey = [libraryTab, viewMode, selectedGroupId || 'root'].join(':');
    viewPerfKeyRef.current = viewKey;
    markPerfStart(`library-view:${viewKey}`);
    const raf = window.requestAnimationFrame(() => {
      if (viewPerfKeyRef.current !== viewKey) return;
      const itemCount = libraryTab === 'songs'
        ? filteredSongs.length
        : libraryTab === 'playlists'
          ? filteredPlaylists.length
          : activeGroups.length;
      const meta = { tab: libraryTab, viewMode, detailOpen: isDetailOpen, itemCount };
      markPerfEnd(`library-view:${viewKey}`, meta);
      scheduleMemorySnapshot(`library-view-memory:${viewKey}`, meta);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    activeGroups.length,
    filteredPlaylists.length,
    filteredSongs.length,
    isDetailOpen,
    libraryTab,
    selectedGroupId,
    viewMode,
  ]);

  // Cache scroll positions in-memory to avoid JSON parse/write on every tab click.
  const scrollPositionsRef = useRef<Partial<Record<LibraryTab, number>> | null>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);
  if (scrollPositionsRef.current === null) {
    scrollPositionsRef.current = readLibraryScrollPositions();
  }

  const saveCurrentScroll = () => {
    const cache = scrollPositionsRef.current || (scrollPositionsRef.current = {});
    cache[libraryTab] = contentRef.current?.scrollTop ?? 0;

    if (scrollSaveTimerRef.current) window.clearTimeout(scrollSaveTimerRef.current);
    scrollSaveTimerRef.current = window.setTimeout(() => {
      scrollSaveTimerRef.current = null;
      try {
        window.localStorage.setItem(LIBRARY_SCROLL_STORAGE_KEY, JSON.stringify(cache));
      } catch {
        // ignore write errors
      }
    }, 180);
  };

  useLayoutEffect(() => {
    if (selectedGroupId) return;
    const cache = scrollPositionsRef.current || (scrollPositionsRef.current = readLibraryScrollPositions());
    const nextScrollTop = cache[libraryTab] ?? 0;
    if (contentRef.current) contentRef.current.scrollTop = nextScrollTop;
  }, [libraryTab, selectedGroupId]);

  const openPlaylistPicker = (title: string, items: Track[]) => {
    if (!items.length) {
      addToast(t('noSongsToAdd'));
      return;
    }
    startTransition(() => {
      setPlaylistModal({ title, tracks: items });
    });
  };

  const handleCreatePlaylist = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await createPlaylist(trimmedName);
    addToast(t('playlistCreated'));
    setTabAnimated('playlists');
    setCreatePlaylistOpen(false);
  };

  const handleDeletePlaylist = async (playlist: Playlist) => {
    setPlaylistDeleteConfirm(playlist);
  };

  const handlePlayTracks = (items: Track[]) => {
    if (!items.length) return;
    playTrack(items[0].id, items.map(track => track.id));
  };

  const normalizePath = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  const basename = (value: string) => {
    const parts = value.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || value;
  };

  const uniqueImportedName = (desired: string, used: Set<string>) => {
    const base = desired.trim() || 'Imported Playlist';
    if (!used.has(base.toLowerCase())) {
      used.add(base.toLowerCase());
      return base;
    }
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${base} (${i})`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
    }
    used.add(`${base} (1000)`.toLowerCase());
    return `${base} (1000)`;
  };

  const handleExportPlaylists = async () => {
    try {
      const saveJson = window.api.dialog.saveJson;
      const writeText = window.api.file.writeText;
      if (typeof saveJson !== 'function' || typeof writeText !== 'function') {
        addToast('Export tidak tersedia');
        return;
      }

      const filePath = await saveJson('playlists-export.json');
      if (!filePath) return;

      const trackMap = new Map(tracks.map(track => [track.id, track]));
      const exportData = {
        version: 1,
        exportedAt: Date.now(),
        playlists: playlists.map(pl => ({
          name: pl.name,
          createdAt: pl.createdAt,
          updatedAt: pl.updatedAt,
          tracks: pl.trackIds
            .map(trackId => {
              const t = trackMap.get(trackId);
              if (!t) return null;
              return {
                filePath: t.filePath,
                title: t.title,
                artist: t.artist,
                album: t.album,
                duration: t.duration,
              };
            })
            .filter(Boolean),
        })),
      };

      const ok = await writeText(filePath, JSON.stringify(exportData, null, 2));
      addToast(ok ? 'Export berhasil' : 'Export gagal');
    } catch {
      addToast('Export gagal');
    }
  };

  const handleImportPlaylists = async () => {
    try {
      const openJson = window.api.dialog.openJson;
      const readText = window.api.file.readText;
      if (typeof openJson !== 'function' || typeof readText !== 'function') {
        addToast('Import tidak tersedia');
        return;
      }

      const paths = await openJson();
      const filePath = paths?.[0];
      if (!filePath) return;

      const raw = await readText(filePath);
      if (!raw) {
        addToast('Gagal membaca file import');
        return;
      }

      const parsed = JSON.parse(raw) as any;
      const importedPlaylists: any[] = Array.isArray(parsed?.playlists) ? parsed.playlists : [];
      if (!importedPlaylists.length) {
        addToast('File import kosong');
        return;
      }

      const libraryByPath = new Map(tracks.map(track => [normalizePath(track.filePath), track.id]));
      const libraryByKey = new Map<string, string[]>();
      tracks.forEach(track => {
        const key = `${basename(track.filePath).toLowerCase()}|${Math.round(track.duration || 0)}`;
        const list = libraryByKey.get(key);
        if (list) list.push(track.id);
        else libraryByKey.set(key, [track.id]);
      });

      const usedNames = new Set(playlists.map(pl => pl.name.toLowerCase()));
      let importedCount = 0;

      for (const pl of importedPlaylists) {
        const name = uniqueImportedName(String(pl?.name || 'Imported Playlist'), usedNames);
        const playlistId = await createPlaylist(name);

        const items: any[] = Array.isArray(pl?.tracks) ? pl.tracks : [];
        const orderedTrackIds: string[] = [];
        const seen = new Set<string>();

        for (const item of items) {
          const path = typeof item?.filePath === 'string' ? item.filePath : '';
          let matchId: string | undefined;

          if (path) {
            matchId = libraryByPath.get(normalizePath(path));
          }

          if (!matchId) {
            const fileName = typeof item?.filePath === 'string' ? basename(item.filePath).toLowerCase() : (typeof item?.title === 'string' ? item.title.toLowerCase() : '');
            const dur = Math.round(Number(item?.duration || 0));
            const key = `${fileName}|${dur}`;
            const list = libraryByKey.get(key);
            matchId = list?.[0];
          }

          if (matchId && !seen.has(matchId)) {
            seen.add(matchId);
            orderedTrackIds.push(matchId);
          }
        }

        if (orderedTrackIds.length) {
          await addTracksToPlaylist(playlistId, orderedTrackIds);
        }

        importedCount += 1;
      }

      addToast(`Import selesai: ${importedCount} playlist`);
    } catch {
      addToast('Import gagal');
    }
  };

  const handleChangePlaylistCover = async (playlistId: string) => {
    try {
      const openImages = window.api.dialog.openImages;
      if (typeof openImages !== 'function') {
        addToast('Gagal membuka dialog gambar');
        return;
      }

      const paths = await openImages();
      const imagePath = paths?.[0];
      if (!imagePath) return;

      // Save as a real file under app userData/covers, store its path in SQLite.
      addToast('Cover playlist diperbarui');
    } catch (error) {
      const msg = (error as any)?.message ? String((error as any).message) : '';
      addToast(msg ? `Gagal mengubah cover playlist: ${msg}` : 'Gagal mengubah cover playlist');
    }
  };

  const handleRenamePlaylist = async () => {
    if (!renamingPlaylist || !renameValue.trim()) return;
    await usePlaylistStore.getState().renamePlaylist(renamingPlaylist.id, renameValue.trim());
    addToast(t('playlistRenamed'));
    setRenamingPlaylist(null);
  };

  const renderSongs = () => (
    <div className="library-section library-songs-section">
      {!filteredSongs.length ? (
        <EmptyState text={t('noSongsMatch')} />
      ) : (
        <TrackList tracks={filteredSongs} selectionToolbarHost={selectionHostRef.current} />
      )}
    </div>
  );

  const renderSelectedGroupHeader = () => {
    if (!selectedGroup) return null;
    return (
      <div ref={detailHeaderRef} className={`library-detail-header ${detailHeaderWrapped ? 'actions-wrapped' : ''}`}>
        <div className="library-detail-meta-block">
          <button
            className="library-back-btn icon-only"
            title="Back"
            aria-label="Back"
            onClick={() => {
              triggerSwap('-26px', '0px');
              setSelectedGroupId(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="library-detail-meta">
            <div ref={detailTitleRowRef} className="library-detail-title-row">
              <h2>{selectedGroup.title}</h2>
              <p>{buildLocalizedGroupSubtitleFast(selectedGroup, libraryTab as Exclude<LibraryTab, 'songs' | 'playlists'>, t)}</p>
            </div>
          </div>
        </div>
        <div ref={detailActionsRef} className="library-detail-actions">
          <label className="library-sort-control detail">
            <span>{t('sort')}</span>
            <CustomSelect
              value={sort}
              onChange={val => setSort(val as LibrarySort)}
              options={SORT_OPTIONS.map(opt => ({ id: opt.id, label: t(opt.labelKey) }))}
              triggerClassName="library-action-select"
            />
          </label>
          <ScrollButtons />
          <button className="library-action-btn secondary icon-only" onClick={() => handlePlayTracks(sortedSelectedGroupTracks)} title={t('playAll')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button
            className={`library-action-btn secondary ${libraryTab === 'folders' ? 'folder-add-playlist-btn' : ''}`}
            onClick={() => openPlaylistPicker(selectedGroup.title, sortedSelectedGroupTracks)}
          >
            {t('addToPlaylist')}
          </button>
        </div>
      </div>
    );
  };

  const renderSelectedPlaylistHeader = () => {
    if (!selectedPlaylistView) return null;
    return (
      <div ref={detailHeaderRef} className={`library-detail-header ${detailHeaderWrapped ? 'actions-wrapped' : ''}`}>
        <div className="library-detail-meta-block">
          <button
            className="library-back-btn icon-only"
            title="Back"
            aria-label="Back"
            onClick={() => {
              triggerSwap('-26px', '0px');
              setSelectedGroupId(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="library-detail-meta">
            <div ref={detailTitleRowRef} className="library-detail-title-row">
              <h2>{selectedPlaylistView.playlist.name}</h2>
              <p>
                {selectedPlaylistView.tracks.length} {t('songUnit')} {'\u2022'} {Math.round(selectedPlaylistView.tracks.reduce((sum, track) => sum + track.duration, 0) / 60)} {t('minuteUnit')}
              </p>
            </div>
          </div>
        </div>
        <div ref={detailActionsRef} className="library-detail-actions">
          <label className="library-sort-control detail">
            <span>{t('sort')}</span>
            <CustomSelect
              value={playlistDetailSort}
              onChange={val => setPlaylistDetailSort(val as PlaylistDetailSort)}
              options={PLAYLIST_SORT_OPTIONS.map(opt => ({ id: opt.id, label: t(opt.labelKey) }))}
              triggerClassName="library-action-select"
            />
          </label>
          <ScrollButtons />
          <button className="library-action-btn secondary icon-only" onClick={() => handlePlayTracks(sortedSelectedPlaylistTracks)} title={t('playAll')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          {!selectedPlaylistIsSmart && <CustomSelect
            value=""
            placeholder={t('playlistTools')}
            onChange={(val) => {
              if (val === 'rename') {
                setRenameValue(selectedPlaylistView.playlist.name);
                setRenamingPlaylist(selectedPlaylistView.playlist);
              } else if (val === 'delete') {
                void handleDeletePlaylist(selectedPlaylistView.playlist);
              }
            }}
            options={[
              { id: 'rename', label: t('rename') },
              { id: 'delete', label: t('delete') }
            ]}
            triggerClassName="library-action-select"
          />}
        </div>
      </div>
    );
  };

  const renderGroupBrowser = () => {
    if (selectedGroup) {
      return (
        <div className="library-detail-view">
          <div className="library-detail-list-shell">
            <TrackList tracks={sortedSelectedGroupTracks} selectionToolbarHost={selectionHostRef.current} />
          </div>
        </div>
      );
    }

    if (!activeGroups.length) {
      return <EmptyState text={t('noItemsMatch')} />;
    }

    return (
      <div className={viewMode === 'grid' ? 'library-group-grid' : 'library-group-list'}>
        {activeGroups.map(group => (
          (() => {
            const subtitle = buildLocalizedGroupSubtitleFast(group, libraryTab as Exclude<LibraryTab, 'songs' | 'playlists'>, t);
            const secondaryLine = (libraryTab === 'artists'
              ? (group.tracks.slice(0, 3).map(track => track.title).join(' \u2022 ') || 'No songs')
              : libraryTab === 'albums'
                ? (group.tracks[0]?.artist || 'Unknown Artist')
                : group.folderPath) || '';
            const normalizedSubtitle = subtitle.trim().toLowerCase();
            const normalizedSecondary = secondaryLine.trim().toLowerCase();
            const shouldShowSecondary = Boolean(
              normalizedSecondary &&
              normalizedSecondary !== normalizedSubtitle &&
              !normalizedSubtitle.startsWith(normalizedSecondary)
            );

            return (
              <button
                key={group.id}
                type="button"
                className={viewMode === 'grid' ? 'library-group-card' : 'library-group-row'}
                onClick={() => {
                  saveCurrentScroll();
                  triggerSwap('26px', '0px'); // Slide right-to-left (Enter)
                  setSelectedGroupId(group.id);
                }}
              >
                <div className="library-group-art">
                  {group.cover ? (
                    <img src={group.cover} alt="" loading="lazy" decoding="async" draggable={false} />
                  ) : (
                    <LibraryPlaceholderIcon type={libraryTab === 'folders' ? 'folder' : libraryTab === 'albums' ? 'album' : libraryTab === 'artists' ? 'artist' : 'song'} />
                  )}
                </div>
                <div className="library-group-copy">
                  <strong>{group.title}</strong>
                  <span>{subtitle}</span>
                  {shouldShowSecondary && <em>{secondaryLine}</em>}
                </div>
              </button>
            );
          })()
        ))}
      </div>
    );
  };

  const renderPlaylists = () => {
    if (selectedPlaylistView) {
      return (
        <div className="library-detail-view">
          <div className="library-detail-list-shell">
            <TrackList
              tracks={sortedSelectedPlaylistTracks}
              selectionToolbarHost={selectionHostRef.current}
              defaultPlaylistId={selectedPlaylistIsSmart ? undefined : selectedPlaylistView.playlist.id}
              showGenre={false}
              reorderable={!selectedPlaylistIsSmart && playlistDetailSort === 'playlist-order'}
              onReorder={async trackIds => {
                if (selectedPlaylistIsSmart) return;
                await reorderPlaylist(selectedPlaylistView.playlist.id, trackIds);
              }}
              onRemoveTracks={async trackIds => {
                if (selectedPlaylistIsSmart) return;
                const removeTracksFromPlaylist = usePlaylistStore.getState().removeTracksFromPlaylist;
                await removeTracksFromPlaylist(selectedPlaylistView.playlist.id, trackIds);
                addToast(`${trackIds.length} ${t('removeFromPlaylist')}`);
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="library-section">
        {!filteredPlaylists.length ? (
          <EmptyState text={t('noPlaylistYet')} />
        ) : (
          <div className={viewMode === 'grid' ? 'library-group-grid' : 'library-group-list'}>
            {filteredPlaylists.map(({ playlist, tracks }) => (
              <button
                key={playlist.id}
                type="button"
                className={viewMode === 'grid' ? 'library-group-card' : 'library-group-row'}
                onClick={() => {
                  // Avoid a second render "tick" after entering playlist detail.
                  // We reset to playlist order synchronously so the detail view feels instant.
                  setPlaylistDetailSort('playlist-order');
                  triggerSwap('26px', '0px');
                  setSelectedGroupId(playlist.id);
                }}
              >
                <div className="library-group-art">
                  <LibraryPlaceholderIcon type="playlist" />
                </div>
                <div className="library-group-copy">
                  <strong>{playlist.name}</strong>
                  <span>{tracks.length} {t('songUnit')}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="library-pane">
      <nav className="library-tabs">
        <div
          ref={tabsRef}
          className="tabs-scroll-container"
          onMouseDown={handleTabsMouseDown}
          onMouseMove={handleTabsMouseMove}
          onMouseUp={handleTabsMouseUp}
          onMouseLeave={handleTabsMouseUp}
        >
          <div
            ref={tabsInnerRef}
            className="tabs-inner with-indicator"
            style={{
              ['--tab-indicator-x' as any]: `${tabIndicator.x}px`,
              ['--tab-indicator-w' as any]: `${tabIndicator.w}px`,
              ['--tab-indicator-o' as any]: tabIndicator.visible ? 1 : 0,
            }}
          >
            <div className="tab-active-indicator" aria-hidden="true" />
          {tabs.map(tab => (
            <div
              key={tab.id}
              ref={node => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              className={`tab-item ${libraryTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                if (!hasMovedRef.current) {
                  setTabAnimated(tab.id);
                }
              }}
            >
              {tab.label}
            </div>
          ))}
          </div>
        </div>

        <div className="view-toggles">
          <button
            className={`btn-view ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
        </button>
          <button
            className={`btn-view ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </button>
        </div>
      </nav>

        <div className="search-bar-container" style={{ flexShrink: 0 }}>
        <span className="search-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.5-3.5"></path>
          </svg>
        </span>
        <input
          type="text"
          placeholder={t('searchMusic')}
          value={search}
          onChange={event => {
            const nextValue = event.target.value;
            startTransition(() => setSearch(nextValue));
          }}
          ref={searchInputRef}
          style={{ minWidth: 0 }}
        />
        <button
          type="button"
          className="search-clear-btn"
          aria-label="Clear search"
          title="Clear"
          style={{ visibility: search.trim().length > 0 ? 'visible' : 'hidden', flexShrink: 0 }}
          onClick={() => {
            setSearch('');
            window.requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>
      </div>

      <section
        ref={node => { swapShellRef.current = node; }}
        className={`library-swap-shell swap-run ${isHeaderCollapsed ? 'header-collapsed' : ''}`}
        style={{ ['--swap-enter-x' as any]: swapState.enterX, ['--swap-enter-y' as any]: swapState.enterY }}
      >

        {!isDetailOpen && (
          <div className="library-summary-bar">
            <div className="summary-info">
              <strong>{tabs.find(tab => tab.id === libraryTab)?.label}</strong>
              <span className="summary-text">{pageStats}</span>
            </div>

            <div className="summary-actions">
              <CustomSelect
                value={sort}
                onChange={val => setSort(val as LibrarySort)}
                options={SORT_OPTIONS.map(opt => ({ id: opt.id, label: t(opt.labelKey) }))}
                triggerClassName="library-action-select"
              />

              <ScrollButtons />

              {libraryTab === 'playlists' && (
                <div className="playlist-summary-actions">
                  <CustomSelect
                    value=""
                    placeholder={t('playlistTools')}
                    onChange={(val) => {
                      if (val === 'export') void handleExportPlaylists();
                      else if (val === 'import') void handleImportPlaylists();
                    }}
                    options={[
                      { id: 'export', label: t('export') },
                      { id: 'import', label: t('import') }
                    ]}
                    triggerClassName="library-action-select"
                  />
                  <button className="add-playlist-btn library-action-btn secondary icon-only" title="Add Playlist" onClick={() => startTransition(() => setCreatePlaylistOpen(true))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedGroup && renderSelectedGroupHeader()}
        {selectedPlaylistView && renderSelectedPlaylistHeader()}
        <div className="library-content-frame">
          <div
            ref={contentRef}
            className={`library-content ${showContentScrollbar ? 'has-scrollbar' : 'no-scrollbar'}`}
          >
            <div className="library-content-swap">
              {libraryTab === 'songs' && renderSongs()}
              {libraryTab !== 'songs' && libraryTab !== 'playlists' && renderGroupBrowser()}
              {libraryTab === 'playlists' && renderPlaylists()}
            </div>
          </div>
          <ScrollIndicators />
        </div>
        <div ref={selectionHostRef} className="library-selection-host" />
      </section>



      {renamingPlaylist && createPortal(
        <div className="modal-backdrop" onClick={() => setRenamingPlaylist(null)}>
          <div className="playlist-modal playlist-create-modal" onClick={e => e.stopPropagation()}>
            <div className="playlist-modal-head">
              <div>
                <h3>Rename Playlist</h3>
                <p>{t('newPlaylistName')}</p>
              </div>
              <div className="playlist-modal-header-actions">
                <button
                  type="button"
                  className="library-back-btn playlist-modal-confirm-btn playlist-create-submit-btn"
                  disabled={!renameValue.trim()}
                  onClick={handleRenamePlaylist}
                >
                  {t('rename')}
                </button>
                <button type="button" className="library-back-btn" onClick={() => setRenamingPlaylist(null)}>{t('close')}</button>
              </div>
            </div>

            <div className="playlist-create-inline standalone">
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenamePlaylist();
                  if (e.key === 'Escape') setRenamingPlaylist(null);
                }}
                placeholder={t('newPlaylistName')}
              />
            </div>

            {/* Modal actions removed as per request to move them to header */}
          </div>
        </div>,
        document.body
      )}

      {playlistModal && createPortal(
        <PlaylistPickerModal
          tracks={playlistModal.tracks}
          playlists={playlists}
          onCreatePlaylist={createPlaylist}
          onClose={() => setPlaylistModal(null)}
          onConfirm={async (playlistId, trackIds) => {
            await addTracksToPlaylist(playlistId, trackIds);
            addToast(`${trackIds.length} ${t('addedToPlaylist')}`);
            setPlaylistModal(null);
          }}
        />,
        document.body
      )}

      {createPlaylistOpen && createPortal(
        <CreatePlaylistModal
          onClose={() => setCreatePlaylistOpen(false)}
          onCreate={handleCreatePlaylist}
        />,
        document.body
      )}

      {playlistDeleteConfirm && createPortal(
        <ConfirmDialog
          title={`${t('deletePlaylistPrompt')} "${playlistDeleteConfirm.name}"?`}
          message={t('deletePlaylistWarn')}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          destructive
          onCancel={() => setPlaylistDeleteConfirm(null)}
          onConfirm={async () => {
            const playlist = playlistDeleteConfirm;
            setPlaylistDeleteConfirm(null);
            await deletePlaylist(playlist.id);
            if (selectedGroupId === playlist.id) setSelectedGroupId(null);
            addToast(t('playlistDeleted'));
          }}
        />,
        document.body
      )}
    </main>
  );
}

function CreatePlaylistModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      await onCreate(trimmed);
      setName('');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="playlist-modal playlist-create-modal" onClick={event => event.stopPropagation()}>
        <div className="playlist-modal-head">
          <div>
            <h3>{t('createPlaylist')}</h3>
            <p>{t('newPlaylistName')}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="library-back-btn playlist-create-submit-btn"
              disabled={isCreating || !name.trim()}
              onClick={() => void handleSubmit()}
            >
              {isCreating ? t('create') + '...' : t('create')}
            </button>
            <button type="button" className="library-back-btn" onClick={onClose}>{t('close')}</button>
          </div>
        </div>

        <div className="playlist-create-inline standalone">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void handleSubmit();
            }}
            placeholder={t('newPlaylistName')}
          />
        </div>

        {/* Modal actions removed as per request to move them to header */}
      </div>
    </div>
  );
}

function PlaylistPickerModal({
  tracks,
  playlists,
  onCreatePlaylist,
  onClose,
  onConfirm,
}: {
  tracks: Track[];
  playlists: Playlist[];
  onCreatePlaylist: (name: string) => Promise<string>;
  onClose: () => void;
  onConfirm: (playlistId: string, trackIds: string[]) => Promise<void>;
}) {
  const language = useSettingsStore(s => s.settings.language);
  const t = useMemo(() => createTranslator(language), [language]);
  const trackIds = tracks.map(track => track.id);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>(trackIds);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const selectedPlaylist = playlists.find(playlist => playlist.id === selectedPlaylistId);
  const addableTrackIds = useMemo(() => {
    if (!selectedPlaylist) return selectedTrackIds;
    const existing = new Set(selectedPlaylist.trackIds);
    return selectedTrackIds.filter(trackId => !existing.has(trackId));
  }, [selectedPlaylist, selectedTrackIds]);

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
      const playlistId = await onCreatePlaylist(name);
      setSelectedPlaylistId(playlistId);
      setNewPlaylistName('');
      await onConfirm(playlistId, selectedTrackIds);
      onClose();
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
              disabled={!selectedPlaylistId || !addableTrackIds.length}
              onClick={async () => {
                await onConfirm(selectedPlaylistId, addableTrackIds);
                onClose();
              }}
            >
              {t('add')}
            </button>
          </div>
        </div>

        <div className="playlist-modal-controls-row">
          <div className="playlist-modal-control-group">
            <span className="playlist-modal-input-label">{t('playlist')}</span>
            <CustomSelect
              value={selectedPlaylistId}
              onChange={val => setSelectedPlaylistId(val)}
              options={playlists.map(playlist => ({ id: playlist.id, label: playlist.name }))}
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
              className={`playlist-modal-track picker ${selectedTrackIds.includes(track.id) ? 'selected' : ''}`}
              onClick={() => toggleTrack(track.id)}
              aria-pressed={selectedTrackIds.includes(track.id)}
            >
              <div className="playlist-modal-track-art">
                <LibraryPlaceholderIcon type="song" />
              </div>
              <div className="playlist-modal-track-meta">
                <span>{track.title}</span>
                <small>{track.artist || t('unknownArtist')}</small>
              </div>
              <span className="playlist-modal-track-check" aria-hidden="true">
                {selectedTrackIds.includes(track.id) ? '\u2713' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <LibraryPlaceholderIcon type="folder" />
      </div>
      <p>{text}</p>
    </div>
  );
}

function LibraryPlaceholderIcon({ type }: { type: 'folder' | 'song' | 'playlist' | 'artist' | 'album' }) {
  if (type === 'folder') {
    return (
      <svg className="library-placeholder-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    );
  }

  if (type === 'artist') {
    return (
      <svg className="library-placeholder-icon artist" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    );
  }

  if (type === 'album') {
    return (
      <svg className="library-placeholder-icon album" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 12V2" />
      </svg>
    );
  }

  if (type === 'playlist') {
    return (
      <svg className="library-placeholder-icon playlist" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 11 18-5v12L3 23Z" />
        <path d="M9 18V8.1L21 6v10.3" />
        <circle cx="6" cy="18" r="3" />
      </svg>
    );
  }

  return (
    <svg className="library-placeholder-icon song" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function buildLocalizedGroupSubtitle(
  group: LibraryGroup,
  tab: Exclude<LibraryTab, 'songs' | 'playlists'>,
  t: (key: string) => string
) {
  if (tab === 'artists') {
    return `${group.tracks.length} ${t('songUnit')} \u2022 ${[...new Set(group.tracks.map(track => track.album))].length} ${t('albumUnit')}`;
  }

  if (tab === 'albums') {
    return `${group.tracks[0]?.artist || t('unknownArtist')} \u2022 ${group.tracks.length} ${t('songUnit')} \u2022 ${group.tracks[0]?.year || t('unknownYear')}`;
  }

  return `${group.tracks.length} ${t('songUnit')}`;
}

function buildGroups(tracks: Track[], type: GroupType, sort: LibrarySort, query?: string): LibraryGroup[] {
  const groups = new Map<string, Track[]>();

  tracks.forEach(track => {
    const key = getTrackGroupKey(track, type);
    const current = groups.get(key) || [];
    current.push(track);
    groups.set(key, current);
  });

  const rankedGroups = [...groups.entries()]
    .map(([key, groupedTracks]) => {
      const sortedTracks = [...groupedTracks].sort((a, b) => {
        const trackNumberA = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
        const trackNumberB = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
        if (trackNumberA !== trackNumberB) return trackNumberA - trackNumberB;
        return a.title.localeCompare(b.title);
      });
      const cover = sortedTracks.find(track => track.artworkData)?.artworkData;
      const firstTrack = sortedTracks[0];
      const folderPath = type === 'folder' ? getFolderPath(firstTrack.filePath) : undefined;
      const folderName = folderPath ? folderPath.split(/[\\/]/).pop() || folderPath : undefined;

      const title = type === 'folder' ? (folderName || key) : key;

      return {
        id: key,
        title,
        subtitle: type === 'artist'
          ? `${sortedTracks.length} songs \u2022 ${[...new Set(sortedTracks.map(track => track.album))].length} albums`
          : type === 'album'
            ? `${firstTrack.artist} \u2022 ${sortedTracks.length} songs \u2022 ${firstTrack.year || 'Unknown year'}`
            : `${sortedTracks.length} songs`,
        cover,
        tracks: sortedTracks,
        folderPath,
      };
    });

  const visibleGroups = query
    ? rankedGroups.filter(group => getGroupSearchScore(group, query) > 0)
    : rankedGroups;

  return visibleGroups.sort((a, b) => compareCollectionBySort(a.tracks, b.tracks, a.title, b.title, sort));
}

function rankTracksBySearch(tracks: Track[], query: string, sort: LibrarySort) {
  return tracks
    .map(track => ({
      track,
      score: getTrackSearchScore(track, query),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareTrackBySort(a.track, b.track, sort);
    })
    .map(item => item.track);
}

function getTrackSearchScore(track: Track, query: string) {
  const queryTokens = tokenizeSearch(query);
  if (!queryTokens.length) return 0;

  const title = getNormalizedTrackTitle(track);
  const artist = normalizeSearchText(track.artist);
  const album = normalizeSearchText(track.album);
  const genre = normalizeSearchText(track.genre);
  const path = normalizeSearchText(track.filePath);

  let score = 0;

  score += scoreField(title, query, 150, 110, 70);
  score += scoreField(artist, query, 90, 65, 45);
  score += scoreField(album, query, 80, 58, 40);
  score += scoreField(genre, query, 55, 42, 30);
  score += scoreField(path, query, 35, 28, 20);

  if (queryTokens.every(token => title.includes(token))) score += 45;
  if (queryTokens.some(token => title.startsWith(token))) score += 20;

  return score;
}

function compareTrackBySort(a: Track, b: Track, sort: LibrarySort) {
  if (sort === 'name-asc') return compareText(a.title, b.title);
  if (sort === 'name-desc') return compareText(b.title, a.title);
  if (sort === 'date-added') return (b.addedAt || 0) - (a.addedAt || 0) || compareText(a.title, b.title);
  if (sort === 'last-played') return (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0) || compareText(a.title, b.title);
  if (sort === 'year') return (b.year || 0) - (a.year || 0) || compareText(a.title, b.title);
  return compareText(a.title, b.title);
}

function getPlaylistSearchScore(playlist: Playlist, tracks: Track[], query: string) {
  const playlistName = normalizeSearchText(playlist.name);
  let score = scoreField(playlistName, query, 130, 95, 60);

  tracks.forEach(track => {
    score = Math.max(score, 40 + getTrackSearchScore(track, query) * 0.35);
  });

  return score;
}

function getGroupSearchScore(group: LibraryGroup, query: string) {
  let score = scoreField(normalizeSearchText(group.title), query, 125, 90, 60);

  if (group.folderPath) {
    score += scoreField(normalizeSearchText(group.folderPath), query, 90, 65, 45);
  }

  group.tracks.slice(0, 8).forEach(track => {
    score = Math.max(score, 35 + getTrackSearchScore(track, query) * 0.3);
  });

  return score;
}

function normalizeSearchText(value: string) {
  const cached = normalizedTextCache.get(value);
  if (cached) return cached;
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (normalizedTextCache.size > 5000) normalizedTextCache.clear();
  normalizedTextCache.set(value, normalized);
  return normalized;
}

function tokenizeSearch(value: string) {
  const cached = queryTokenCache.get(value);
  if (cached) return cached;
  const tokens = normalizeSearchText(value).split(/\s+/).filter(Boolean);
  if (queryTokenCache.size > 1000) queryTokenCache.clear();
  queryTokenCache.set(value, tokens);
  return tokens;
}

function getNormalizedTrackTitle(track: Track) {
  const cached = trackTitleCache.get(track);
  if (cached) return cached;
  const normalized = normalizeSearchText(track.title);
  trackTitleCache.set(track, normalized);
  return normalized;
}

function scoreField(fieldValue: string, query: string, exactScore: number, prefixScore: number, includesScore: number) {
  if (!fieldValue || !query) return 0;
  if (fieldValue === query) return exactScore;
  if (fieldValue.startsWith(query)) return prefixScore;
  if (fieldValue.includes(query)) return includesScore;

  const tokens = tokenizeSearch(query);
  if (!tokens.length) return 0;

  let tokenScore = 0;
  let matchedCount = 0;

  for (const token of tokens) {
    if (fieldValue === token) {
      tokenScore += exactScore * 0.7;
      matchedCount += 1;
    } else if (fieldValue.startsWith(token)) {
      tokenScore += prefixScore * 0.55;
      matchedCount += 1;
    } else if (fieldValue.includes(token)) {
      tokenScore += includesScore * 0.45;
      matchedCount += 1;
    }
  }

  if (matchedCount === tokens.length) tokenScore += 18;
  return tokenScore;
}

function getTrackGroupKey(track: Track, type: GroupType) {
  if (type === 'artist') return track.artist || 'Unknown Artist';
  if (type === 'album') return track.album || 'Unknown Album';
  return getFolderPath(track.filePath);
}

function getFolderPath(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  return parts.slice(0, -1).join('\\');
}

function getDetailTypeLabel(tab: LibraryTab) {
  if (tab === 'artists') return 'artistType';
  if (tab === 'albums') return 'albumType';
  if (tab === 'folders') return 'folderType';
  return 'playlistType';
}

function compareCollectionBySort(
  tracksA: Track[],
  tracksB: Track[],
  labelA: string,
  labelB: string,
  sort: LibrarySort
) {
  if (sort === 'name-asc') return compareText(labelA, labelB);
  if (sort === 'name-desc') return compareText(labelB, labelA);
  if (sort === 'date-added') return getLatestAddedAt(tracksB) - getLatestAddedAt(tracksA) || compareText(labelA, labelB);
  if (sort === 'last-played') return getLatestPlayedAt(tracksB) - getLatestPlayedAt(tracksA) || compareText(labelA, labelB);
  if (sort === 'year') return getLatestYear(tracksB) - getLatestYear(tracksA) || compareText(labelA, labelB);
  return compareText(labelA, labelB);
}

function comparePlaylistBySort(
  playlistA: Playlist,
  playlistB: Playlist,
  tracksA: Track[],
  tracksB: Track[],
  sort: LibrarySort
) {
  if (sort === 'name-asc') return compareText(playlistA.name, playlistB.name);
  if (sort === 'name-desc') return compareText(playlistB.name, playlistA.name);
  if (sort === 'date-added') return (playlistB.createdAt || 0) - (playlistA.createdAt || 0) || compareText(playlistA.name, playlistB.name);
  if (sort === 'last-played') return getLatestPlayedAt(tracksB) - getLatestPlayedAt(tracksA) || compareText(playlistA.name, playlistB.name);
  if (sort === 'year') return getLatestYear(tracksB) - getLatestYear(tracksA) || compareText(playlistA.name, playlistB.name);
  return compareText(playlistA.name, playlistB.name);
}

function buildGroupsFast(tracks: Track[], type: GroupType, sort: LibrarySort, query?: string): LibraryGroup[] {
  const groups = new Map<string, Track[]>();

  for (const track of tracks) {
    const key = getTrackGroupKey(track, type);
    const existing = groups.get(key);
    if (existing) existing.push(track);
    else groups.set(key, [track]);
  }

  const rankedGroups = [...groups.entries()].map(([key, groupedTracks]) => {
    const firstTrack = pickRepresentativeTrackFast(groupedTracks);
    const folderPath = type === 'folder' ? getFolderPath(firstTrack.filePath) : undefined;
    const folderName = folderPath ? folderPath.split(/[\\/]/).pop() || folderPath : undefined;

    let latestAddedAt = 0;
    let latestPlayedAt = 0;
    let latestYear = 0;
    let albumCount = 0;
    let year: number | undefined;

    let albumSet: Set<string> | null = null;
    if (type === 'artist') albumSet = new Set<string>();

    for (const t of groupedTracks) {
      const added = t.addedAt || 0;
      if (added > latestAddedAt) latestAddedAt = added;
      const played = t.lastPlayedAt || 0;
      if (played > latestPlayedAt) latestPlayedAt = played;
      const y = t.year || 0;
      if (y > latestYear) latestYear = y;
      if (albumSet && t.album) albumSet.add(t.album);
      if (type === 'album' && year == null && t.year) year = t.year;
    }

    if (albumSet) albumCount = albumSet.size;

    return {
      id: key,
      title: type === 'folder' ? (folderName || key) : key,
      subtitle: '',
      cover: getTrackArtworkSrc(firstTrack),
      tracks: groupedTracks,
      folderPath,
      songCount: groupedTracks.length,
      albumCount: type === 'artist' ? albumCount : undefined,
      artistName: type === 'album' ? (firstTrack.artist || undefined) : undefined,
      year: type === 'album' ? year : undefined,
      latestAddedAt,
      latestPlayedAt,
      latestYear,
    };
  });

  const visibleGroups = query
    ? rankedGroups.filter(group => getGroupSearchScore(group, query) > 0)
    : rankedGroups;

  const sorted = [...visibleGroups];
  sorted.sort((a, b) => {
    if (sort === 'name-asc') return compareText(a.title, b.title);
    if (sort === 'name-desc') return compareText(b.title, a.title);
    if (sort === 'date-added') return (b.latestAddedAt || 0) - (a.latestAddedAt || 0) || compareText(a.title, b.title);
    if (sort === 'last-played') return (b.latestPlayedAt || 0) - (a.latestPlayedAt || 0) || compareText(a.title, b.title);
    if (sort === 'year') return (b.latestYear || 0) - (a.latestYear || 0) || compareText(a.title, b.title);
    return compareText(a.title, b.title);
  });
  return sorted;
}

function pickRepresentativeTrackFast(tracks: Track[]) {
  // Pick a stable representative without sorting the whole group.
  let best = tracks[0];
  for (let i = 1; i < tracks.length; i++) {
    const t = tracks[i];
    const a = best.trackNumber ?? Number.MAX_SAFE_INTEGER;
    const b = t.trackNumber ?? Number.MAX_SAFE_INTEGER;
    if (b < a) {
      best = t;
      continue;
    }
    if (b === a && t.title.localeCompare(best.title) < 0) {
      best = t;
    }
  }
  return best;
}

function buildLocalizedGroupSubtitleFast(
  group: LibraryGroup,
  tab: Exclude<LibraryTab, 'songs' | 'playlists'>,
  t: (key: string) => string
) {
  if (tab === 'artists') {
    const songs = group.songCount ?? group.tracks.length;
    const albums = group.albumCount ?? 0;
    return `${songs} ${t('songUnit')} \u2022 ${albums} ${t('albumUnit')}`;
  }

  if (tab === 'albums') {
    const artist = group.artistName ?? (group.tracks[0]?.artist || t('unknownArtist'));
    const songs = group.songCount ?? group.tracks.length;
    const yearValue = group.year ?? group.tracks[0]?.year;
    const yearText = yearValue ? String(yearValue) : t('unknownYear');
    return `${artist} \u2022 ${songs} ${t('songUnit')} \u2022 ${yearText}`;
  }

  return `${group.songCount ?? group.tracks.length} ${t('songUnit')}`;
}

function sortTracksForView(tracks: Track[], sort: LibrarySort) {
  const result = [...tracks];
  if (sort === 'name-asc') return result.sort((a, b) => compareTrackBySort(a, b, sort));
  if (sort === 'name-desc') return result.sort((a, b) => compareTrackBySort(a, b, sort));
  if (sort === 'date-added') return result.sort((a, b) => compareTrackBySort(a, b, sort));
  if (sort === 'last-played') return result.sort((a, b) => compareTrackBySort(a, b, sort));
  if (sort === 'year') return result.sort((a, b) => compareTrackBySort(a, b, sort));
  return result;
}

function sortPlaylistTracksForView(tracks: Track[], trackIds: string[], sort: PlaylistDetailSort) {
  if (sort !== 'playlist-order') return sortTracksForView(tracks, sort);

  const trackMap = new Map(tracks.map(track => [track.id, track]));
  return trackIds
    .map(trackId => trackMap.get(trackId))
    .filter(Boolean) as Track[];
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function getLatestAddedAt(tracks: Track[]) {
  return tracks.reduce((max, t) => Math.max(max, t.addedAt || 0), 0);
}

function getLatestPlayedAt(tracks: Track[]) {
  return tracks.reduce((max, t) => Math.max(max, t.lastPlayedAt || 0), 0);
}

function getLatestYear(tracks: Track[]) {
  return tracks.reduce((max, t) => Math.max(max, t.year || 0), 0);
}

function formatDurationSafe(duration?: number) {
  if (!duration) return '';
  return formatMinutes(duration);
}

function formatMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

const LIBRARY_SCROLL_STORAGE_KEY = 'music.library.scroll-positions';

function readLibraryScrollPositions(): Partial<Record<LibraryTab, number>> {
  try {
    const raw = window.localStorage.getItem(LIBRARY_SCROLL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<LibraryTab, number>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// (playlist covers are now stored as files, so no base64 / image transcoding helpers needed here)
