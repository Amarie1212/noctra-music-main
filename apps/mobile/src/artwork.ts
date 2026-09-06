import type { Playlist, Track } from '@music/core';

const mediaUrlCache = new Map<string, string>();
const trackArtworkSrcCache = new WeakMap<Track, string | undefined>();
const playlistArtworkSrcCache = new WeakMap<Playlist, string | undefined>();

export function clearArtworkCaches() {
  mediaUrlCache.clear();
}

export function toMediaUrl(filePath: string) {
  const cached = mediaUrlCache.get(filePath);
  if (cached) return cached;

  const normalizedPath = filePath.replace(/\\/g, '/');
  const mediaUrl = `media:///${normalizedPath}`;
  mediaUrlCache.set(filePath, mediaUrl);
  return mediaUrl;
}

export function getTrackArtworkSrc(track: Pick<Track, 'artworkPath' | 'artworkData'>) {
  if ('id' in track) {
    const cached = trackArtworkSrcCache.get(track as Track);
    if (cached !== undefined) return cached;
  }

  const src = track.artworkPath ? toMediaUrl(track.artworkPath) : track.artworkData || undefined;

  if ('id' in track) {
    trackArtworkSrcCache.set(track as Track, src);
  }

  return src;
}

export function getPlaylistArtworkSrc(playlist: Playlist, fallbackTrack?: Pick<Track, 'artworkPath' | 'artworkData'>) {
  const cached = playlistArtworkSrcCache.get(playlist);
  if (cached !== undefined) return cached;

  const src = playlist.coverArt
    ? toMediaUrl(playlist.coverArt)
    : playlist.artworkData || (fallbackTrack ? getTrackArtworkSrc(fallbackTrack) : undefined);

  playlistArtworkSrcCache.set(playlist, src);
  return src;
}
