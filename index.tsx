import React, { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet, Text, View, ActivityIndicator, TextInput, StatusBar,
  Dimensions, PanResponder, ScrollView,
  Animated, Easing, Platform, UIManager, LayoutAnimation,
  RefreshControl, Modal, Alert, TouchableWithoutFeedback, Pressable,
  TouchableOpacity
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Brightness from 'expo-brightness';
import { LinearGradient } from 'expo-linear-gradient';
import YoutubePlayer from 'react-native-youtube-iframe';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: W, height: H } = Dimensions.get('window');

/* ═══════════════════════════════════════════════════════════
   CONFIGURACIÓN
═══════════════════════════════════════════════════════════ */
const TMDB_API_KEY           = 'cd567a4b1c99d7e5acebd57afda5a196';
const GOOGLE_DRIVE_API_KEY   = 'AIzaSyAsQYU7JBhGalFd8woneHClsm5FJdOTHF4';
const DRIVE_FOLDER_PELICULAS = '10G68TcC3ywAUfyXz82QntyCRwb-2yKq2';
const DRIVE_FOLDER_SERIES    = '1J4v2HMFaKy2ZKg20QU7kmH7k7rRV13Zh';
const M3U_URL                = 'https://naphdev.online/list.m3u';
const EMBED_BASE             = 'https://embed.saohgdasregions.fun/embed2';
const YOUTUBE_API_KEY        = 'AIzaSyBicZOubtQF_iO7-17ZOyWgXiXvJl5Iuu0';

const ACCENT_COLORS: Record<string, string> = {
  red:    '#E50914',
  violet: '#6C63FF',
  blue:   '#3B82F6',
  green:  '#10B981',
};

/* ═══════════════════════════════════════════════════════════
   DESIGN TOKENS (Premium Ultra Elegante)
═══════════════════════════════════════════════════════════ */
const T = {
  color: {
    bg:              '#030305',
    surface:         '#08080A',
    surfaceElevated: '#111115',
    surfaceHigh:     '#1C1C22',
    border:          'rgba(255,255,255,0.04)',
    borderAccent:    'rgba(255,255,255,0.08)',
    primary:         '#E50914',
    primaryDim:      'rgba(229,9,20,0.15)',
    gold:            '#F5A623',
    textPrimary:     '#FFFFFF',
    textSecondary:   'rgba(255,255,255,0.78)',
    textMuted:       'rgba(255,255,255,0.40)',
    success:         '#2ECC71',
    live:            '#FF2D55',
    glassWhite:      'rgba(255,255,255,0.05)',
    glassBorder:     'rgba(255,255,255,0.08)',
    glassBackground: 'rgba(14,14,18,0.88)',
    shadow:          'rgba(0,0,0,0.7)',
  },
  font: {
    xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 26, xxl: 32, hero: 42,
    regular: '400' as const, medium: '500' as const, semibold: '600' as const,
    bold: '700' as const, extrabold: '800' as const, black: '900' as const,
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999 },
};

const IS_TV     = Platform.isTV || W >= 960;
const IS_TABLET = !IS_TV && W >= 600;
const IS_SMALL  = !IS_TV && !IS_TABLET && W <= 480;
const SCALE     = IS_TV ? 1.6 : IS_TABLET ? 1.25 : IS_SMALL ? 0.88 : 1;
const s         = (n: number) => Math.round(n * SCALE);

const LIVE_PLAYER_H = IS_TV ? Math.round(W * 0.42) : IS_TABLET ? 280 : IS_SMALL ? 210 : 250;
const MEDIA_COLS    = IS_TV ? 4 : IS_TABLET ? 3 : 2;
const CARD_W = (W - T.space.lg * 2 - T.space.md * (MEDIA_COLS - 1)) / MEDIA_COLS;
const CARD_H = CARD_W * 1.5 + 80;

/* ═══════════════════════════════════════════════════════════
   TIPOS
═══════════════════════════════════════════════════════════ */
interface Canal {
  id: string; numero: number; name: string; url: string;
  logo: string; category: string; nowPlaying?: string;
  needsWebView?: boolean; embedSlug?: string;
}
interface MediaItem {
  id: string; title: string; poster: string; backdrop?: string; genre?: string;
  year?: number; rating?: string; seasons?: number; overview?: string;
  type?: 'movie' | 'tv'; custom?: boolean; streamUrl?: string; driveFileId?: string;
  genreIds?: number[];
  trailerKey?: string;
}
interface PlexShow {
  id: string; title: string; poster: string; backdrop?: string;
  year?: number; rating?: string; overview?: string; seasons: PlexSeason[];
  genreIds?: number[];
}
interface PlexSeason { number: number; label: string; episodes: PlexEpisode[]; }
interface PlexEpisode {
  id: string; code: string; title: string; streamUrl: string;
  driveFileId: string; fileName: string; poster?: string;
  overview?: string; airDate?: string; runtime?: number;
}
interface ContinueWatchingItem {
  id: string; title: string; poster: string; progress: number; duration: number;
  type: 'movie' | 'episode'; streamUrl: string; showId?: string;
  showName?: string; episodeCode?: string; season?: number; episode?: number;
  profileId?: string; watchedAt?: number;
}
interface DownloadItem {
  id: string; title: string; poster: string; streamUrl: string;
  localUri?: string; progress: number; status: 'downloading' | 'completed' | 'error'; fileSize?: number;
}
interface Profile {
  id: string; name: string; avatar?: string; accentColor: string;
  watchlistMovies: string[]; watchlistSeries: string[]; continueWatching: ContinueWatchingItem[];
}
interface SearchResult {
  id: string; title: string; poster?: string; type: 'channel' | 'movie' | 'tv' | 'tmdb_movie' | 'tmdb_tv'; source?: any;
}

/* ═══════════════════════════════════════════════════════════
   UTILIDADES
═══════════════════════════════════════════════════════════ */
const PROXY_URL = 'https://br.naphdev.dpdns.org/stream';
function driveStreamUrl(fileId: string): string { return `${PROXY_URL}/${fileId}`; }
function extractEmbedSlug(url: string): string | null {
  const m1 = url.match(/[?&]stream=([^&]+)/i); if (m1) return m1[1];
  const m2 = url.match(/[?&]canal=([^&]+)/i); if (m2) return m2[1];
  return null;
}
function convertirMpdAHls(url: string): string {
  const regex = /^(https?:\/\/router\.cdn\.rcs\.net\.ar\/mnp\/([^/]+))\/output\.mpd$/i;
  const m = url.match(regex); if (m) return `${m[1]}_hls/playlist.m3u8`; return url;
}
// SOLO para URLs de reproducción de video (MP4, etc), NO aplicamos cacheBust para evitar romper el streaming.
function cacheBustStream(url: string): string {
  if (url.includes('/stream/')) return url; // Los videos de Drive NO deben tener cacheBust o se rompe el rango
  return `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
}
function formatTime(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
async function lockLandscape() { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch (_) {} }
async function lockPortrait() { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (_) {} }

/* ═══════════════════════════════════════════════════════════
   CANALES MANUALES
═══════════════════════════════════════════════════════════ */
const CANALES_MANUALES: Canal[] = [
  { id: 'man-1',  numero: 1,  name: 'DSports',        embedSlug: 'directvsports',    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/05/DirecTV_Sports_logo.svg', category: 'Deportes', nowPlaying: 'Fútbol: Copa Libertadores', url: '' },
  { id: 'man-2',  numero: 2,  name: 'DSports 2',      embedSlug: 'directvsports2',   logo: '', category: 'Deportes', nowPlaying: 'Tenis: Wimbledon',       url: '' },
  { id: 'man-3',  numero: 3,  name: 'DSports +',      embedSlug: 'directvsportsplus', logo: '', category: 'Deportes', nowPlaying: 'Motociclismo: MotoGP',   url: '' },
  { id: 'man-4',  numero: 4,  name: 'TyC Sports',     embedSlug: 'tycsports',        logo: '', category: 'Deportes', nowPlaying: 'Noticias Deportivas',    url: '' },
  { id: 'man-5',  numero: 5,  name: 'TNT Sports',     embedSlug: 'tntsports',        logo: '', category: 'Deportes', nowPlaying: 'Fútbol Argentino',       url: '' },
  { id: 'man-6',  numero: 6,  name: 'ESPN Premium',   embedSlug: 'espnpremium',      logo: '', category: 'Deportes', nowPlaying: 'Fútbol Europeo',         url: '' },
  { id: 'man-7',  numero: 7,  name: 'ESPN 1',         embedSlug: 'espn',             logo: '', category: 'Deportes', nowPlaying: 'Baloncesto NBA',         url: '' },
  { id: 'man-8',  numero: 8,  name: 'ESPN 2',         embedSlug: 'espn2',            logo: '', category: 'Deportes', nowPlaying: 'Béisbol MLB',            url: '' },
  { id: 'man-9',  numero: 9,  name: 'ESPN 3',         embedSlug: 'espn3',            logo: '', category: 'Deportes', nowPlaying: 'Análisis Deportivo',     url: '' },
  { id: 'man-10', numero: 10, name: 'ESPN 4',         embedSlug: 'espn4',            logo: '', category: 'Deportes', nowPlaying: 'Rugby',                  url: '' },
  { id: 'man-11', numero: 11, name: 'ESPN 5',         embedSlug: 'espn5',            logo: '', category: 'Deportes', nowPlaying: 'Hockey',                 url: '' },
  { id: 'man-12', numero: 12, name: 'Claro Sports',   embedSlug: 'clarosports',      logo: '', category: 'Deportes', nowPlaying: 'Deportes en Vivo',       url: '' },
  { id: 'man-13', numero: 13, name: 'TNT Series',     embedSlug: 'tntseries',        logo: '', category: 'Entretenimiento', nowPlaying: 'Series 24/7',  url: '' },
  { id: 'man-14', numero: 14, name: 'Disney Channel', embedSlug: 'disney',           logo: '', category: 'Entretenimiento', nowPlaying: 'Disney 24/7',  url: '' },
  { id: 'man-15', numero: 15, name: 'TNT',            embedSlug: 'tnt',              logo: '', category: 'Entretenimiento', nowPlaying: 'TNT 24/7',     url: '' },
  { id: 'man-16', numero: 16, name: 'Warner Channel', embedSlug: 'warner',           logo: '', category: 'Entretenimiento', nowPlaying: 'Warner 24/7',  url: '' },
  { id: 'man-17', numero: 17, name: 'FX',             embedSlug: 'fx',               logo: '', category: 'Entretenimiento', nowPlaying: 'FX 24/7',      url: '' },
  { id: 'man-18', numero: 18, name: 'Comedy Central', embedSlug: 'comedy',           logo: '', category: 'Entretenimiento', nowPlaying: 'Comedy 24/7',  url: '' },
  { id: 'man-19', numero: 19, name: 'Golden',         embedSlug: 'golden',           logo: '', category: 'Entretenimiento', nowPlaying: 'Golden',        url: '' },
  { id: 'man-20', numero: 20, name: 'Golden Edge',    embedSlug: 'goldenedge',       logo: '', category: 'Entretenimiento', nowPlaying: 'Golden',        url: '' },
].map(c => ({ ...c, needsWebView: true, url: c.embedSlug ? `${EMBED_BASE}/${c.embedSlug}.html` : c.url }));

/* ═══════════════════════════════════════════════════════════
   FALLBACKS TMDB (DEFINIDOS ANTES DE SER USADOS)
═══════════════════════════════════════════════════════════ */
const MOVIES_FALLBACK: MediaItem[] = [
  { id: 'mov1', title: 'Inception',    poster: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg', genre: 'Ciencia ficción', year: 2010, rating: '8.8', type: 'movie' },
  { id: 'mov2', title: 'Interstellar', poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', genre: 'Ciencia ficción', year: 2014, rating: '8.6', type: 'movie' },
];
const SERIES_FALLBACK: MediaItem[] = [
  { id: 'ser1', title: 'Breaking Bad',    poster: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', genre: 'Drama',          seasons: 5, rating: '9.5', type: 'tv' },
  { id: 'ser2', title: 'Stranger Things', poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', genre: 'Ciencia ficción', seasons: 4, rating: '8.7', type: 'tv' },
];

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function esUrlManifiesto(v: string) { return /(\.m3u8|\.mpd)(\?|#|$)/i.test(v); }
function extraerManifiesto(txt: string): string | null {
  const m = (txt || '').trim().match(/https?:\/\/[^\s"'<>]+?\.(?:m3u8|mpd)(?:\?[^\s"'<>]*)?/i);
  return m ? m[0] : null;
}
function cacheBust(url: string) { return `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`; }
function formatTime(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
async function lockLandscape() { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch (_) {} }
async function lockPortrait() { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (_) {} }

/* ═══════════════════════════════════════════════════════════
   GESTOR DE PERFILES
═══════════════════════════════════════════════════════════ */
const DEFAULT_PROFILE: Profile = {
  id: 'default', name: 'Usuario', accentColor: 'red',
  watchlistMovies: [], watchlistSeries: [], continueWatching: [],
};
async function loadProfiles(): Promise<Profile[]> {
  const raw = await AsyncStorage.getItem('userProfiles');
  return raw ? JSON.parse(raw) : [DEFAULT_PROFILE];
}
async function saveProfiles(profiles: Profile[]) {
  await AsyncStorage.setItem('userProfiles', JSON.stringify(profiles));
}
const useProfiles = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  useEffect(() => {
    loadProfiles().then(p => { if (p.length > 0) { setProfiles(p); setActiveProfileId(p[0].id); } });
  }, []);
  const updateProfile = useCallback(async (updated: Profile) => {
    const newProfiles = profiles.map(p => p.id === updated.id ? updated : p);
    setProfiles(newProfiles); await saveProfiles(newProfiles);
  }, [profiles]);
  const addProfile = useCallback(async (name: string, accentColor: string) => {
    const newProfile: Profile = {
      id: Date.now().toString(), name, accentColor,
      avatar: undefined, watchlistMovies: [], watchlistSeries: [], continueWatching: [],
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated); await saveProfiles(updated);
  }, [profiles]);
  const deleteProfile = useCallback(async (id: string) => {
    if (profiles.length <= 1) return;
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    if (activeProfileId === id) setActiveProfileId(updated[0].id);
    await saveProfiles(updated);
  }, [profiles, activeProfileId]);
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || DEFAULT_PROFILE;
  return { profiles, activeProfile, activeProfileId, setActiveProfileId, updateProfile, addProfile, deleteProfile };
};

/* ═══════════════════════════════════════════════════════════
   PLEX — PARSE FILENAME
═══════════════════════════════════════════════════════════ */
function esTituloEpisodioValido(t: string): boolean { if (!t || t.length < 2) return false; const letras = t.replace(/[0-9\s]/g, ''); return letras.length >= 2; }
function parsePlexEpisode(nombre: string): { showName: string; season: number; episode: number; episodeTitle?: string } | null {
  const patterns = [
    /^(.*?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,3})[.\s_-]*(.*?)\.(?:mp4|mkv|avi|mov|webm|m4v)$/i,
    /^(.*?)[.\s_-]+(\d{1,2})x(\d{1,3})[.\s_-]*(.*?)\.(?:mp4|mkv|avi|mov|webm|m4v)$/i,
    /^(.*?)[.\s_-]+[Tt](\d{1,2})[Ee](\d{1,3})[.\s_-]*(.*?)\.(?:mp4|mkv|avi|mov|webm|m4v)$/i,
  ];
  for (const pat of patterns) {
    const m = nombre.match(pat);
    if (m) {
      const showRaw = m[1].replace(/[._]/g, ' ').trim();
      const sn = parseInt(m[2], 10); const ep = parseInt(m[3], 10);
      let rawTitle = (m[4] || '').replace(/[._]/g, ' ').trim()
        .replace(/\b(1080p|720p|2160p|4k|hdr|web[-]?dl|bluray|brrip|hdtv|x264|x265|hevc|aac|dual|latino|castellano|subtitulado|proper|repack|internal|dubbed|subbed|español|ingles|cap(itulo)?s?|temporada)\b/gi, '')
        .replace(/\bS\d{1,2}(E\d{1,2})?\b/gi, '').replace(/\b\d{3,4}p\b/gi, '').replace(/\s{2,}/g, ' ').trim();
      const epTitle = esTituloEpisodioValido(rawTitle) ? rawTitle : undefined;
      return { showName: showRaw, season: sn, episode: ep, episodeTitle: epTitle };
    }
  }
  return null;
}
function limpiarNombreArchivo(nombre: string): { titulo: string; anio?: number } {
  let n = nombre.replace(/\.(mp4|mkv|avi|mov|webm|m4v)$/i, '');
  const matchAnio = n.match(/\b(19|20)\d{2}\b/); const anio = matchAnio ? parseInt(matchAnio[0], 10) : undefined;
  n = n.replace(/[._]/g, ' ').replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(1080p|720p|2160p|4k|hdr|web[-]?dl|bluray|brrip|hdtv|x264|x265|hevc|aac|dual|latino|castellano|subtitulado|temporada|cap(itulo)?s?|r480p|s\s?\d{1,2}|hd|full\s?hd|mic?rohd|proper|repack|internal|dubbed|subbed|español|ingles)\b/gi, ' ')
    .replace(/\bS\d{1,2}(E\d{1,2})?\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  return { titulo: n, anio };
}

/* ═══════════════════════════════════════════════════════════
   GOOGLE DRIVE HELPERS
═══════════════════════════════════════════════════════════ */
const tmdbSessionCache = new Map<string, any>();
async function buscarMetadataTMDB(titulo: string, anio: number | undefined, tipo: 'movie' | 'tv'): Promise<any | null> {
  const cacheKey = `${tipo}:${titulo}:${anio || ''}`;
  if (tmdbSessionCache.has(cacheKey)) return tmdbSessionCache.get(cacheKey);
  try {
    const ep = tipo === 'movie' ? 'search/movie' : 'search/tv';
    const yr = anio ? `&year=${anio}` : '';
    const res = await fetch(`https://api.themoviedb.org/3/${ep}?api_key=${TMDB_API_KEY}&language=es&query=${encodeURIComponent(titulo)}${yr}`);
    const d = await res.json();
    const result = d.results?.length ? d.results[0] : null;
    tmdbSessionCache.set(cacheKey, result); return result;
  } catch { return null; }
}
async function buscarDetalleTemporada(tmdbId: string, season: number): Promise<any | null> {
  const cacheKey = `season:${tmdbId}:${season}`;
  if (tmdbSessionCache.has(cacheKey)) return tmdbSessionCache.get(cacheKey);
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}&language=es`);
    const data = await res.json(); tmdbSessionCache.set(cacheKey, data); return data;
  } catch { return null; }
}
async function listarArchivosDrive(folderId: string): Promise<any[]> {
  let archivos: any[] = [], pageToken: string | undefined;
  do {
    const tp = pageToken ? `&pageToken=${pageToken}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&pageSize=1000&key=${GOOGLE_DRIVE_API_KEY}${tp}`;
    const res = await fetch(url); const d = await res.json();
    if (d.files) archivos = archivos.concat(d.files); pageToken = d.nextPageToken;
  } while (pageToken);
  return archivos.filter(f => f.mimeType?.startsWith('video/'));
}
async function listarSubcarpetasDrive(folderId: string): Promise<any[]> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&key=${GOOGLE_DRIVE_API_KEY}`;
    const res = await fetch(url); const d = await res.json(); return d.files || [];
  } catch { return []; }
}
async function construirItemDrive(archivo: any, tipo: 'movie' | 'tv'): Promise<MediaItem> {
  const { titulo, anio } = limpiarNombreArchivo(archivo.name);
  const streamUrl = driveStreamUrl(archivo.id);
  const meta = await buscarMetadataTMDB(titulo, anio, tipo);
  if (meta) {
    return {
      id: `drive-${archivo.id}`, title: tipo === 'movie' ? meta.title : meta.name,
      poster: meta.poster_path ? `https://image.tmdb.org/t/p/w500${meta.poster_path}` : 'https://via.placeholder.com/500x750.png?text=Sin+Imagen',
      backdrop: meta.backdrop_path ? `https://image.tmdb.org/t/p/w780${meta.backdrop_path}` : undefined,
      year: tipo === 'movie' ? (meta.release_date ? new Date(meta.release_date).getFullYear() : anio) : (meta.first_air_date ? new Date(meta.first_air_date).getFullYear() : anio),
      rating: meta.vote_average ? meta.vote_average.toFixed(1) : '0.0',
      seasons: tipo === 'tv' ? meta.number_of_seasons : undefined,
      overview: meta.overview || 'Sin descripción disponible.',
      type: tipo, streamUrl, driveFileId: archivo.id, genreIds: meta.genre_ids || [],
    };
  }
  return {
    id: `drive-${archivo.id}`, title: titulo || archivo.name,
    poster: 'https://via.placeholder.com/500x750.png?text=Sin+Imagen',
    year: anio, rating: '0.0', overview: 'Sin descripción disponible.',
    type: tipo, streamUrl, custom: true, driveFileId: archivo.id, genreIds: [],
  };
}
async function cargarCarpetaDrive(folderId: string, tipo: 'movie' | 'tv', cacheKey: string): Promise<MediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey); const cache = raw ? JSON.parse(raw) : {};
    const archivos = await listarArchivosDrive(folderId); const items: MediaItem[] = [];
    for (const a of archivos) {
      const ce = cache[a.id];
      if (ce && ce.modifiedTime === a.modifiedTime) { items.push(ce.item); }
      else { const item = await construirItemDrive(a, tipo); cache[a.id] = { modifiedTime: a.modifiedTime, item }; items.push(item); }
    }
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cache)); return items;
  } catch (e) { console.warn('Drive error:', e); return []; }
}
async function cargarSeriesPlex(folderId: string, cacheKey: string): Promise<PlexShow[]> {
  try {
    const rawCache = await AsyncStorage.getItem(cacheKey + '_plex'); const cache = rawCache ? JSON.parse(rawCache) : {};
    const showsMap: Record<string, { files: { archivo: any; season: number; episode: number; episodeTitle?: string }[]; tmdbMeta?: any; }> = {};
    const addFileToShow = (archivo: any, nombreCarpeta: string, season: number, episode: number, episodeTitle?: string) => {
      const parsed = parsePlexEpisode(archivo.name); const showNameFromFile = parsed?.showName || '';
      const finalShowName = showNameFromFile.length > 1 ? showNameFromFile : nombreCarpeta;
      const key = finalShowName.toLowerCase().replace(/\s+/g, '_');
      if (!showsMap[key]) showsMap[key] = { files: [] };
      const rawTitle = parsed?.episodeTitle || episodeTitle;
      const finalTitle = (rawTitle && esTituloEpisodioValido(rawTitle)) ? rawTitle : undefined;
      showsMap[key].files.push({ archivo, season: parsed?.season || season, episode: parsed?.episode || episode, episodeTitle: finalTitle });
    };
    const archivosRaiz = await listarArchivosDrive(folderId);
    for (const a of archivosRaiz) { const parsed = parsePlexEpisode(a.name); if (parsed && parsed.showName) addFileToShow(a, '', parsed.season, parsed.episode, parsed.episodeTitle); }
    const subcarpetas = await listarSubcarpetasDrive(folderId);
    for (const carpeta of subcarpetas) {
      const nombreCarpeta = carpeta.name.replace(/[._]/g, ' ').trim();
      const archivosShow = await listarArchivosDrive(carpeta.id); let epIdx = 1;
      for (const a of archivosShow) { const parsed = parsePlexEpisode(a.name); if (parsed) addFileToShow(a, nombreCarpeta, parsed.season, parsed.episode, parsed.episodeTitle); else addFileToShow(a, nombreCarpeta, 1, epIdx++); }
      const temporadas = await listarSubcarpetasDrive(carpeta.id);
      for (const temp of temporadas) {
        const seasonMatch = temp.name.match(/(\d+)/); const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
        const archivosTemp = await listarArchivosDrive(temp.id); let epIdxTemp = 1;
        for (const a of archivosTemp) { const parsed = parsePlexEpisode(a.name); if (parsed) addFileToShow(a, nombreCarpeta, parsed.season || seasonNum, parsed.episode, parsed.episodeTitle); else addFileToShow(a, nombreCarpeta, seasonNum, epIdxTemp++); }
      }
    }
    const shows: PlexShow[] = [];
    for (const [_key, data] of Object.entries(showsMap)) {
      if (!data.files.length) continue;
      const firstFile = data.files[0]; const parsed0 = parsePlexEpisode(firstFile.archivo.name);
      const showName = parsed0?.showName || limpiarNombreArchivo(firstFile.archivo.name).titulo || firstFile.archivo.name;
      let meta: any = cache[showName] || await buscarMetadataTMDB(showName, undefined, 'tv'); if (meta) cache[showName] = meta;
      const seasonMap: Record<number, PlexEpisode[]> = {};
      for (const f of data.files) {
        if (!seasonMap[f.season]) seasonMap[f.season] = [];
        const streamUrl = driveStreamUrl(f.archivo.id);
        const epCode = `${f.season}x${String(f.episode).padStart(2, '0')}`;
        seasonMap[f.season].push({ id: `ep-${f.archivo.id}`, code: epCode, title: f.episodeTitle || `Episodio ${f.episode}`, streamUrl, driveFileId: f.archivo.id, fileName: f.archivo.name });
      }
      if (meta?.id) {
        for (const [snStr, eps] of Object.entries(seasonMap)) {
          const snNum = parseInt(snStr, 10); const seasonData = await buscarDetalleTemporada(String(meta.id), snNum);
          if (seasonData?.episodes) {
            const epMap: Record<number, any> = {}; seasonData.episodes.forEach((e: any) => { epMap[e.episode_number] = e; });
            eps.forEach(ep => {
              const epNum = parseInt(ep.code.split('x')[1], 10); const tmdbEp = epMap[epNum];
              if (tmdbEp) { ep.title = tmdbEp.name || ep.title; ep.overview = tmdbEp.overview; ep.airDate = tmdbEp.air_date; ep.runtime = tmdbEp.runtime; ep.poster = tmdbEp.still_path ? `https://image.tmdb.org/t/p/w300${tmdbEp.still_path}` : undefined; }
            });
          }
        }
      }
      const seasons: PlexSeason[] = Object.entries(seasonMap).sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([n, eps]) => ({ number: parseInt(n, 10), label: `Temporada ${n}`, episodes: eps.sort((a, b) => parseInt(a.code.split('x')[1], 10) - parseInt(b.code.split('x')[1], 10)) }));
      shows.push({ id: `show-${_key}`, title: meta ? (meta.name || meta.title || showName) : showName, poster: meta?.poster_path ? `https://image.tmdb.org/t/p/w500${meta.poster_path}` : 'https://via.placeholder.com/500x750.png?text=Serie', backdrop: meta?.backdrop_path ? `https://image.tmdb.org/t/p/w780${meta.backdrop_path}` : undefined, year: meta?.first_air_date ? new Date(meta.first_air_date).getFullYear() : undefined, rating: meta?.vote_average ? meta.vote_average.toFixed(1) : undefined, overview: meta?.overview, seasons, genreIds: meta?.genre_ids || [] });
    }
    await AsyncStorage.setItem(cacheKey + '_plex', JSON.stringify(cache)); return shows.sort((a, b) => a.title.localeCompare(b.title));
  } catch (e) { console.warn('Plex error:', e); return []; }
}

/* ═══════════════════════════════════════════════════════════
   DESCARGAS
═══════════════════════════════════════════════════════════ */
async function startDownload(media: MediaItem, onProgress: (p: number) => void): Promise<string> {
  const fileName = `${media.id}.mp4`; const fileUri = FileSystem.documentDirectory + fileName;
  const downloadResumable = FileSystem.createDownloadResumable(media.streamUrl!, fileUri, {}, (downloadProgress) => {
    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite; onProgress(progress);
  });
  const result = await downloadResumable.downloadAsync();
  if (result && result.uri) { const { status } = await MediaLibrary.requestPermissionsAsync(); if (status === 'granted') { await MediaLibrary.createAssetAsync(result.uri); } return result.uri; }
  throw new Error('Download failed');
}

/* ═══════════════════════════════════════════════════════════
   CONTINUAR VIENDO (por perfil) - Aumentado a 100 items para Historial Completo
═══════════════════════════════════════════════════════════ */
async function saveContinueWatching(item: ContinueWatchingItem, profileId: string) {
  const raw = await AsyncStorage.getItem('continueWatching_' + profileId);
  const list: ContinueWatchingItem[] = raw ? JSON.parse(raw) : [];
  const newList = [item, ...list.filter(i => i.id !== item.id)].slice(0, 100); // Guardamos hasta 100 items para historial completo
  await AsyncStorage.setItem('continueWatching_' + profileId, JSON.stringify(newList));
}
async function getContinueWatching(profileId: string): Promise<ContinueWatchingItem[]> {
  const raw = await AsyncStorage.getItem('continueWatching_' + profileId);
  return raw ? JSON.parse(raw) : [];
}

/* ═══════════════════════════════════════════════════════════
   REPRODUCTOR NATIVO (PiP, volumen, togglePlay)
═══════════════════════════════════════════════════════════ */
export type ReproductorNativoHandle = {
  seekBy: (secs: number) => void;
  setVolume: (vol: number) => void;
  togglePlay: () => void;
};

const ReproductorNativo = memo(forwardRef<ReproductorNativoHandle, {
  url: string; contentFit: 'contain' | 'fill'; isLive?: boolean;
  onError?: () => void; onStall?: () => void; showSeekControls?: boolean;
  onProgressUpdate?: (current: number, duration: number) => void;
  itemInfo?: ContinueWatchingItem;
  onPlayStateChange?: (isPlaying: boolean) => void;
}>(({ url, contentFit, isLive = false, onError, onStall, showSeekControls = false, onProgressUpdate, itemInfo, onPlayStateChange }, ref) => {
  useKeepAwake();
  const mounted = useRef(true);
  // IMPORTANTE: NO aplicamos cacheBust a archivos de video grandes o rompe el streaming.
  const [activeUrl, setActiveUrl] = useState(url);
  const player = useVideoPlayer(activeUrl, p => {
    p.loop = false;
    if (isLive) try { (p as any).seekToLiveEdge?.(); } catch (_) {}
    if (Platform.OS === 'android') {
      (p as any).setAllowsExternalPlayback?.(true); (p as any).setPictureInPicture?.(true);
    }
    p.play();
  });

  const seekBy = useCallback((secs: number) => { try { player.currentTime = Math.max(0, (player.currentTime ?? 0) + secs); } catch (_) {} }, [player]);
  const setVolume = useCallback((vol: number) => { try { player.volume = vol; } catch (_) {} }, [player]);
  const togglePlay = useCallback(() => {
    try { if (player.playing) { player.pause(); onPlayStateChange?.(false); } else { player.play(); onPlayStateChange?.(true); } } catch (_) {}
  }, [player, onPlayStateChange]);

  useImperativeHandle(ref, () => ({ seekBy, setVolume, togglePlay }), [seekBy, setVolume, togglePlay]);

  const stallTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPos = useRef(0); const stallCount = useRef(0);
  const CHECK = 12000, MIN_DELTA = 0.8, STALL_THRESH = 4;

  useEffect(() => { 
    mounted.current = true;
    // Solo actualizamos si la URL cambia drásticamente, sin cacheBust
    if (activeUrl !== url) setActiveUrl(url);
    stallCount.current = 0; lastPos.current = 0; 
    return () => { mounted.current = false; };
  }, [url]);

  useEffect(() => { if (!player || !onProgressUpdate) return; const iv = setInterval(() => { try { onProgressUpdate(player.currentTime ?? 0, (player as any).duration ?? 0); } catch (_) {} }, 500); return () => clearInterval(iv); }, [player, onProgressUpdate]);
  
  useEffect(() => {
    if (!player) return;
    if (stallTimer.current) clearInterval(stallTimer.current);
    stallTimer.current = setInterval(() => {
      try {
        if (!mounted.current) return;
        const pos = player.currentTime ?? 0;
        if (Math.abs(pos - lastPos.current) < MIN_DELTA) {
          stallCount.current++;
          if (stallCount.current >= STALL_THRESH) {
            stallCount.current = 0;
            // Intentamos reanudar la reproducción en lugar de reemplazar toda la URL
            try { 
              if (mounted.current && !player.playing) {
                player.play(); 
              }
            } catch (_) {}
          }
        } else { stallCount.current = 0; }
        lastPos.current = pos;
      } catch (_) {}
    }, CHECK);
    return () => { if (stallTimer.current) clearInterval(stallTimer.current); };
  }, [player, url]);
  
  useEffect(() => {
    if (!player) return;
    const s1 = player.addListener('statusChange', (p: any) => {
      if (p?.error) { console.error('Error reproductor nativo:', p.error); if (stallTimer.current) clearInterval(stallTimer.current); onError?.(); return; }
      // Si el estado es 'idle', esperamos un poco y forzamos a jugar, sin reemplazar la URL
      if ((p?.status ?? p) === 'idle') { 
        setTimeout(() => { 
          try { if (mounted.current) player.play(); } catch (_) {}
        }, 1000); 
      }
    });
    const s2 = player.addListener('playingChange', (p: any) => {
      const playing = p?.isPlaying ?? p; onPlayStateChange?.(!!playing);
      if (!playing) setTimeout(() => { try { if (!mounted.current) return; if (!player.playing) player.play(); } catch (_) {} }, 6000);
    });
    return () => { s1.remove(); s2.remove(); };
  }, [player, url, onError, onPlayStateChange]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView style={StyleSheet.absoluteFill} player={player} contentFit={contentFit} nativeControls={false} />
      {showSeekControls && (
        <View style={pl.seekOverlay} pointerEvents="box-none">
          <TouchableOpacity style={pl.seekBtn} onPress={() => seekBy(-10)}><Ionicons name="play-back" size={22} color="#fff" /><Text style={pl.seekLabel}>10</Text></TouchableOpacity>
          <TouchableOpacity style={pl.seekBtnPlay} onPress={togglePlay}><Ionicons name="play" size={28} color="#fff" /></TouchableOpacity>
          <TouchableOpacity style={pl.seekBtn} onPress={() => seekBy(10)}><Ionicons name="play-forward" size={22} color="#fff" /><Text style={pl.seekLabel}>10</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}));

/* ═══════════════════════════════════════════════════════════
   FULLSCREEN PLAYER (gestos brillo/volumen, play/pause, seek)
═══════════════════════════════════════════════════════════ */
interface FullscreenPlayerProps {
  url: string; isLive?: boolean; title?: string; subtitle?: string;
  onClose: () => void; primaryColor: string; onNext?: () => void; onPrev?: () => void;
  onError?: () => void; itemInfo?: ContinueWatchingItem;
  onProgress?: (cur: number, dur: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
}
const FullscreenPlayer = memo(({ url, isLive = false, title, subtitle, onClose, primaryColor, onNext, onPrev, onError, itemInfo, onProgress, onPlayStateChange }: FullscreenPlayerProps) => {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [aspect, setAspect] = useState<'contain' | 'fill'>('contain');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const controlsAnim = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef<ReproductorNativoHandle>(null);
  const [brightnessVal, setBrightnessVal] = useState(0.5);
  const [volumeVal, setVolumeVal] = useState(0.5);
  const [showBrightness, setShowBrightness] = useState(false);
  const panType = useRef<'brightness' | 'volume' | null>(null);
  const seekBarRef = useRef<View>(null);
  const seekBarWidth = useRef(0);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => { const locX = evt.nativeEvent.locationX; panType.current = locX < W / 2 ? 'brightness' : 'volume'; },
    onPanResponderMove: async (evt, gestureState) => {
      if (!panType.current) return;
      const deltaY = (-gestureState.dy) / H * 0.8;
      if (panType.current === 'brightness') {
        const newBright = Math.max(0, Math.min(1, brightnessVal + deltaY)); setBrightnessVal(newBright); Brightness.setBrightnessAsync(newBright); setShowBrightness(true);
      } else {
        const newVol = Math.max(0, Math.min(1, volumeVal + deltaY)); setVolumeVal(newVol); playerRef.current?.setVolume(newVol); setShowBrightness(true);
      }
    },
    onPanResponderRelease: () => { panType.current = null; setTimeout(() => setShowBrightness(false), 800); },
  })).current;

  const seekPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => handleSeekBarTouch(evt.nativeEvent.locationX),
    onPanResponderMove: (evt) => handleSeekBarTouch(evt.nativeEvent.locationX),
  })).current;

  useEffect(() => { lockLandscape(); return () => { lockPortrait(); }; }, []);

  const showControls = () => { setControlsVisible(true); Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(); resetHideTimer(); };
  const resetHideTimer = () => { if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { Animated.timing(controlsAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setControlsVisible(false)); }, 3500); };
  useEffect(() => { resetHideTimer(); return () => { if (hideTimer.current) clearTimeout(hideTimer.current); }; }, []);

  const handleProgress = useCallback((cur: number, dur: number) => {
    setCurrentTime(cur); setDuration(dur);
    if (dur > 0 && !isPlaying) setIsPlaying(true);
    onProgress?.(cur, dur);
    if (itemInfo && dur > 0) { saveContinueWatching({ ...itemInfo, progress: cur, duration: dur, watchedAt: Date.now() }, itemInfo.profileId || 'default'); }
  }, [itemInfo, isPlaying, onProgress]);

  const handlePlayStateChange = useCallback((playing: boolean) => { setIsPlaying(playing); onPlayStateChange?.(playing); }, [onPlayStateChange]);

  const handleSeekTo = useCallback((time: number) => { try { const diff = time - currentTime; playerRef.current?.seekBy(diff); } catch (_) {} }, [currentTime]);

  const handleSeekBarTouch = useCallback((locX: number) => {
    if (!seekBarWidth.current || duration <= 0) return;
    const fraction = Math.max(0, Math.min(1, locX / seekBarWidth.current));
    const seekTime = fraction * duration;
    handleSeekTo(seekTime);
  }, [duration, handleSeekTo]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <Modal visible animationType="fade" statusBarTranslucent supportRequestedOrientations={['landscape']}>
      <View style={fs.root} {...panResponder.panHandlers}>
        <StatusBar hidden />
        <TouchableWithoutFeedback onPress={showControls}>
          <View style={StyleSheet.absoluteFill}>
            <ReproductorNativo key={url} ref={playerRef} url={url} contentFit={aspect} isLive={isLive} showSeekControls={false} onError={onError} onProgressUpdate={handleProgress} itemInfo={itemInfo} onPlayStateChange={handlePlayStateChange} />
          </View>
        </TouchableWithoutFeedback>
        {showBrightness && (
          <View style={fs.brightnessOverlay}>
            <Ionicons name={panType.current === 'brightness' ? 'sunny' : 'volume-high'} size={40} color="#fff" />
            <Text style={fs.brightnessValue}>{Math.round((panType.current === 'brightness' ? brightnessVal : volumeVal) * 100)}%</Text>
          </View>
        )}
        <Animated.View style={[fs.overlay, { opacity: controlsAnim }]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
          <View style={fs.topBar}>
            <TouchableOpacity style={fs.closeBtn} onPress={onClose}><Ionicons name="chevron-down" size={24} color="#fff" /></TouchableOpacity>
            <View style={{ flex: 1, marginLeft: T.space.md }}>
              {title ? <Text style={fs.titleTxt} numberOfLines={1}>{title}</Text> : null}
              {subtitle ? <Text style={fs.subtitleTxt} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <View style={fs.topRight}>
              <TouchableOpacity style={fs.iconBtn} onPress={() => setAspect(a => a === 'contain' ? 'fill' : 'contain')}><Ionicons name={aspect === 'contain' ? 'scan-outline' : 'contract-outline'} size={20} color="#fff" /></TouchableOpacity>
              {isLive && (
                <View style={fs.liveBadge}>
                  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Animated.View style={[livePulseStyle.ring, { transform: [{ scale: 1.5 }], opacity: 0.6 }]} />
                    <View style={livePulseStyle.dot} />
                  </View>
                  <Text style={fs.liveTxt}>EN VIVO</Text>
                </View>
              )}
            </View>
          </View>
          <View style={fs.centerRow} pointerEvents="box-none">
            {!isLive && onPrev && <TouchableOpacity style={fs.navBtn} onPress={onPrev}><Ionicons name="play-skip-back" size={28} color="#fff" /></TouchableOpacity>}
            {!isLive && <TouchableOpacity style={fs.seekBigBtn} onPress={() => handleSeekTo(currentTime - 10)}><Ionicons name="play-back" size={26} color="#fff" /><Text style={fs.seekBigLabel}>10</Text></TouchableOpacity>}
            {!isLive && (
              <TouchableOpacity style={fs.playPauseBtn} onPress={() => { playerRef.current?.togglePlay(); setIsPlaying(prev => !prev); }}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color="#fff" />
              </TouchableOpacity>
            )}
            {!isLive && <TouchableOpacity style={fs.seekBigBtn} onPress={() => handleSeekTo(currentTime + 10)}><Ionicons name="play-forward" size={26} color="#fff" /><Text style={fs.seekBigLabel}>10</Text></TouchableOpacity>}
            {!isLive && onNext && <TouchableOpacity style={fs.navBtn} onPress={onNext}><Ionicons name="play-skip-forward" size={28} color="#fff" /></TouchableOpacity>}
          </View>
          {!isLive && duration > 0 && (
            <View style={fs.bottomBar}>
              <Text style={fs.timeTxt}>{formatTime(currentTime)}</Text>
              <View
                ref={seekBarRef}
                style={fs.progressTrack}
                onLayout={(e) => { seekBarWidth.current = e.nativeEvent.layout.width; }}
                {...seekPanResponder.panHandlers}
              >
                <View style={[fs.progressFill, { width: `${progress * 100}%`, backgroundColor: primaryColor }]} />
                <Animated.View style={[glowBarStyle.glow, { opacity: 0.8, left: `${progress * 100}%` }]} />
                <View style={[fs.progressThumb, { left: `${progress * 100}%`, backgroundColor: primaryColor }]} />
              </View>
              <Text style={fs.timeTxt}>{formatTime(duration)}</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
});

/* ═══════════════════════════════════════════════════════════
   WEBVIEW INJECTION
═══════════════════════════════════════════════════════════ */
const INJECT_BEFORE = `(function(){if(window.__NX__)return;window.__NX__=true;function post(u){try{if(typeof u!=='string'||u.length<12)return;if(!/(\.m3u8|\.mpd)(\\?|#|$)/i.test(u))return;window.ReactNativeWebView.postMessage('FOUND_MANIFEST:'+u);}catch(e){}}try{var oO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{post(u);}catch(e){}return oO.apply(this,arguments)};}catch(e){}try{var oF=window.fetch;if(oF){window.fetch=function(i,n){try{var u=typeof i==='string'?i:(i&&i.url?i.url:'');post(u);}catch(e){}return oF.apply(this,arguments).then(function(r){try{if(r&&r.url)post(r.url);}catch(e){}return r;});};}}catch(e){}try{var ob=new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeName==='VIDEO'){post(n.src||n.currentSrc||'');n.addEventListener('loadedmetadata',function(){post(n.currentSrc||'');});}if(n.nodeName==='IFRAME'){window.ReactNativeWebView.postMessage('IFRAME_SRC:'+n.src);}if(n.nodeName==='SOURCE'){post(n.src||'');}});});});ob.observe(document.documentElement||document.body,{childList:true,subtree:true});}catch(e){}})();true;`;
const INJECT_AFTER  = `(function(){function post(u){try{if(typeof u!=='string'||u.length<12)return;if(!/(\.m3u8|\.mpd)(\\?|#|$)/i.test(u))return;window.ReactNativeWebView.postMessage('FOUND_MANIFEST:'+u);}catch(e){}}function scan(){try{var h=document.documentElement.innerHTML||'';var m=h.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi);if(m)m.forEach(post);Array.from(document.getElementsByTagName('video')).forEach(function(v){try{v.play();}catch(e){}post(v.src||v.currentSrc||'');});var b=document.querySelectorAll('.play-button,.vjs-big-play-button,.jw-icon-playback,#play,.play-btn,[data-action="play"]');b.forEach(function(x){try{x.click();}catch(e){}});Array.from(document.getElementsByTagName('source')).forEach(function(s){post(s.getAttribute('src')||'');});}catch(e){}}scan();var iv=setInterval(scan,2000);setTimeout(function(){clearInterval(iv);window.ReactNativeWebView.postMessage('MANIFEST_TIMEOUT');},24000);})();true;`;

/* ═══════════════════════════════════════════════════════════
   SHIMMER
═══════════════════════════════════════════════════════════ */
const Shimmer = ({ w, h, style, borderRadius }: { w: number | string; h: number | string; style?: any; borderRadius?: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => { const loop = Animated.loop(Animated.sequence([Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }), Animated.timing(anim, { toValue: 0, duration: 1000, useNativeDriver: true })])); loop.start(); return () => loop.stop(); }, []);
  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [-250, 250] });
  return (<View style={[{ width: w, height: h, backgroundColor: T.color.surface, borderRadius: borderRadius ?? T.radius.md, overflow: 'hidden' }, style]}><Animated.View style={{ width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.06)', transform: [{ translateX: tx }] }} /></View>);
};

/* ═══════════════════════════════════════════════════════════
   HOOK PERSISTENCIA
═══════════════════════════════════════════════════════════ */
function usePersistedState<T>(key: string, init: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(init);
  useEffect(() => { AsyncStorage.getItem(key).then(raw => { if (raw) setState(JSON.parse(raw)); }); }, [key]);
  const setPersistedState = useCallback((value: T) => { setState(value); AsyncStorage.setItem(key, JSON.stringify(value)); }, [key]);
  return [state, setPersistedState];
}

/* ═══════════════════════════════════════════════════════════
   GLASS BADGE
═══════════════════════════════════════════════════════════ */
const GlassBadge = ({ label, color, icon }: { label: string; color?: string; icon?: string }) => (
  <View style={[gb.badge, { borderColor: color ? color + '55' : T.color.glassBorder }]}>
    {icon ? <Ionicons name={icon as any} size={10} color={color || T.color.textMuted} style={{ marginRight: 3 }} /> : null}
    <Text style={[gb.label, { color: color || T.color.textMuted }]}>{label}</Text>
  </View>
);
const gb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.color.glassBackground, borderWidth: 1, borderRadius: T.radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  label: { fontSize: 10, fontWeight: T.font.bold, letterSpacing: 0.5 },
});

/* ═══════════════════════════════════════════════════════════
   MINI PLAYER BAR
═══════════════════════════════════════════════════════════ */
interface MiniPlayerProps { title: string; subtitle?: string; poster?: string; primaryColor: string; onExpand: () => void; onClose: () => void; progress?: number; }
const MiniPlayerBar = ({ title, subtitle, poster, primaryColor, onExpand, onClose, progress = 0 }: MiniPlayerProps) => (
  <Pressable style={mp.bar} onPress={onExpand} android_ripple={{ color: primaryColor + '22' }}>
    <View style={mp.progressLine}><Animated.View style={[mp.progressFill, { width: `${progress * 100}%`, backgroundColor: primaryColor }]} /></View>
    {poster ? <Image source={{ uri: poster }} style={mp.poster} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[mp.poster, { backgroundColor: T.color.surfaceHigh, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="play-circle" size={20} color={primaryColor} /></View>}
    <View style={{ flex: 1, marginLeft: T.space.sm }}><Text style={mp.title} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={mp.sub} numberOfLines={1}>{subtitle}</Text> : null}</View>
    <TouchableOpacity style={mp.expandBtn} onPress={onExpand}><Ionicons name="expand" size={20} color="#fff" /></TouchableOpacity>
    <TouchableOpacity style={mp.closeBtn} onPress={onClose}><Ionicons name="close" size={20} color={T.color.textMuted} /></TouchableOpacity>
  </Pressable>
);

/* ═══════════════════════════════════════════════════════════
   FILTROS
═══════════════════════════════════════════════════════════ */
const FilterBar = ({ genres, selectedGenres, onToggleGenre, sortBy, onSortChange, primaryColor }: any) => (
  <View style={fb.container}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fb.genreRow}>
      {genres.map((g: any) => (
        <TouchableOpacity key={g.id} style={[fb.genreChip, selectedGenres.includes(g.id) && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => onToggleGenre(g.id)}>
          <Text style={[fb.genreText, selectedGenres.includes(g.id) && { color: '#fff' }]}>{g.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
    <View style={fb.sortRow}>
      <Text style={fb.sortLabel}>Ordenar:</Text>
      {['title', 'year', 'rating'].map(option => (
        <TouchableOpacity key={option} style={[fb.sortChip, sortBy === option && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => onSortChange(option)}>
          <Text style={[fb.sortText, sortBy === option && { color: '#fff' }]}>{option === 'title' ? 'Título' : option === 'year' ? 'Año' : 'Rating'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);
const fb = StyleSheet.create({
  container: { paddingHorizontal: T.space.lg, paddingBottom: T.space.sm },
  genreRow: { flexDirection: 'row', gap: T.space.sm, marginBottom: T.space.sm },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: T.radius.full, borderWidth: 1, borderColor: T.color.glassBorder, backgroundColor: T.color.surfaceElevated },
  genreText: { color: T.color.textSecondary, fontSize: T.font.sm },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  sortLabel: { color: T.color.textMuted, fontSize: T.font.xs, fontWeight: T.font.bold },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radius.full, borderWidth: 1, borderColor: T.color.glassBorder, backgroundColor: T.color.surfaceElevated },
  sortText: { color: T.color.textSecondary, fontSize: T.font.xs },
});

/* ═══════════════════════════════════════════════════════════
   TV EN VIVO (completo, con LivePulse)
═══════════════════════════════════════════════════════════ */
const LivePlayerSection = memo(({ primaryColor, listaCanales, loadingChannels, refreshing, onRefresh, favorites, setFavorites }: {
  primaryColor: string; listaCanales: Canal[]; loadingChannels: boolean;
  refreshing: boolean; onRefresh: () => void; favorites: string[]; setFavorites: (v: string[]) => void;
}) => {
  const [canal, setCanal] = useState<Canal | null>(null);
  const [linkM3u8, setLinkM3u8] = useState<string | null>(null);
  const [cazando, setCazando] = useState(false);
  const [embedBuscando, setEmbedBuscando] = useState(false);
  const [embedWebView, setEmbedWebView] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [aspect, setAspect] = useState<'contain' | 'fill'>('contain');
  const [busqueda, setBusqueda] = useState('');
  const [catActiva, setCatActiva] = useState('Todos');
  const [categorias, setCategorias] = useState<string[]>(['Todos']);
  const [recents, setRecents] = useState<Canal[]>([]);
  const [numeroMarcado, setNumeroMarcado] = useState('');
  const [errorCanal, setErrorCanal] = useState(false);

  const canalRef = useRef<Canal | null>(null);
  const embedWebViewRef = useRef<WebView>(null);
  const webViewRef = useRef<WebView>(null);
  const timerCaza = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerZap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const embedRetry = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const liveDot = useRef(new Animated.Value(1)).current;
  const panRef = useRef<any>(null);

  useEffect(() => { canalRef.current = canal; }, [canal]);

  useEffect(() => {
    const cats = new Set<string>(['Todos']);
    listaCanales.forEach(c => cats.add(c.category));
    if (favorites.length > 0) cats.add('Favoritos');
    setCategorias(Array.from(cats));
    if (!canal && listaCanales.length > 0) sintonizar(listaCanales[0]);
  }, [listaCanales]);

  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([Animated.timing(liveDot, { toValue: 0.1, duration: 850, useNativeDriver: true }), Animated.timing(liveDot, { toValue: 1, duration: 850, useNativeDriver: true })]));
    pulse.start(); return () => pulse.stop();
  }, []);

  const lastTapRef = useRef<number | null>(null);
  if (!panRef.current) {
    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        const now = Date.now();
        if (lastTapRef.current && now - lastTapRef.current < 280) { abrirFullscreen(); lastTapRef.current = null; return; }
        lastTapRef.current = now;
        if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy)) { if (g.dx > 0) canalAnterior(); else canalSiguiente(); }
      },
    });
  }

  const abrirFullscreen = () => { if (!linkM3u8 && !embedBuscando) return; setFullscreen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); };
  const limpiarCaza = () => { if (timerCaza.current) { clearTimeout(timerCaza.current); timerCaza.current = null; } };

  async function fetchText(url: string): Promise<string> {
    try { const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }); if (res.ok) return await res.text(); } catch (_) {}
    try { const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`; const res = await fetch(proxyUrl); if (res.ok) return await res.text(); } catch (_) {}
    throw new Error('No se pudo obtener el manifiesto');
  }

  async function seleccionarMejorCalidad(m3u8Url: string): Promise<string> {
    try {
      const text = await fetchText(m3u8Url);
      if (!text.includes('#EXT-X-STREAM-INF')) return forzarCalidadEnUrl(m3u8Url);
      const lineas = text.split('\n'); let mejorUrl = m3u8Url; let mejorRes = 0; let mejorBandwidth = 0;
      for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (linea.startsWith('#EXT-X-STREAM-INF')) {
          const matchRes = linea.match(/RESOLUTION=(\d+)x(\d+)/i); const matchBw = linea.match(/BANDWIDTH=(\d+)/i);
          if (matchRes) {
            const res = parseInt(matchRes[1], 10) * parseInt(matchRes[2], 10);
            if (res > mejorRes) { mejorRes = res; mejorBandwidth = matchBw ? parseInt(matchBw[1], 10) : 0; const posibleUrl = lineas[i + 1]?.trim(); if (posibleUrl && posibleUrl.match(/^https?:\/\//i)) mejorUrl = new URL(posibleUrl, m3u8Url).href; else if (posibleUrl) mejorUrl = new URL(posibleUrl, m3u8Url).href; }
          } else if (matchBw) {
            const bw = parseInt(matchBw[1], 10);
            if (bw > mejorBandwidth) { mejorBandwidth = bw; const posibleUrl = lineas[i + 1]?.trim(); if (posibleUrl && posibleUrl.match(/^https?:\/\//i)) mejorUrl = new URL(posibleUrl, m3u8Url).href; else if (posibleUrl) mejorUrl = new URL(posibleUrl, m3u8Url).href; }
          }
        }
      }
      if (mejorRes > 0 || mejorBandwidth > 0) return mejorUrl;
      return forzarCalidadEnUrl(m3u8Url);
    } catch { return m3u8Url; }
  }
  function forzarCalidadEnUrl(url: string): string { return url.includes('?') ? url + '&hd=1&quality=1080p' : url + '?hd=1&quality=1080p'; }

  const obtenerStreamEmbed = async (embedSlug: string): Promise<string | null> => {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    const baseUrls = [`${EMBED_BASE}/${embedSlug}.html`, `https://regionales.saohgdasregions.fun/stream.php?canal=${embedSlug}`, `https://deportes.ksdjugfsddeports.com/stream.php?canal=${embedSlug}`];
    const targets = ['', '&target=2', '&target=1', '&target=0', '&target=3', '&hd=1', '&quality=1080p'];
    const findM3u8 = (html: string) => html.match(/https?:\/\/[^\s"'<>]+?\.m3u8(?:\?[^\s"'<>]*)?/i)?.[0];
    for (const base of baseUrls) {
      for (const extra of targets) {
        const url = base.includes('?') ? base + extra : base + (base.includes('.html') ? '' : extra);
        try {
          const res = await fetch(url, { headers: { 'User-Agent': UA } }); const html = await res.text();
          const stream = findM3u8(html); if (stream) return await seleccionarMejorCalidad(stream);
          const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i);
          if (iframeMatch) {
            const iframeSrc = iframeMatch[1].replace(/&amp;/g, '&');
            const iframeRes = await fetch(iframeSrc, { headers: { 'User-Agent': UA, 'Referer': url } }); const iframeHtml = await iframeRes.text();
            const iframeStream = findM3u8(iframeHtml); if (iframeStream) return await seleccionarMejorCalidad(iframeStream);
          }
        } catch {}
      }
    }
    return null;
  };

  const sintonizar = async (c: Canal) => {
    limpiarCaza(); setLinkM3u8(null); setCanal(c); setEmbedBuscando(false); setEmbedWebView(false); setCazando(false);
    setRecents(prev => [c, ...prev.filter(x => x.id !== c.id)].slice(0, 8)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (c.embedSlug || c.needsWebView) {
      const slug = c.embedSlug || extractEmbedSlug(c.url) || ''; embedRetry.current = 0; setEmbedBuscando(true);
      const stream = await obtenerStreamEmbed(slug);
      if (stream) { setLinkM3u8(stream); setEmbedBuscando(false); }
      else { setEmbedWebView(true); timerCaza.current = setTimeout(() => { setEmbedBuscando(false); setEmbedWebView(false); limpiarCaza(); Alert.alert(c.name, 'Canal offline o no disponible.'); }, 28000); }
      return;
    }
    if (esUrlManifiesto(c.url)) { setLinkM3u8(c.url); return; }
    setCazando(true); timerCaza.current = setTimeout(() => setCazando(false), 15000);
  };

  const reextraerEmbed = useCallback(async () => {
    const c = canalRef.current; if (!c) return;
    if (embedRetry.current >= 4) { setLinkM3u8(null); setEmbedBuscando(false); setEmbedWebView(false); return; }
    embedRetry.current++; const slug = c.embedSlug || extractEmbedSlug(c.url) || '';
    setLinkM3u8(null); setEmbedBuscando(true); setEmbedWebView(false);
    await new Promise(r => setTimeout(r, 1500));
    const stream = await obtenerStreamEmbed(slug);
    if (stream) { setLinkM3u8(stream); setEmbedBuscando(false); }
    else { setEmbedWebView(true); timerCaza.current = setTimeout(() => { setEmbedBuscando(false); setEmbedWebView(false); limpiarCaza(); }, 28000); }
  }, []);

  const onMsgEmbed = async (e: WebViewMessageEvent) => {
    const data = String(e.nativeEvent.data || '').trim();
    if (data.startsWith('FOUND_MANIFEST:')) { const rawUrl = data.replace('FOUND_MANIFEST:', ''); const mejorUrl = await seleccionarMejorCalidad(rawUrl); setLinkM3u8(mejorUrl); setEmbedBuscando(false); setEmbedWebView(false); limpiarCaza(); return; }
    if (esUrlManifiesto(data)) { const mejorUrl = await seleccionarMejorCalidad(data); setLinkM3u8(mejorUrl); setEmbedBuscando(false); setEmbedWebView(false); limpiarCaza(); return; }
    if (data === 'MANIFEST_TIMEOUT') { setEmbedBuscando(false); setEmbedWebView(false); limpiarCaza(); Alert.alert('Canal', 'No se pudo extraer el stream.'); }
  };
  const onMsgWebView = (e: WebViewMessageEvent) => { const m = extraerManifiesto(String(e.nativeEvent.data || '')); if (m) { setLinkM3u8(m); setCazando(false); limpiarCaza(); } };

  const canalSiguiente = () => { const lista = listaCanales; if (!canal || !lista.length) return; sintonizar(lista[(lista.findIndex(c => c.id === canal.id) + 1) % lista.length]); };
  const canalAnterior = () => { const lista = listaCanales; if (!canal || !lista.length) return; const idx = lista.findIndex(c => c.id === canal.id); sintonizar(lista[idx === 0 ? lista.length - 1 : idx - 1]); };

  const alMarcrarNumero = (txt: string) => {
    const n = txt.replace(/[^0-9]/g, ''); if (!n) return;
    setNumeroMarcado(n); if (timerZap.current) clearTimeout(timerZap.current);
    timerZap.current = setTimeout(() => { const found = listaCanales.find(c => c.numero === parseInt(n, 10)); if (found) sintonizar(found); else { setErrorCanal(true); setTimeout(() => setErrorCanal(false), 1800); } setNumeroMarcado(''); }, 1400);
  };

  const onPlayerError = useCallback(() => {
    if (canalRef.current?.embedSlug || canalRef.current?.needsWebView) { reextraerEmbed(); return; }
    setLinkM3u8(null); limpiarCaza(); setTimeout(() => { if (canalRef.current) sintonizar(canalRef.current); }, 500);
  }, [reextraerEmbed]);

  const canalesFiltrados = listaCanales.filter(c => {
    const matchCat = catActiva === 'Todos' ? true : catActiva === 'Favoritos' ? favorites.includes(c.id) : c.category === catActiva;
    return matchCat && c.name.toLowerCase().includes(busqueda.toLowerCase());
  });

  const embedUrl = canal ? (canal.embedSlug ? `${EMBED_BASE}/${canal.embedSlug}.html` : canal.url) : '';

  return (
    <View style={{ flex: 1 }}>
      {fullscreen && linkM3u8 && <FullscreenPlayer url={linkM3u8} isLive title={canal?.name} subtitle={canal?.nowPlaying} primaryColor={primaryColor} onClose={() => setFullscreen(false)} onError={onPlayerError} />}
      <TextInput ref={inputRef} value={numeroMarcado} onChangeText={alMarcrarNumero} keyboardType="numeric" showSoftInputOnFocus={false} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />

      <View style={[lv.playerBox, { height: LIVE_PLAYER_H }]} {...panRef.current.panHandlers}>
        {!fullscreen && (
          <>
            {embedBuscando ? (
              <View style={lv.noSignal}><ActivityIndicator size="large" color={primaryColor} /><Text style={[lv.noSignalTxt, { marginTop: 10 }]}>Conectando a {canal?.name ?? 'canal'}…</Text></View>
            ) : linkM3u8 ? (
              <ReproductorNativo key={linkM3u8} url={linkM3u8} contentFit={aspect} isLive onError={onPlayerError} onStall={reextraerEmbed} />
            ) : (
              <View style={lv.noSignal}><Ionicons name="tv-outline" size={50} color={T.color.textMuted} /><Text style={lv.noSignalTxt}>Sin señal</Text></View>
            )}
            <TouchableOpacity style={lv.navLeft} onPress={canalAnterior}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={lv.navRight} onPress={canalSiguiente}><Ionicons name="chevron-forward" size={26} color="#fff" /></TouchableOpacity>
            <View style={lv.topBar} pointerEvents="box-none">
              {canal && (
                <View style={lv.livePill}>
                  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Animated.View style={[livePulseStyle.ring, { transform: [{ scale: 1.5 }], opacity: 0.6 }]} />
                    <View style={livePulseStyle.dot} />
                  </View>
                  <Text style={lv.liveTxt}>EN VIVO</Text>
                </View>
              )}
              <View style={lv.topBarRight}>
                <TouchableOpacity style={lv.iconBtn} onPress={() => setAspect(a => a === 'contain' ? 'fill' : 'contain')}><Ionicons name="scan-outline" size={18} color="#fff" /></TouchableOpacity>
                <TouchableOpacity style={lv.iconBtn} onPress={abrirFullscreen}><Ionicons name="expand-outline" size={18} color="#fff" /></TouchableOpacity>
              </View>
            </View>
            <View style={lv.bottomGradient} pointerEvents="none">
              {canal && (
                <View style={lv.channelInfoRow}>
                  <View style={[lv.numBadgeLarge, { backgroundColor: primaryColor }]}><Text style={lv.numLarge}>{canal.numero}</Text></View>
                  <View style={{ flex: 1, marginLeft: T.space.sm }}>
                    <Text style={lv.chName} numberOfLines={1}>{canal.name}</Text>
                    {canal.nowPlaying ? <Text style={lv.chNow} numberOfLines={1}>▶ {canal.nowPlaying}</Text> : null}
                  </View>
                  {canal.category ? <GlassBadge label={canal.category} color="rgba(255,255,255,0.5)" /> : null}
                </View>
              )}
            </View>
            <TouchableOpacity style={lv.tapHint} onPress={abrirFullscreen}><Ionicons name="expand" size={14} color="rgba(255,255,255,0.4)" /><Text style={lv.tapHintTxt}>Toca 2 veces para pantalla completa</Text></TouchableOpacity>
            {numeroMarcado !== '' && <View style={lv.osd}><Text style={[lv.osdTxt, { color: primaryColor }]}>{numeroMarcado}</Text></View>}
            {errorCanal && <View style={lv.osdError}><Text style={lv.osdErrTxt}>CANAL NO ENCONTRADO</Text></View>}
          </>
        )}
      </View>

      {recents.length > 0 && (
        <View style={lv.recentsSection}>
          <Text style={lv.recentsSectionLabel}>RECIENTES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
            {recents.map(ch => (
              <TouchableOpacity key={ch.id} style={[lv.recentChip, canal?.id === ch.id && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => sintonizar(ch)}>
                {ch.logo ? <Image source={{ uri: ch.logo }} style={lv.recentLogo} contentFit="contain" cachePolicy="memory-disk" /> : <Ionicons name="tv" size={11} color={canal?.id === ch.id ? '#fff' : T.color.textMuted} />}
                <Text style={[lv.recentTxt, canal?.id === ch.id && { color: '#fff', fontWeight: T.font.bold }]} numberOfLines={1}>{ch.numero}. {ch.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={lv.searchRow}>
        <Ionicons name="search" size={18} color={T.color.textMuted} style={{ marginRight: T.space.sm }} />
        <TextInput style={lv.searchInput} placeholder="Buscar canal..." placeholderTextColor={T.color.textMuted} value={busqueda} onChangeText={setBusqueda} />
        {busqueda !== '' && <TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={18} color={T.color.textMuted} /></TouchableOpacity>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={lv.catRow} contentContainerStyle={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
        {categorias.map(cat => (
          <TouchableOpacity key={cat} onPress={() => { setCatActiva(cat); Haptics.selectionAsync(); }} style={[lv.catChip, catActiva === cat && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
            <Text style={[lv.catTxt, catActiva === cat && { color: '#fff', fontWeight: T.font.bold }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loadingChannels ? (
        <View style={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
          {Array.from({ length: 7 }).map((_, i) => (<View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.md }}><Shimmer w={s(40)} h={s(28)} /><Shimmer w={s(160)} h={s(14)} /></View>))}
        </View>
      ) : (
        <FlashList
          data={canalesFiltrados}
          keyExtractor={item => item.id}
          estimatedItemSize={s(80)}
          contentContainerStyle={{ paddingHorizontal: T.space.lg, paddingBottom: 20, gap: T.space.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
          renderItem={({ item }) => {
            const active = canal?.id === item.id; const fav = favorites.includes(item.id);
            return (
              <TouchableOpacity style={[lv.channelRow, active && { borderColor: primaryColor, borderLeftWidth: 4, backgroundColor: T.color.surfaceElevated }]} onPress={() => sintonizar(item)} activeOpacity={0.8}>
                <View style={[lv.numBadge, { backgroundColor: active ? primaryColor : T.color.surfaceHigh }]}><Text style={[lv.numTxt, { color: active ? '#fff' : T.color.textSecondary }]}>{item.numero}</Text></View>
                <View style={{ flex: 1, marginLeft: T.space.md }}>
                  <Text style={[lv.rowName, active && { color: T.color.textPrimary, fontWeight: T.font.semibold }]} numberOfLines={1}>{item.name}</Text>
                  {item.nowPlaying ? (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}><View style={[lv.nowDot, { backgroundColor: active ? primaryColor : T.color.textMuted }]} /><Text style={lv.rowNow} numberOfLines={1}>{item.nowPlaying}</Text></View>) : null}
                </View>
                {item.logo ? <Image source={{ uri: item.logo }} style={lv.logo} contentFit="contain" cachePolicy="memory-disk" /> : <View style={lv.logoPlaceholder}><Ionicons name="tv" size={14} color={T.color.textMuted} /></View>}
                <TouchableOpacity onPress={() => setFavorites(fav ? favorites.filter(id => id !== item.id) : [...favorites, item.id])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: T.space.sm }}><Ionicons name={fav ? 'star' : 'star-outline'} size={17} color={fav ? T.color.gold : T.color.textMuted} /></TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
      {cazando && canal && !canal.needsWebView && !canal.embedSlug && (
        <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
          <WebView ref={webViewRef} source={{ uri: canal.url, headers: { 'User-Agent': 'Mozilla/5.0' } }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled cacheEnabled={false} mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback mixedContentMode="always" injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE} injectedJavaScript={INJECT_AFTER} onMessage={onMsgWebView} />
        </View>
      )}
      {embedWebView && canal && (canal.embedSlug || canal.needsWebView) && (
        <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
          <WebView ref={embedWebViewRef} source={{ uri: embedUrl }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback mixedContentMode="always" injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE} injectedJavaScript={INJECT_AFTER} onMessage={onMsgEmbed} />
        </View>
      )}
    </View>
  );
});

/* ═══════════════════════════════════════════════════════════
   PELÍCULAS (con AnimatedCard)
═══════════════════════════════════════════════════════════ */
const MoviesPlayerSection = memo(({ primaryColor, driveItems, loadingDrive, onCargarDrive, activeProfile, updateProfile, continueWatching, addToContinueWatching }: {
  primaryColor: string; driveItems: MediaItem[]; loadingDrive: boolean; onCargarDrive: (force?: boolean) => void;
  activeProfile: Profile; updateProfile: (p: Profile) => void;
  continueWatching: ContinueWatchingItem[]; addToContinueWatching: (item: ContinueWatchingItem) => void;
}) => {
  const [vodUrl, setVodUrl] = useState<string | null>(null);
  const [vodItem, setVodItem] = useState<MediaItem | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [categoria, setCategoria] = useState<'popular' | 'top_rated' | 'drive' | 'custom'>('drive');
  const [tmdbItems, setTmdbItems] = useState<MediaItem[]>(MOVIES_FALLBACK); // AHORA ESTÁ DEFINIDO
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [tmdbPage, setTmdbPage] = useState(1);
  const [customItems, setCustomItems] = usePersistedState<MediaItem[]>('customMovies', []);
  const [watchlist, setWatchlist] = useState<string[]>(activeProfile.watchlistMovies);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [downloadingItem, setDownloadingItem] = useState<DownloadItem | null>(null);
  const [genres, setGenres] = useState<any[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'rating'>('title');
  const [addTitle, setAddTitle] = useState(''); const [addPoster, setAddPoster] = useState('');
  const [addStream, setAddStream] = useState(''); const [addYear, setAddYear] = useState('');
  const [trailerVisible, setTrailerVisible] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | undefined>();

  useEffect(() => { if (categoria === 'drive' && driveItems.length === 0 && !loadingDrive) onCargarDrive(); }, [categoria]);
  useEffect(() => { fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}&language=es`).then(r => r.json()).then(d => setGenres(d.genres || [])); }, []);

  const fetchTmdb = async (cat: string, page: number) => {
    setLoadingTmdb(true);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/movie/${cat}?api_key=${TMDB_API_KEY}&language=es&page=${page}`);
      const data = await res.json();
      const formatted: MediaItem[] = (data.results || []).map((m: any) => ({
        id: m.id.toString(), title: m.title, poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`, backdrop: `https://image.tmdb.org/t/p/w780${m.backdrop_path}`,
        year: m.release_date ? new Date(m.release_date).getFullYear() : undefined, rating: m.vote_average?.toFixed(1) ?? '0.0', overview: m.overview, type: 'movie' as const, genreIds: m.genre_ids || [],
      }));
      if (page === 1) setTmdbItems(formatted); else setTmdbItems(prev => [...prev, ...formatted]);
    } catch { if (page === 1) setTmdbItems(MOVIES_FALLBACK); } finally { setLoadingTmdb(false); }
  };

  const toggleGenre = (genreId: number) => { setSelectedGenres(prev => prev.includes(genreId) ? prev.filter(g => g !== genreId) : [...prev, genreId]); };

  let datos = categoria === 'drive' ? driveItems : categoria === 'custom' ? customItems : tmdbItems;
  datos = datos.filter(i => i.title.toLowerCase().includes(busqueda.toLowerCase()));
  if (selectedGenres.length > 0) datos = datos.filter(i => i.genreIds?.some(g => selectedGenres.includes(g)));
  datos.sort((a, b) => { if (sortBy === 'title') return a.title.localeCompare(b.title); if (sortBy === 'year') return (b.year || 0) - (a.year || 0); return parseFloat(b.rating || '0') - parseFloat(a.rating || '0'); });
  const cargando = categoria === 'drive' ? loadingDrive : loadingTmdb;

  const reproducir = (item: MediaItem) => { if (!item.streamUrl) { Alert.alert('Error', 'Este elemento no tiene URL de reproducción.'); return; } setVodUrl(item.streamUrl); setVodItem(item); setDetailOpen(false); setProgress(0); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setFullscreen(true); };
  const cerrarVod = () => { setVodUrl(null); setVodItem(null); setFullscreen(false); setProgress(0); };
  const toggleWatchlist = (id: string) => { const newWatchlist = watchlist.includes(id) ? watchlist.filter(w => w !== id) : [...watchlist, id]; setWatchlist(newWatchlist); updateProfile({ ...activeProfile, watchlistMovies: newWatchlist }); };
  const startDownloadItem = async (item: MediaItem) => { if (!item.streamUrl) return; setDownloadingItem({ id: item.id, title: item.title, poster: item.poster, streamUrl: item.streamUrl, progress: 0, status: 'downloading' }); try { const localUri = await startDownload(item, (p) => { setDownloadingItem(prev => prev ? { ...prev, progress: p } : null); }); setDownloadingItem(prev => prev ? { ...prev, status: 'completed', localUri } : null); } catch { setDownloadingItem(prev => prev ? { ...prev, status: 'error' } : null); } };

  const getItemLayout = useCallback((_data: any, index: number) => ({ length: CARD_H + T.space.md, offset: (CARD_H + T.space.md) * Math.floor(index / MEDIA_COLS), index }), []);

  const handleLongPress = async (item: MediaItem) => {
    if (item.trailerKey) { setTrailerKey(item.trailerKey); setTrailerVisible(true); return; }
    try {
      const res = await fetch(`https://api.themoviedb.org/3/movie/${item.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`);
      const data = await res.json();
      const trailer = data.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailer) { setTrailerKey(trailer.key); setTrailerVisible(true); } else { Alert.alert('Sin tráiler', 'No se encontró tráiler disponible.'); }
    } catch { Alert.alert('Error', 'No se pudo cargar el tráiler.'); }
  };

  return (
    <View style={{ flex: 1 }}>
      {fullscreen && vodUrl && vodItem && (
        <FullscreenPlayer url={vodUrl} title={vodItem.title} subtitle={vodItem.year ? String(vodItem.year) : undefined} primaryColor={primaryColor} onClose={() => setFullscreen(false)} onError={cerrarVod}
          itemInfo={vodItem ? { id: vodItem.id, title: vodItem.title, poster: vodItem.poster, progress: 0, duration: 0, type: 'movie', streamUrl: vodItem.streamUrl!, profileId: activeProfile.id } : undefined}
          onProgress={(cur, dur) => { if (vodItem && dur > 0) addToContinueWatching({ id: vodItem.id, title: vodItem.title, poster: vodItem.poster, progress: cur, duration: dur, type: 'movie', streamUrl: vodItem.streamUrl!, profileId: activeProfile.id, watchedAt: Date.now() }); }} />
      )}
      {vodUrl && vodItem && !fullscreen && (
        <MiniPlayerBar title={vodItem.title} subtitle={vodItem.year ? String(vodItem.year) : undefined} poster={vodItem.poster} primaryColor={primaryColor} progress={progress} onExpand={() => setFullscreen(true)} onClose={cerrarVod} />
      )}

      {continueWatching.filter(i => i.type === 'movie').length > 0 && (
        <View style={cwa.section}>
          <Text style={cwa.sectionTitle}>CONTINUAR VIENDO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cwa.scroll}>
            {continueWatching.filter(i => i.type === 'movie').slice(0, 8).map(item => (
              <TouchableOpacity key={item.id} style={cwa.card} onPress={() => { setVodUrl(item.streamUrl); setVodItem({ id: item.id, title: item.title, poster: item.poster, streamUrl: item.streamUrl } as MediaItem); setProgress(item.progress / item.duration); setFullscreen(true); }}>
                <Image source={{ uri: item.poster }} style={cwa.poster} contentFit="cover" cachePolicy="memory-disk" />
                <View style={cwa.cardGradient}><Text style={cwa.title} numberOfLines={1}>{item.title}</Text><View style={cwa.progressTrack}><View style={[cwa.progressFill, { width: `${(item.progress / item.duration) * 100}%`, backgroundColor: primaryColor }]} /></View></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={lv.searchRow}>
        <Ionicons name="search" size={18} color={T.color.textMuted} style={{ marginRight: T.space.sm }} />
        <TextInput style={lv.searchInput} placeholder="Buscar película..." placeholderTextColor={T.color.textMuted} value={busqueda} onChangeText={setBusqueda} />
        {busqueda !== '' && <TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={18} color={T.color.textMuted} /></TouchableOpacity>}
      </View>

      <FilterBar genres={genres} selectedGenres={selectedGenres} onToggleGenre={toggleGenre} sortBy={sortBy} onSortChange={setSortBy} primaryColor={primaryColor} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={lv.catRow} contentContainerStyle={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
          {([{ key: 'drive', label: 'Mi Drive', icon: 'cloud-outline' }, { key: 'popular', label: 'Populares', icon: 'flame-outline' }, { key: 'top_rated', label: 'Mejor Valoradas', icon: 'star-outline' }, { key: 'custom', label: 'Mi Lista', icon: 'bookmark-outline' }] as const).map(({ key, label, icon }) => (
            <TouchableOpacity key={key} onPress={() => { setCategoria(key); setTmdbPage(1); }} style={[lv.catChip, categoria === key && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
              <Ionicons name={icon} size={13} color={categoria === key ? '#fff' : T.color.textMuted} style={{ marginRight: 4 }} /><Text style={[lv.catTxt, categoria === key && { color: '#fff', fontWeight: T.font.bold }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {categoria === 'custom' && <TouchableOpacity style={[vd.addBtn, { backgroundColor: primaryColor }]} onPress={() => setAddOpen(true)}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>}
      </View>

      {addOpen && (
        <View style={vd.addForm}>
          <Text style={vd.addFormTitle}>Agregar Película</Text>
          <TextInput style={vd.addInput} placeholder="Título *" placeholderTextColor={T.color.textMuted} value={addTitle} onChangeText={setAddTitle} />
          <TextInput style={vd.addInput} placeholder="URL poster" placeholderTextColor={T.color.textMuted} value={addPoster} onChangeText={setAddPoster} />
          <TextInput style={vd.addInput} placeholder="URL reproducción" placeholderTextColor={T.color.textMuted} value={addStream} onChangeText={setAddStream} />
          <TextInput style={vd.addInput} placeholder="Año" placeholderTextColor={T.color.textMuted} value={addYear} onChangeText={setAddYear} keyboardType="numeric" />
          <View style={{ flexDirection: 'row', gap: T.space.sm, marginTop: T.space.sm }}>
            <TouchableOpacity style={[vd.addBtnSmall, { backgroundColor: primaryColor, flex: 1 }]} onPress={() => { if (!addTitle.trim()) { Alert.alert('Error', 'Título obligatorio.'); return; } const item: MediaItem = { id: Date.now().toString(), title: addTitle.trim(), poster: addPoster.trim() || 'https://via.placeholder.com/500x750.png?text=Sin+Imagen', streamUrl: addStream.trim(), year: addYear ? parseInt(addYear) : new Date().getFullYear(), rating: '0.0', type: 'movie', custom: true }; setCustomItems([item, ...customItems]); setAddOpen(false); setAddTitle(''); setAddPoster(''); setAddStream(''); setAddYear(''); }}><Text style={{ color: '#fff', fontWeight: T.font.bold }}>Agregar</Text></TouchableOpacity>
            <TouchableOpacity style={[vd.addBtnSmall, { backgroundColor: T.color.surfaceElevated, flex: 1 }]} onPress={() => setAddOpen(false)}><Text style={{ color: T.color.textSecondary }}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {cargando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={primaryColor} /></View>
      ) : (
        <FlashList
          data={datos} keyExtractor={item => item.id} numColumns={MEDIA_COLS} estimatedItemSize={CARD_H + T.space.md} windowSize={5} maxToRenderPerBatch={10} removeClippedSubviews
          contentContainerStyle={{ paddingHorizontal: T.space.lg, paddingBottom: 24, paddingTop: T.space.sm }}
          refreshControl={categoria === 'drive' ? <RefreshControl refreshing={loadingDrive} onRefresh={() => onCargarDrive(true)} tintColor={primaryColor} /> : undefined}
          onEndReached={() => { if (categoria === 'popular' || categoria === 'top_rated') { const next = tmdbPage + 1; setTmdbPage(next); fetchTmdb(categoria, next); } }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <Pressable style={vd.card} onPress={() => { setDetailItem(item); setDetailOpen(true); Haptics.selectionAsync(); }} onLongPress={() => handleLongPress(item)} delayLongPress={500}>
              {({ pressed }) => (
                <Animated.View style={[vd.cardInner, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                  <Image source={{ uri: item.poster }} style={vd.poster} contentFit="cover" cachePolicy="memory-disk" />
                  <View style={vd.posterGradient} />
                  {vodItem?.id === item.id && <View style={[vd.playingBadge, { backgroundColor: primaryColor }]}><Ionicons name="play" size={10} color="#fff" /></View>}
                  {item.custom && <View style={vd.customBadge}><Text style={vd.customBadgeTxt}>DRIVE</Text></View>}
                  <View style={vd.cardBottom}>
                    <Text style={vd.cardTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginTop: 4 }}>
                      {item.year ? <Text style={vd.cardYear}>{item.year}</Text> : null}
                      {item.rating && item.rating !== '0.0' && <View style={[vd.ratingPill, { backgroundColor: primaryColor + '22' }]}><Text style={[vd.ratingTxt, { color: primaryColor }]}>⭐ {item.rating}</Text></View>}
                    </View>
                  </View>
                </Animated.View>
              )}
            </Pressable>
          )}
        />
      )}

      {detailItem && (
        <Modal visible={detailOpen} animationType="slide" transparent={false}>
          <View style={{ flex: 1, backgroundColor: T.color.bg }}>
            <StatusBar hidden />
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {(detailItem.backdrop || detailItem.poster) && <Image source={{ uri: detailItem.backdrop ?? detailItem.poster }} style={vd.detailHero} contentFit="cover" cachePolicy="memory-disk" />}
              <View style={vd.detailGradient} />
              <TouchableOpacity style={vd.detailClose} onPress={() => setDetailOpen(false)}><Ionicons name="close-circle" size={36} color="#fff" /></TouchableOpacity>
              <View style={vd.detailBody}>
                <View style={{ flexDirection: 'row', gap: T.space.md, marginBottom: T.space.lg }}>
                  <Image source={{ uri: detailItem.poster }} style={vd.detailPoster} contentFit="cover" cachePolicy="memory-disk" />
                  <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <Text style={vd.detailTitle}>{detailItem.title}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: T.space.xs, marginTop: T.space.sm }}>
                      {detailItem.rating && detailItem.rating !== '0.0' && <GlassBadge label={`⭐ ${detailItem.rating}`} color={primaryColor} />}
                      {detailItem.year && <GlassBadge label={String(detailItem.year)} />}
                      <GlassBadge label="PELÍCULA" icon="film-outline" />
                    </View>
                  </View>
                </View>
                {detailItem.overview ? <Text style={vd.detailOverview}>{detailItem.overview}</Text> : null}
                <View style={{ flexDirection: 'row', gap: T.space.sm, marginTop: T.space.lg }}>
                  {detailItem.streamUrl && (
                    <TouchableOpacity style={[vd.detailBtn, { backgroundColor: primaryColor, flex: 1 }]} onPress={() => reproducir(detailItem)}>
                      <Ionicons name="play" size={18} color="#fff" /><Text style={vd.detailBtnTxt}>Reproducir</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[vd.detailBtn, { backgroundColor: watchlist.includes(detailItem.id) ? primaryColor : T.color.surfaceElevated, flex: 1 }]} onPress={() => toggleWatchlist(detailItem.id)}>
                    <Ionicons name={watchlist.includes(detailItem.id) ? 'checkmark' : 'add'} size={18} color="#fff" /><Text style={vd.detailBtnTxt}>{watchlist.includes(detailItem.id) ? 'En mi lista' : 'Mi lista'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: T.space.sm, marginTop: T.space.md }}>
                  <TouchableOpacity style={[vd.detailBtn, { backgroundColor: T.color.surfaceElevated, flex: 1 }]} onPress={() => startDownloadItem(detailItem)}><Ionicons name="download-outline" size={18} color="#fff" /><Text style={vd.detailBtnTxt}>Descargar</Text></TouchableOpacity>
                  <TouchableOpacity style={[vd.detailBtn, { backgroundColor: T.color.surfaceElevated, flex: 1 }]} onPress={() => handleLongPress(detailItem)}><Ionicons name="play-circle-outline" size={18} color="#fff" /><Text style={vd.detailBtnTxt}>Tráiler</Text></TouchableOpacity>
                </View>
                {downloadingItem && (
                  <View style={{ marginTop: T.space.md }}>
                    <Text style={{ color: T.color.textSecondary, marginBottom: 4 }}>{downloadingItem.status === 'downloading' ? 'Descargando...' : downloadingItem.status === 'completed' ? 'Completado' : 'Error'}</Text>
                    <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 }}><View style={{ height: '100%', width: `${downloadingItem.progress * 100}%`, backgroundColor: primaryColor, borderRadius: 2 }} /></View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
      <TrailerModal visible={trailerVisible} videoKey={trailerKey} onClose={() => setTrailerVisible(false)} />
    </View>
  );
});

/* ═══════════════════════════════════════════════════════════
   SERIES (con AnimatedCard en la cuadrícula)
═══════════════════════════════════════════════════════════ */
const SeriesPlayerSection = memo(({ primaryColor, plexShows, loadingPlex, onCargarPlex, activeProfile, updateProfile, continueWatching, addToContinueWatching }: {
  primaryColor: string; plexShows: PlexShow[]; loadingPlex: boolean; onCargarPlex: (force?: boolean) => void;
  activeProfile: Profile; updateProfile: (p: Profile) => void; continueWatching: ContinueWatchingItem[]; addToContinueWatching: (item: ContinueWatchingItem) => void;
}) => {
  const [vodUrl, setVodUrl] = useState<string | null>(null);
  const [vodEpisode, setVodEpisode] = useState<PlexEpisode | null>(null);
  const [vodShow, setVodShow] = useState<PlexShow | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<'shows' | 'detail' | 'tmdb_popular' | 'tmdb_top'>('shows');
  const [selectedShow, setSelectedShow] = useState<PlexShow | null>(null);
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [tmdbItems, setTmdbItems] = useState<MediaItem[]>(SERIES_FALLBACK); // AHORA ESTÁ DEFINIDO
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [tmdbPage, setTmdbPage] = useState(1);
  const [watchlist, setWatchlist] = useState<string[]>(activeProfile.watchlistSeries);
  const [busqueda, setBusqueda] = useState('');
  const [genres, setGenres] = useState<any[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'rating'>('title');
  const [downloadingItem, setDownloadingItem] = useState<DownloadItem | null>(null);

  useEffect(() => { if (view === 'shows' && plexShows.length === 0 && !loadingPlex) onCargarPlex(); fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${TMDB_API_KEY}&language=es`).then(r => r.json()).then(d => setGenres(d.genres || [])); }, [view]);

  const fetchTmdb = async (cat: string, page: number) => {
    setLoadingTmdb(true);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${cat}?api_key=${TMDB_API_KEY}&language=es&page=${page}`);
      const data = await res.json();
      const formatted: MediaItem[] = (data.results || []).map((m: any) => ({ id: m.id.toString(), title: m.name, poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`, backdrop: `https://image.tmdb.org/t/p/w780${m.backdrop_path}`, year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined, rating: m.vote_average?.toFixed(1) ?? '0.0', overview: m.overview, type: 'tv' as const, genreIds: m.genre_ids || [] }));
      if (page === 1) setTmdbItems(formatted); else setTmdbItems(prev => [...prev, ...formatted]);
    } catch { if (page === 1) setTmdbItems(SERIES_FALLBACK); } finally { setLoadingTmdb(false); }
  };

  const toggleGenre = (genreId: number) => { setSelectedGenres(prev => prev.includes(genreId) ? prev.filter(g => g !== genreId) : [...prev, genreId]); };

  let showsFiltrados = plexShows.filter(s => s.title.toLowerCase().includes(busqueda.toLowerCase()));
  if (selectedGenres.length > 0) showsFiltrados = showsFiltrados.filter(s => s.genreIds?.some(g => selectedGenres.includes(g)));
  showsFiltrados.sort((a, b) => { if (sortBy === 'title') return a.title.localeCompare(b.title); if (sortBy === 'year') return (b.year || 0) - (a.year || 0); return parseFloat(b.rating || '0') - parseFloat(a.rating || '0'); });

  const getEpisodeList = (): PlexEpisode[] => { if (!selectedShow) return []; return selectedShow.seasons.flatMap(s => s.episodes); };
  const currentEpIndex = vodEpisode ? getEpisodeList().findIndex(e => e.id === vodEpisode.id) : -1;

  const reproducirEpisodio = (ep: PlexEpisode, show: PlexShow) => { if (!ep.streamUrl) { Alert.alert('Error', 'No se pudo obtener la URL de reproducción.'); return; } setVodUrl(ep.streamUrl); setVodEpisode(ep); setVodShow(show); setProgress(0); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setFullscreen(true); };
  const episodioSiguiente = () => { const list = getEpisodeList(); if (currentEpIndex < list.length - 1 && vodShow) reproducirEpisodio(list[currentEpIndex + 1], vodShow); };
  const episodioAnterior = () => { if (currentEpIndex > 0 && vodShow) reproducirEpisodio(getEpisodeList()[currentEpIndex - 1], vodShow); };
  const cerrarVod = () => { setVodUrl(null); setVodEpisode(null); setVodShow(null); setFullscreen(false); setProgress(0); };
  const abrirShow = (show: PlexShow) => { setSelectedShow(show); setActiveSeason(show.seasons[0]?.number ?? 1); setView('detail'); };
  const toggleWatchlist = (id: string) => { const newWatchlist = watchlist.includes(id) ? watchlist.filter(w => w !== id) : [...watchlist, id]; setWatchlist(newWatchlist); updateProfile({ ...activeProfile, watchlistSeries: newWatchlist }); };
  const startDownloadEpisode = async (ep: PlexEpisode) => { if (!ep.streamUrl) return; setDownloadingItem({ id: ep.id, title: ep.title, poster: ep.poster || 'https://via.placeholder.com/500x750.png?text=Episodio', streamUrl: ep.streamUrl, progress: 0, status: 'downloading' }); try { const localUri = await startDownload({ id: ep.id, title: ep.title, poster: ep.poster || '', streamUrl: ep.streamUrl } as MediaItem, (p) => { setDownloadingItem(prev => prev ? { ...prev, progress: p } : null); }); setDownloadingItem(prev => prev ? { ...prev, status: 'completed', localUri } : null); } catch { setDownloadingItem(prev => prev ? { ...prev, status: 'error' } : null); } };

  const getItemLayout = useCallback((_data: any, index: number) => ({ length: CARD_H + T.space.md, offset: (CARD_H + T.space.md) * Math.floor(index / MEDIA_COLS), index }), []);

  if (fullscreen && vodUrl && vodEpisode && vodShow) {
    return (
      <FullscreenPlayer url={vodUrl} title={vodShow.title} subtitle={`${vodEpisode.code} · ${vodEpisode.title}`} primaryColor={primaryColor} onClose={() => setFullscreen(false)}
        onNext={currentEpIndex < getEpisodeList().length - 1 ? episodioSiguiente : undefined} onPrev={currentEpIndex > 0 ? episodioAnterior : undefined} onError={cerrarVod}
        itemInfo={{ id: vodEpisode.id, title: vodEpisode.title, poster: vodShow.poster, progress: 0, duration: 0, type: 'episode', streamUrl: vodEpisode.streamUrl, showId: vodShow.id, showName: vodShow.title, episodeCode: vodEpisode.code, profileId: activeProfile.id }}
        onProgress={(cur, dur) => { if (vodShow && vodEpisode && dur > 0) addToContinueWatching({ id: vodEpisode.id, title: vodEpisode.title, poster: vodShow.poster, progress: cur, duration: dur, type: 'episode', streamUrl: vodEpisode.streamUrl, showId: vodShow.id, showName: vodShow.title, episodeCode: vodEpisode.code, profileId: activeProfile.id, watchedAt: Date.now() }); }} />
    );
  }

  if (view === 'detail' && selectedShow) {
    const currentSeasonData = selectedShow.seasons.find(s => s.number === activeSeason);
    return (
      <View style={{ flex: 1 }}>
        {vodUrl && vodEpisode && !fullscreen && (
          <MiniPlayerBar title={vodShow?.title ?? ''} subtitle={`${vodEpisode.code} · ${vodEpisode.title}`} poster={vodShow?.poster} primaryColor={primaryColor} progress={progress} onExpand={() => setFullscreen(true)} onClose={cerrarVod} />
        )}
        <ScrollView style={{ flex: 1 }} stickyHeaderIndices={[1]}>
          <View style={px.heroWrap}>
            {selectedShow.backdrop || selectedShow.poster ? <Image source={{ uri: selectedShow.backdrop ?? selectedShow.poster }} style={px.heroImage} contentFit="cover" cachePolicy="memory-disk" /> : null}
            <View style={px.heroGrad} />
            <TouchableOpacity style={px.backBtn} onPress={() => setView('shows')}><Ionicons name="chevron-back" size={22} color="#fff" /><Text style={px.backTxt}>Series</Text></TouchableOpacity>
            <View style={px.heroInfo}>
              <Image source={{ uri: selectedShow.poster }} style={px.heroPoster} contentFit="cover" cachePolicy="memory-disk" />
              <View style={{ flex: 1, paddingLeft: T.space.md }}>
                <Text style={px.heroTitle} numberOfLines={2}>{selectedShow.title}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: T.space.xs, marginTop: T.space.sm }}>
                  {selectedShow.rating && <GlassBadge label={`⭐ ${selectedShow.rating}`} color={primaryColor} />}
                  {selectedShow.year && <GlassBadge label={String(selectedShow.year)} />}
                  <GlassBadge label={`${selectedShow.seasons.length} temp.`} icon="layers-outline" color={primaryColor} />
                </View>
                {selectedShow.overview ? <Text style={px.heroOverview} numberOfLines={3}>{selectedShow.overview}</Text> : null}
              </View>
            </View>
          </View>
          <View style={px.seasonBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
              {selectedShow.seasons.map(s => (
                <TouchableOpacity key={s.number} onPress={() => { setActiveSeason(s.number); Haptics.selectionAsync(); }} style={[px.seasonChip, activeSeason === s.number && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                  <Ionicons name="layers-outline" size={12} color={activeSeason === s.number ? '#fff' : T.color.textMuted} style={{ marginRight: 4 }} />
                  <Text style={[px.seasonChipTxt, activeSeason === s.number && { color: '#fff', fontWeight: T.font.bold }]}>T{s.number}</Text>
                  <Text style={[px.seasonChipCount, activeSeason === s.number && { color: 'rgba(255,255,255,0.7)' }]}>{s.episodes.length} ep.</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {currentSeasonData ? (
            <View style={{ paddingHorizontal: T.space.lg, paddingBottom: 40 }}>
              <Text style={px.episodesSectionLabel}>{currentSeasonData.label} — {currentSeasonData.episodes.length} episodios</Text>
              {currentSeasonData.episodes.map(ep => {
                const playing = vodEpisode?.id === ep.id;
                return (
                  <TouchableOpacity key={ep.id} style={[px.episodeRow, playing && { borderColor: primaryColor, backgroundColor: T.color.surfaceElevated }]} onPress={() => reproducirEpisodio(ep, selectedShow)} activeOpacity={0.78}>
                    <View style={[px.epCodeBadge, { backgroundColor: playing ? primaryColor : T.color.surfaceHigh }]}>{playing ? <Ionicons name="play" size={12} color="#fff" /> : <Text style={[px.epCode, { color: primaryColor }]}>{ep.code}</Text>}</View>
                    <View style={px.epThumb}>
                      {ep.poster ? <Image source={{ uri: ep.poster }} style={px.epThumbImg} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[px.epThumbImg, { backgroundColor: T.color.surfaceHigh, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="play-circle-outline" size={24} color={T.color.textMuted} /></View>}
                      {playing && <View style={[px.epThumbPlay, { backgroundColor: primaryColor }]}><Ionicons name="play" size={10} color="#fff" /></View>}
                    </View>
                    <View style={{ flex: 1, marginLeft: T.space.sm }}>
                      <Text style={[px.epTitle, playing && { color: primaryColor }]} numberOfLines={1}>{ep.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.sm, marginTop: 3 }}>{ep.airDate && <Text style={px.epMeta}>{ep.airDate.slice(0, 7)}</Text>}{ep.runtime && <Text style={px.epMeta}>{ep.runtime} min</Text>}</View>
                      {ep.overview ? <Text style={px.epOverview} numberOfLines={2}>{ep.overview}</Text> : null}
                    </View>
                    <TouchableOpacity style={[px.epPlayBtn, { backgroundColor: playing ? primaryColor : T.color.glassWhite, borderColor: playing ? primaryColor : T.color.glassBorder }]} onPress={() => reproducirEpisodio(ep, selectedShow)}><Ionicons name="play" size={14} color={playing ? '#fff' : T.color.textSecondary} /></TouchableOpacity>
                    <TouchableOpacity style={[px.epPlayBtn, { backgroundColor: T.color.surfaceElevated, marginLeft: T.space.sm }]} onPress={() => startDownloadEpisode(ep)}><Ionicons name="download-outline" size={14} color={T.color.textSecondary} /></TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  if (view === 'tmdb_popular' || view === 'tmdb_top') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={lv.catRow} contentContainerStyle={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
            {TAB_OPTIONS.map(({ key, label, icon }) => (
              <TouchableOpacity key={key} onPress={() => { setView(key); setTmdbPage(1); }} style={[lv.catChip, view === key && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                <Ionicons name={icon} size={13} color={view === key ? '#fff' : T.color.textMuted} style={{ marginRight: 4 }} /><Text style={[lv.catTxt, view === key && { color: '#fff', fontWeight: T.font.bold }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <FilterBar genres={genres} selectedGenres={selectedGenres} onToggleGenre={toggleGenre} sortBy={sortBy} onSortChange={setSortBy} primaryColor={primaryColor} />
        {loadingTmdb ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={primaryColor} /></View>
        ) : (
          <FlashList data={tmdbItems} keyExtractor={item => item.id} numColumns={MEDIA_COLS} estimatedItemSize={CARD_H + T.space.md} windowSize={5} maxToRenderPerBatch={10} removeClippedSubviews contentContainerStyle={{ paddingHorizontal: T.space.lg, paddingBottom: 24, paddingTop: T.space.sm }} onEndReached={() => { const next = tmdbPage + 1; setTmdbPage(next); fetchTmdb(view === 'tmdb_popular' ? 'popular' : 'top_rated', next); }} onEndReachedThreshold={0.5} renderItem={({ item }) => (
            <Pressable style={vd.card} onPress={() => {}}>
              {({ pressed }) => (
                <Animated.View style={[vd.cardInner, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                  <Image source={{ uri: item.poster }} style={vd.poster} contentFit="cover" cachePolicy="memory-disk" /><View style={vd.posterGradient} />
                  <View style={vd.cardBottom}>
                    <Text style={vd.cardTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginTop: 4 }}>{item.year ? <Text style={vd.cardYear}>{item.year}</Text> : null}{item.rating && item.rating !== '0.0' && <View style={[vd.ratingPill, { backgroundColor: primaryColor + '22' }]}><Text style={[vd.ratingTxt, { color: primaryColor }]}>⭐ {item.rating}</Text></View>}</View>
                  </View>
                </Animated.View>
              )}
            </Pressable>
          )} />
        )}
      </View>
    );
  }

  const TAB_OPTIONS = [{ key: 'shows', label: 'Mi Drive', icon: 'cloud-outline' as const }, { key: 'tmdb_popular', label: 'Populares', icon: 'flame-outline' as const }, { key: 'tmdb_top', label: 'Top Rated', icon: 'trophy-outline' as const }] as const;

  return (
    <View style={{ flex: 1 }}>
      {vodUrl && vodEpisode && !fullscreen && <MiniPlayerBar title={vodShow?.title ?? ''} subtitle={`${vodEpisode.code} · ${vodEpisode.title}`} poster={vodShow?.poster} primaryColor={primaryColor} progress={progress} onExpand={() => setFullscreen(true)} onClose={cerrarVod} />}
      {continueWatching.filter(i => i.type === 'episode').length > 0 && (
        <View style={cwa.section}>
          <Text style={cwa.sectionTitle}>CONTINUAR VIENDO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cwa.scroll}>
            {continueWatching.filter(i => i.type === 'episode').slice(0, 8).map(item => (
              <TouchableOpacity key={item.id} style={cwa.card} onPress={() => { const show = plexShows.find(s => s.id === item.showId); const ep = show?.seasons.flatMap(s => s.episodes).find(e => e.id === item.id); if (ep && show) { setVodUrl(ep.streamUrl); setVodEpisode(ep); setVodShow(show); setProgress(item.progress / item.duration); setFullscreen(true); } }}>
                <Image source={{ uri: item.poster }} style={cwa.poster} contentFit="cover" cachePolicy="memory-disk" />
                <View style={cwa.cardGradient}><Text style={cwa.title} numberOfLines={1}>{item.showName || item.title}</Text><Text style={cwa.subtitle}>{item.episodeCode}</Text><View style={cwa.progressTrack}><View style={[cwa.progressFill, { width: `${(item.progress / item.duration) * 100}%`, backgroundColor: primaryColor }]} /></View></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={lv.catRow} contentContainerStyle={{ paddingHorizontal: T.space.lg, gap: T.space.sm }}>
          {TAB_OPTIONS.map(({ key, label, icon }) => (
            <TouchableOpacity key={key} onPress={() => setView(key)} style={[lv.catChip, view === key && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
              <Ionicons name={icon} size={13} color={view === key ? '#fff' : T.color.textMuted} style={{ marginRight: 4 }} /><Text style={[lv.catTxt, view === key && { color: '#fff', fontWeight: T.font.bold }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={[lv.searchRow, { marginBottom: T.space.sm }]}>
        <Ionicons name="search" size={18} color={T.color.textMuted} style={{ marginRight: T.space.sm }} />
        <TextInput style={lv.searchInput} placeholder="Buscar serie..." placeholderTextColor={T.color.textMuted} value={busqueda} onChangeText={setBusqueda} />
        {busqueda !== '' && <TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={18} color={T.color.textMuted} /></TouchableOpacity>}
      </View>
      <FilterBar genres={genres} selectedGenres={selectedGenres} onToggleGenre={toggleGenre} sortBy={sortBy} onSortChange={setSortBy} primaryColor={primaryColor} />
      {loadingPlex ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={primaryColor} /><Text style={{ color: T.color.textMuted, marginTop: 12, fontSize: T.font.sm }}>Escaneando tu Drive…</Text></View>
      ) : showsFiltrados.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: T.space.xl }}>
          <Ionicons name="tv-outline" size={56} color={T.color.textMuted} />
          <Text style={{ color: T.color.textPrimary, marginTop: 16, fontSize: T.font.md, fontWeight: T.font.bold, textAlign: 'center' }}>Sin series encontradas</Text>
          <TouchableOpacity style={[vd.addBtnSmall, { backgroundColor: primaryColor, marginTop: T.space.lg, paddingHorizontal: T.space.xl }]} onPress={() => onCargarPlex(true)}><Text style={{ color: '#fff', fontWeight: T.font.bold }}>Reescanear Drive</Text></TouchableOpacity>
        </View>
      ) : (
        <FlashList data={showsFiltrados} keyExtractor={item => item.id} numColumns={MEDIA_COLS} estimatedItemSize={CARD_H + T.space.md} windowSize={5} maxToRenderPerBatch={10} removeClippedSubviews contentContainerStyle={{ paddingHorizontal: T.space.lg, paddingBottom: 24, paddingTop: T.space.xs }} refreshControl={<RefreshControl refreshing={loadingPlex} onRefresh={() => onCargarPlex(true)} tintColor={primaryColor} />}
          renderItem={({ item: show }) => {
            const totalEps = show.seasons.reduce((acc, s) => acc + s.episodes.length, 0); const playing = vodShow?.id === show.id;
            return (
              <Pressable style={[vd.card, playing && { borderColor: primaryColor }]} onPress={() => abrirShow(show)}>
                {({ pressed }) => (
                  <Animated.View style={[vd.cardInner, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
                    <Image source={{ uri: show.poster }} style={vd.poster} contentFit="cover" cachePolicy="memory-disk" /><View style={vd.posterGradient} />
                    {playing && <View style={[vd.playingBadge, { backgroundColor: primaryColor }]}><Ionicons name="play" size={10} color="#fff" /></View>}
                    <View style={px.showBadgeWrap}><View style={[px.showBadge, { backgroundColor: primaryColor }]}><Text style={px.showBadgeTxt}>{show.seasons.length}T</Text></View></View>
                    <View style={vd.cardBottom}>
                      <Text style={vd.cardTitle} numberOfLines={2}>{show.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginTop: 4 }}>{show.year ? <Text style={vd.cardYear}>{show.year}</Text> : null}<Text style={vd.cardYear}>· {totalEps} ep.</Text></View>
                      {show.rating && show.rating !== '0.0' && <View style={[vd.ratingPill, { backgroundColor: primaryColor + '22', marginTop: 4 }]}><Text style={[vd.ratingTxt, { color: primaryColor }]}>⭐ {show.rating}</Text></View>}
                    </View>
                  </Animated.View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
});

/* ═══════════════════════════════════════════════════════════
   NUEVA PANTALLA: HISTORIAL DE VISUALIZACIÓN (Dedicada)
═══════════════════════════════════════════════════════════ */
const HistoryScreen = memo(({ visible, onClose, data, primaryColor, onPlayItem }: { visible: boolean; onClose: () => void; data: ContinueWatchingItem[]; primaryColor: string; onPlayItem: (item: ContinueWatchingItem) => void; }) => {
  const sortedData = [...data].sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));

  const renderHistoryItem = ({ item }: { item: ContinueWatchingItem }) => (
    <Pressable style={hsItem.container} onPress={() => { onPlayItem(item); onClose(); }} android_ripple={{ color: primaryColor + '22' }}>
      <Image source={{ uri: item.poster }} style={hsItem.poster} contentFit="cover" cachePolicy="memory-disk" />
      <View style={{ flex: 1, marginLeft: T.space.md, justifyContent: 'center' }}>
        <Text style={hsItem.title} numberOfLines={1}>{item.showName || item.title}</Text>
        <Text style={hsItem.subtitle} numberOfLines={1}>{item.type === 'episode' ? item.episodeCode : 'Película'}</Text>
        <View style={hsItem.progressContainer}>
          <View style={[hsItem.progressFill, { width: `${Math.min((item.progress / item.duration) * 100, 100)}%`, backgroundColor: primaryColor }]} />
        </View>
        <Text style={hsItem.date}>{new Date(item.watchedAt || Date.now()).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={hsItem.modalRoot}>
        <StatusBar barStyle="light-content" backgroundColor={T.color.bg} />
        <View style={hsItem.header}>
          <TouchableOpacity onPress={onClose} style={hsItem.closeBtn}><Ionicons name="chevron-back" size={28} color="#fff" /></TouchableOpacity>
          <Text style={hsItem.headerTitle}>Historial de Visualización</Text>
          <View style={{ width: 40 }} />
        </View>
        {sortedData.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="time-outline" size={64} color={T.color.textMuted} />
            <Text style={{ color: T.color.textMuted, marginTop: T.space.md, fontSize: T.font.md }}>Aún no has visto nada.</Text>
          </View>
        ) : (
          <FlashList data={sortedData} keyExtractor={item => item.id} estimatedItemSize={80} renderItem={renderHistoryItem} contentContainerStyle={{ paddingHorizontal: T.space.lg, paddingTop: T.space.md, paddingBottom: 40 }} />
        )}
      </View>
    </Modal>
  );
});

const hsItem = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: T.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.md, paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingBottom: T.space.md, borderBottomWidth: 1, borderBottomColor: T.color.glassBorder },
  headerTitle: { color: '#fff', fontSize: T.font.lg, fontWeight: T.font.bold, letterSpacing: 0.5 },
  closeBtn: { padding: T.space.xs },
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: T.space.md, backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.lg, padding: T.space.sm, borderWidth: 1, borderColor: T.color.glassBorder },
  poster: { width: 60, height: 40, borderRadius: T.radius.sm },
  title: { color: '#fff', fontSize: T.font.base, fontWeight: T.font.semibold },
  subtitle: { color: T.color.textMuted, fontSize: T.font.sm, marginBottom: 4 },
  progressContainer: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 1.5, marginTop: 2, width: '100%' },
  progressFill: { height: '100%', borderRadius: 1.5 },
  date: { color: T.color.textMuted, fontSize: T.font.xs, marginTop: 4 },
});

/* ═══════════════════════════════════════════════════════════
   AJUSTES
═══════════════════════════════════════════════════════════ */
const AjustesSection = ({ primaryColor, accentColor, setAccentColor, onRefreshChannels, onShowStats, onShowHistory }: any) => {
  const [appId, setAppId] = useState('');
  useEffect(() => { AsyncStorage.getItem('appId').then(id => { const newId = id || ('NXTV-' + Math.random().toString(36).substr(2, 6).toUpperCase()); AsyncStorage.setItem('appId', newId); setAppId(newId); }); }, []);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={aj.sectionTitle}>Personalización</Text>
      <View style={aj.card}>
        <Text style={aj.label}>Color de acento</Text>
        <View style={{ flexDirection: 'row', gap: T.space.sm, marginTop: T.space.md }}>
          {Object.entries(ACCENT_COLORS).map(([key, color]) => (
            <TouchableOpacity key={key} onPress={() => setAccentColor(key)} style={[aj.colorDot, { backgroundColor: color }, accentColor === key && aj.colorDotActive]}>{accentColor === key && <Ionicons name="checkmark" size={14} color="#fff" />}</TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={aj.sectionTitle}>Tu Cuenta</Text>
      <TouchableOpacity style={aj.card} onPress={onShowHistory}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={aj.label}>Historial de visualización</Text><Ionicons name="time" size={20} color={primaryColor} /></View>
      </TouchableOpacity>
      <Text style={aj.sectionTitle}>Canales</Text>
      <TouchableOpacity style={aj.card} onPress={onRefreshChannels}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={aj.label}>Actualizar lista M3U</Text><Ionicons name="refresh" size={20} color={primaryColor} /></View>
      </TouchableOpacity>
      <Text style={aj.sectionTitle}>Estadísticas</Text>
      <TouchableOpacity style={aj.card} onPress={onShowStats}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={aj.label}>Estadísticas de visualización</Text><Ionicons name="stats-chart" size={20} color={primaryColor} /></View>
      </TouchableOpacity>
      <Text style={aj.sectionTitle}>Reproducción</Text>
      <View style={aj.card}><Text style={aj.label}>Pantalla completa automática</Text><Text style={[aj.value, { marginTop: 4, fontSize: T.font.xs, lineHeight: 18 }]}>Al reproducir contenido, el reproductor rota automáticamente a landscape y ocupa toda la pantalla.</Text></View>
      <Text style={aj.sectionTitle}>Streaming Drive</Text>
      <View style={aj.card}><Text style={aj.label}>Método de reproducción</Text><Text style={[aj.value, { marginTop: 4, fontSize: T.font.xs, lineHeight: 18 }]}>Los archivos de Google Drive se reproducen via API directa (alt=media) compatible con el reproductor nativo.</Text></View>
      <Text style={aj.sectionTitle}>Información</Text>
      <View style={aj.card}><Text style={aj.label}>Identificador de dispositivo</Text><Text style={[aj.value, { color: primaryColor, marginTop: 6, fontSize: T.font.sm }]} selectable>{appId}</Text></View>
      <View style={aj.card}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={aj.label}>Versión</Text><Text style={aj.value}>7.0.0</Text></View></View>
      <View style={aj.card}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={aj.label}>Plataforma</Text><Text style={aj.value}>{Platform.OS.toUpperCase()} {IS_TV ? '· TV' : IS_TABLET ? '· Tablet' : '· Móvil'}</Text></View></View>
    </ScrollView>
  );
};

/* ═══════════════════════════════════════════════════════════
   NUEVOS COMPONENTES
═══════════════════════════════════════════════════════════ */
const GlobalSearch = memo(({ visible, onClose, primaryColor, listaCanales, driveMovies, plexShows }: { visible: boolean; onClose: () => void; primaryColor: string; listaCanales: Canal[]; driveMovies: MediaItem[]; plexShows: PlexShow[]; }) => {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { setQuery(''); setResults([]); }, [visible]);
  const performSearch = useCallback(async (text: string) => {
    if (text.length < 2) { setResults([]); return; } setLoading(true); const q = text.toLowerCase(); const combined: SearchResult[] = [];
    listaCanales.filter(c => c.name.toLowerCase().includes(q)).forEach(c => { combined.push({ id: c.id, title: c.name, poster: c.logo, type: 'channel', source: c }); });
    driveMovies.filter(m => m.title.toLowerCase().includes(q)).forEach(m => { combined.push({ id: m.id, title: m.title, poster: m.poster, type: 'movie', source: m }); });
    plexShows.filter(s => s.title.toLowerCase().includes(q)).forEach(s => { combined.push({ id: s.id, title: s.title, poster: s.poster, type: 'tv', source: s }); });
    try { const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=es&query=${encodeURIComponent(q)}`); const data = await res.json(); (data.results || []).slice(0,5).forEach((m:any) => { combined.push({ id:`tmdb_m_${m.id}`, title:m.title, poster:`https://image.tmdb.org/t/p/w500${m.poster_path}`, type:'tmdb_movie', source:m }); }); } catch {}
    try { const res = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=es&query=${encodeURIComponent(q)}`); const data = await res.json(); (data.results || []).slice(0,5).forEach((s:any) => { combined.push({ id:`tmdb_t_${s.id}`, title:s.name, poster:`https://image.tmdb.org/t/p/w500${s.poster_path}`, type:'tmdb_tv', source:s }); }); } catch {}
    setResults(combined); setLoading(false);
  }, [listaCanales, driveMovies, plexShows]);
  useEffect(() => { const timer = setTimeout(() => performSearch(query), 300); return () => clearTimeout(timer); }, [query]);
  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={gs.resultRow} onPress={() => { Alert.alert(`Ir a ${item.title}`); onClose(); }}>
      <Image source={{ uri: item.poster || 'https://via.placeholder.com/50' }} style={gs.resultPoster} contentFit="cover" cachePolicy="memory-disk" />
      <View style={{ flex:1 }}><Text style={gs.resultTitle} numberOfLines={1}>{item.title}</Text><Text style={gs.resultSub}>{item.type.replace('_',' ')}</Text></View>
    </TouchableOpacity>
  );
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={gs.container}>
        <View style={gs.header}>
          <TextInput style={gs.input} placeholder="Buscar en toda la app..." placeholderTextColor="#666" value={query} onChangeText={setQuery} autoFocus />
          <TouchableOpacity style={gs.closeBtn} onPress={onClose}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
        </View>
        {loading ? <ActivityIndicator style={{ marginTop:20 }} color={primaryColor} /> : (
          <FlashList data={results} keyExtractor={item => item.id} estimatedItemSize={70} renderItem={renderItem} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal:T.space.md }} />
        )}
      </View>
    </Modal>
  );
});

const TrailerModal = ({ visible, videoKey, onClose }: { visible: boolean; videoKey?: string; onClose: () => void }) => {
  if (!videoKey) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={tr.modalBackdrop} onPress={onClose}>
        <View style={tr.playerContainer}>
          <YoutubePlayer height={H*0.4} width={W*0.9} play={visible} videoId={videoKey} apiKey={YOUTUBE_API_KEY} onChangeState={(state) => { if (state === 'ended') onClose(); }} />
        </View>
        <TouchableOpacity style={tr.closeBtn} onPress={onClose}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
      </Pressable>
    </Modal>
  );
};

const StatsScreen = ({ continueWatching, primaryColor }: { continueWatching: ContinueWatchingItem[]; primaryColor: string }) => {
  const totalMinutes = continueWatching.reduce((acc, item) => acc + (item.progress / 60), 0);
  const totalHours = Math.round(totalMinutes / 60);
  const moviesWatched = continueWatching.filter(i => i.type === 'movie').length;
  const episodesWatched = continueWatching.filter(i => i.type === 'episode').length;
  const uniqueDays = new Set(continueWatching.map(i => i.watchedAt ? new Date(i.watchedAt).toDateString() : null)).size;
  return (
    <ScrollView style={{ flex:1, padding:T.space.lg }}>
      <Text style={[aj.sectionTitle, { marginTop:0 }]}>ESTADÍSTICAS DE VISUALIZACIÓN</Text>
      <View style={st.card}><Ionicons name="time-outline" size={24} color={primaryColor} /><Text style={st.value}>{totalHours} horas</Text><Text style={st.label}>Tiempo total visto</Text></View>
      <View style={st.card}><Ionicons name="film-outline" size={24} color={primaryColor} /><Text style={st.value}>{moviesWatched}</Text><Text style={st.label}>Películas iniciadas</Text></View>
      <View style={st.card}><Ionicons name="tv-outline" size={24} color={primaryColor} /><Text style={st.value}>{episodesWatched}</Text><Text style={st.label}>Episodios iniciados</Text></View>
      <View style={st.card}><Ionicons name="flame-outline" size={24} color={primaryColor} /><Text style={st.value}>{uniqueDays}</Text><Text style={st.label}>Días distintos con actividad</Text></View>
    </ScrollView>
  );
};

const ComingSoonSection = memo(({ primaryColor }: { primaryColor: string }) => {
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [series, setSeries] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        const [mRes, tRes] = await Promise.all([fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=es&page=1`), fetch(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${TMDB_API_KEY}&language=es&page=1`)]);
        const mData = await mRes.json(); const tData = await tRes.json();
        const formatMovie = (m:any) => ({ id:m.id.toString(), title:m.title, poster:`https://image.tmdb.org/t/p/w500${m.poster_path}`, backdrop:`https://image.tmdb.org/t/p/w780${m.backdrop_path}`, releaseDate:m.release_date, overview:m.overview, type:'movie' as const, genreIds:m.genre_ids||[] });
        const formatShow = (s:any) => ({ id:s.id.toString(), title:s.name, poster:`https://image.tmdb.org/t/p/w500${s.poster_path}`, backdrop:`https://image.tmdb.org/t/p/w780${s.backdrop_path}`, releaseDate:s.first_air_date, overview:s.overview, type:'tv' as const, genreIds:s.genre_ids||[] });
        setMovies((mData.results||[]).slice(0,10).map(formatMovie)); setSeries((tData.results||[]).slice(0,10).map(formatShow));
      } catch {} setLoading(false);
    };
    fetchUpcoming();
  }, []);
  const scheduleReminder = (title:string) => { Alert.alert('Recordatorio', `Te avisaremos del estreno de "${title}" (funcionalidad completa en build de desarrollo).`); };
  const renderItem = (item:MediaItem) => (
    <TouchableOpacity key={item.id} style={hs.miniPosterCard} onLongPress={() => scheduleReminder(item.title)}>
      <Image source={{ uri: item.poster }} style={hs.miniPoster} contentFit="cover" cachePolicy="memory-disk" />
      <Text style={hs.miniTitle} numberOfLines={1}>{item.title}</Text>
      {(item as any).releaseDate && <Text style={hs.miniDate}>{new Date((item as any).releaseDate).toLocaleDateString('es-ES', { month:'short', day:'numeric' })}</Text>}
    </TouchableOpacity>
  );
  if (loading) return <ActivityIndicator style={{ margin:20 }} color={primaryColor} />;
  return (
    <View style={{ marginTop:20 }}>
      <Text style={cwa.sectionTitle}>PRÓXIMAMENTE - PELÍCULAS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:T.space.lg, gap:T.space.sm }}>{movies.map(renderItem)}</ScrollView>
      <Text style={[cwa.sectionTitle, { marginTop:16 }]}>PRÓXIMAMENTE - SERIES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:T.space.lg, gap:T.space.sm }}>{series.map(renderItem)}</ScrollView>
    </View>
  );
});

const HomeSection = memo(({ primaryColor, activeProfile, continueWatching, onNavigateToTab, onOpenSearch }: { primaryColor:string; activeProfile:Profile; continueWatching:ContinueWatchingItem[]; onNavigateToTab:(tabIndex:number)=>void; onOpenSearch:()=>void; }) => {
  const [featured, setFeatured] = useState<MediaItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  useEffect(() => {
    fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=es&page=1`)
      .then(r => r.json()).then(d => { const items = (d.results||[]).slice(0,10).map((m:any)=>({ id:m.id.toString(), title:m.title, poster:`https://image.tmdb.org/t/p/w500${m.poster_path}`, backdrop:`https://image.tmdb.org/t/p/w780${m.backdrop_path}`, year:m.release_date?new Date(m.release_date).getFullYear():undefined, rating:m.vote_average?.toFixed(1), overview:m.overview, type:'movie' as const, genreIds:m.genre_ids||[] })); setFeatured(items); }).catch(()=>setFeatured(MOVIES_FALLBACK)).finally(()=>setLoadingFeatured(false));
  }, []);
  const heroItem = featured[0];
  return (
    <ScrollView style={{ flex:1 }} showsVerticalScrollIndicator={false}>
      {heroItem && (
        <TouchableOpacity style={hs.hero} onPress={() => onNavigateToTab(1)} activeOpacity={0.9}>
          <Image source={{ uri:heroItem.backdrop||heroItem.poster }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          <LinearGradient colors={['transparent','rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
          <View style={hs.heroContent}>
            <Text style={hs.heroTitle}>{heroItem.title}</Text>
            <Text style={hs.heroSub}>{heroItem.overview?.slice(0,120)}...</Text>
            <TouchableOpacity style={[hs.heroBtn,{backgroundColor:primaryColor}]} onPress={() => onNavigateToTab(1)}><Ionicons name="play" size={20} color="#fff" /><Text style={hs.heroBtnText}>Reproducir</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
      <View style={hs.quickRow}>
        <TouchableOpacity style={hs.quickBtn} onPress={()=>onNavigateToTab(2)}><Ionicons name="tv" size={28} color={primaryColor} /><Text style={hs.quickLabel}>TV en Vivo</Text></TouchableOpacity>
        <TouchableOpacity style={hs.quickBtn} onPress={()=>onNavigateToTab(1)}><Ionicons name="film" size={28} color={primaryColor} /><Text style={hs.quickLabel}>Películas</Text></TouchableOpacity>
        <TouchableOpacity style={hs.quickBtn} onPress={()=>onNavigateToTab(3)}><Ionicons name="videocam" size={28} color={primaryColor} /><Text style={hs.quickLabel}>Series</Text></TouchableOpacity>
        <TouchableOpacity style={hs.quickBtn} onPress={onOpenSearch}><Ionicons name="search" size={28} color={primaryColor} /><Text style={hs.quickLabel}>Buscar</Text></TouchableOpacity>
      </View>
      {continueWatching.length > 0 && (
        <View style={cwa.section}>
          <Text style={cwa.sectionTitle}>CONTINUAR VIENDO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cwa.scroll}>
            {continueWatching.map(item => (
              <TouchableOpacity key={item.id} style={cwa.card} onPress={()=>onNavigateToTab(item.type==='movie'?1:3)}>
                <Image source={{ uri:item.poster }} style={cwa.poster} contentFit="cover" cachePolicy="memory-disk" />
                <View style={cwa.cardGradient}><Text style={cwa.title} numberOfLines={1}>{item.showName||item.title}</Text><View style={cwa.progressTrack}><View style={[cwa.progressFill,{width:`${(item.progress/item.duration)*100}%`, backgroundColor:primaryColor}]} /></View></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <ComingSoonSection primaryColor={primaryColor} />
      <View style={{ marginTop:20, paddingLeft:T.space.lg }}>
        <Text style={cwa.sectionTitle}>PELÍCULAS POPULARES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:T.space.sm }}>
          {featured.slice(0,8).map(movie => (
            <TouchableOpacity key={movie.id} onPress={()=>onNavigateToTab(1)}><Image source={{ uri:movie.poster }} style={hs.miniPoster} contentFit="cover" cachePolicy="memory-disk" /></TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={{ height:40 }} />
    </ScrollView>
  );
});

const ProfileSelectScreen = memo(({ profiles, activeProfileId, onSelect, onAdd, onDelete, onManage }: { profiles:Profile[]; activeProfileId:string; onSelect:(id:string)=>void; onAdd:(name:string,color:string)=>void; onDelete:(id:string)=>void; onManage:()=>void; }) => {
  const [addModal, setAddModal] = useState(false); const [newName, setNewName] = useState(''); const [newColor, setNewColor] = useState('red'); const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null);
  const handleAdd = () => { if (newName.trim().length<1) { Alert.alert('Nombre obligatorio'); return; } onAdd(newName.trim(), newColor); setNewName(''); setNewColor('red'); setAddModal(false); };
  return (
    <View style={ps.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0B0B0F','#1A1A2E']} style={StyleSheet.absoluteFill} />
      <View style={ps.content}>
        <Text style={ps.title}>¿Quién está viendo?</Text>
        <View style={ps.grid}>
          {profiles.map(profile => (
            <TouchableOpacity key={profile.id} style={ps.profileCard} onPress={()=>onSelect(profile.id)} onLongPress={()=>profiles.length>1&&setDeleteConfirm(profile.id)} activeOpacity={0.7}>
              <View style={[ps.avatar,{backgroundColor:ACCENT_COLORS[profile.accentColor]||'#E50914'}]}><Text style={ps.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text></View>
              <Text style={ps.profileName} numberOfLines={1}>{profile.name}</Text>
              {profile.id===activeProfileId && <View style={ps.activeDot} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={ps.profileCard} onPress={()=>setAddModal(true)}>
            <View style={ps.addIcon}><Ionicons name="add" size={40} color="rgba(255,255,255,0.4)" /></View>
            <Text style={ps.addLabel}>Agregar perfil</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={ps.manageBtn} onPress={onManage}><Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.6)" /><Text style={ps.manageText}>Administrar perfiles</Text></TouchableOpacity>
      <Modal visible={addModal} transparent animationType="fade">
        <View style={ps.modalOverlay}><View style={ps.modalContent}>
          <Text style={ps.modalTitle}>Nuevo perfil</Text>
          <TextInput style={ps.modalInput} placeholder="Nombre" placeholderTextColor="#666" value={newName} onChangeText={setNewName} maxLength={20} autoFocus />
          <Text style={ps.modalSubtitle}>Color</Text>
          <View style={ps.colorRow}>{Object.entries(ACCENT_COLORS).map(([key,color])=>(<TouchableOpacity key={key} onPress={()=>setNewColor(key)} style={[ps.colorCircle,{backgroundColor:color},newColor===key&&ps.colorSelected]} />))}</View>
          <View style={ps.modalActions}>
            <TouchableOpacity style={ps.modalBtn} onPress={()=>setAddModal(false)}><Text style={ps.modalBtnText}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[ps.modalBtn,ps.modalBtnPrimary]} onPress={handleAdd}><Text style={ps.modalBtnTextPrimary}>Crear</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
      <Modal visible={!!deleteConfirm} transparent animationType="fade">
        <View style={ps.modalOverlay}><View style={ps.modalContent}>
          <Text style={ps.modalTitle}>Eliminar perfil</Text>
          <Text style={ps.modalText}>¿Estás seguro? Esta acción no se puede deshacer.</Text>
          <View style={ps.modalActions}>
            <TouchableOpacity style={ps.modalBtn} onPress={()=>setDeleteConfirm(null)}><Text style={ps.modalBtnText}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[ps.modalBtn,ps.modalBtnPrimary,{backgroundColor:'#E50914'}]} onPress={()=>{if(deleteConfirm)onDelete(deleteConfirm);setDeleteConfirm(null);}}><Text style={ps.modalBtnTextPrimary}>Eliminar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
});

/* ═══════════════════════════════════════════════════════════
   APP PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [splash, setSplash] = useState(true);
  const [profileSelection, setProfileSelection] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const { profiles, activeProfile, activeProfileId, setActiveProfileId, updateProfile, addProfile, deleteProfile } = useProfiles();
  const [listaCanales, setListaCanales] = useState<Canal[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = usePersistedState<string[]>('favorites', []);
  const [driveMovies, setDriveMovies] = useState<MediaItem[]>([]);
  const [loadingDriveMovies, setLoadingDriveMovies] = useState(false);
  const [plexShows, setPlexShows] = useState<PlexShow[]>([]);
  const [loadingPlex, setLoadingPlex] = useState(false);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const driveMoviesLoaded = useRef(false); const plexLoaded = useRef(false);
  const primaryColor = ACCENT_COLORS[activeProfile.accentColor] || ACCENT_COLORS.red;
  const cargaEnCurso = useRef(false);

  useEffect(() => { lockPortrait(); }, []);
  useEffect(() => { getContinueWatching(activeProfile.id).then(setContinueWatching); }, [activeProfile.id]);

  const addToContinueWatching = useCallback((item: ContinueWatchingItem) => {
    setContinueWatching(prev => [item, ...prev.filter(i => i.id !== item.id)].slice(0, 20));
  }, []);

  const splashOp = useRef(new Animated.Value(0)).current;
  const splashSc = useRef(new Animated.Value(0.94)).current;
  const ringRot = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.85)).current;
  const progressA = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content');
    Animated.parallel([Animated.timing(splashOp,{toValue:1,duration:650,easing:Easing.out(Easing.cubic),useNativeDriver:true}),Animated.timing(splashSc,{toValue:1,duration:650,easing:Easing.out(Easing.cubic),useNativeDriver:true})]).start();
    const rot = Animated.loop(Animated.timing(ringRot,{toValue:1,duration:3800,easing:Easing.linear,useNativeDriver:true}));
    const glow = Animated.loop(Animated.sequence([Animated.timing(glowPulse,{toValue:1.12,duration:850,easing:Easing.inOut(Easing.quad),useNativeDriver:true}),Animated.timing(glowPulse,{toValue:0.82,duration:850,easing:Easing.inOut(Easing.quad),useNativeDriver:true})]));
    rot.start(); glow.start();
    Animated.timing(progressA,{toValue:1,duration:2200,easing:Easing.inOut(Easing.cubic),useNativeDriver:false}).start();
    const t = setTimeout(() => { Animated.parallel([Animated.timing(splashOp,{toValue:0,duration:320,useNativeDriver:true}),Animated.timing(splashSc,{toValue:1.04,duration:320,useNativeDriver:true})]).start(() => { setSplash(false); setProfileSelection(true); }); }, 2700);
    return () => { clearTimeout(t); rot.stop(); glow.stop(); };
  }, []);

  const cargarListaM3U = useCallback(async () => {
    if (cargaEnCurso.current) return; cargaEnCurso.current = true; setLoadingChannels(true);
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(`${M3U_URL}?t=${Date.now()}`, { cache: 'no-store' }); const txt = await res.text(); const lineas = txt.split('\n');
        const parsed: Canal[] = []; let info = { name: '', logo: '', category: 'General' }; let idx = 20;
        lineas.forEach(l => { const lim = l.trim(); if (lim.startsWith('#EXTINF:')) { const parts = lim.split(','); info.name = parts[parts.length-1].trim()||'Canal'; info.logo = lim.match(/tvg-logo="([^"]+)"/i)?.[1]??''; info.category = lim.match(/group-title="([^"]+)"/i)?.[1]??'General'; } else if (lim.startsWith('http')) { let url = convertirMpdAHls(lim); const slug = extractEmbedSlug(url); const isEmbed = slug && (url.includes('streamtpday1')||url.includes('saohgdasregions')); parsed.push({ id:String(3000+idx), numero:idx++, name:info.name, logo:info.logo, category:info.category, url, ...(isEmbed?{embedSlug:slug!,needsWebView:true}:{}) }); info = { name:'', logo:'', category:'General' }; } });
        setListaCanales([...CANALES_MANUALES, ...parsed]); break;
      } catch { if (i===2) setListaCanales(CANALES_MANUALES); await new Promise(r => setTimeout(r, 800)); }
    }
    setLoadingChannels(false); cargaEnCurso.current = false;
  }, []);

  useEffect(() => { cargarListaM3U(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await cargarListaM3U(); setRefreshing(false); }, [cargarListaM3U]);

  const cargarDriveMovies = useCallback(async (force=false) => { if (force) driveMoviesLoaded.current = false; if (loadingDriveMovies||driveMoviesLoaded.current) return; setLoadingDriveMovies(true); try { const items = await cargarCarpetaDrive(DRIVE_FOLDER_PELICULAS,'movie','driveMoviesCache'); setDriveMovies(items); driveMoviesLoaded.current = true; } finally { setLoadingDriveMovies(false); } }, [loadingDriveMovies]);
  const cargarPlex = useCallback(async (force=false) => { if (force) plexLoaded.current = false; if (loadingPlex||plexLoaded.current) return; setLoadingPlex(true); try { const shows = await cargarSeriesPlex(DRIVE_FOLDER_SERIES,'driveSeriesCache'); setPlexShows(shows); plexLoaded.current = true; } finally { setLoadingPlex(false); } }, [loadingPlex]);

  const tabOpacity = useRef(new Animated.Value(1)).current;
  const changeTab = (i:number) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); Animated.timing(tabOpacity,{toValue:0,duration:90,useNativeDriver:true}).start(()=>{ setActiveTab(i); Animated.timing(tabOpacity,{toValue:1,duration:90,useNativeDriver:true}).start(); }); };

  const onSelectProfile = useCallback((id:string)=>{ setActiveProfileId(id); setProfileSelection(false); }, [setActiveProfileId]);
  const handleAddProfile = useCallback((name:string,color:string)=>{ addProfile(name,color); }, [addProfile]);
  const handleDeleteProfile = useCallback((id:string)=>{ deleteProfile(id); }, [deleteProfile]);
  const goToProfileSelection = () => setProfileSelection(true);

  if (splash) {
    const spin = ringRot.interpolate({ inputRange:[0,1], outputRange:['0deg','360deg'] });
    const progressWidth = progressA.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] });
    return (
      <View style={sp.root}>
        <StatusBar hidden /><View style={sp.bgOrb1} /><View style={sp.bgOrb2} />
        <Animated.View style={[sp.center,{opacity:splashOp,transform:[{scale:splashSc}]}]}>
          <Animated.View style={[sp.logoGlow,{transform:[{scale:glowPulse}]}]} />
          <Animated.View style={[sp.ring,{transform:[{rotate:spin}]}]}><View style={sp.ringDot1} /><View style={sp.ringDot2} /></Animated.View>
          <View style={sp.logoCore}><Text style={sp.logoN}>N</Text></View>
          <Text style={sp.title}>NEXUS<Text style={sp.accent}>TV</Text></Text>
          <Text style={sp.sub}>STREAMING PREMIUM</Text>
          <View style={sp.track}><Animated.View style={[sp.fill,{width:progressWidth}]} /></View>
          <Text style={sp.loadTxt}>SINTONIZANDO CANALES</Text>
        </Animated.View>
      </View>
    );
  }

  if (profileSelection) {
    return (
      <ProfileSelectScreen profiles={profiles} activeProfileId={activeProfileId} onSelect={onSelectProfile} onAdd={handleAddProfile} onDelete={handleDeleteProfile} onManage={()=>{ setActiveTab(4); setProfileSelection(false); }} />
    );
  }

  return (
    <View style={main.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.color.bg} />
      <View style={main.header}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:T.space.sm }}>
          <View style={[main.logoMark,{backgroundColor:primaryColor}]}><Text style={main.logoMarkTxt}>N</Text></View>
          <Text style={main.logo}>NEXUS<Text style={[main.logoAccent,{color:primaryColor}]}>TV</Text></Text>
        </View>
        <View style={main.headerRight}>
          <TouchableOpacity style={main.headerBtn} onPress={()=>setGlobalSearchVisible(true)}><Ionicons name="search" size={24} color={T.color.textSecondary} /></TouchableOpacity>
          <TouchableOpacity style={main.headerBtn} onPress={()=>{ Alert.alert('Perfiles','Seleccionar acción',[{text:'Cambiar de perfil',onPress:()=>goToProfileSelection()},...profiles.map(p=>({text:p.name,onPress:()=>{setActiveProfileId(p.id);Alert.alert('Perfil cambiado',`Ahora usando ${p.name}`);}})),{text:'Cancelar',style:'cancel'}]); }}><Ionicons name="person-circle-outline" size={24} color={T.color.textSecondary} /></TouchableOpacity>
          <TouchableOpacity style={main.headerBtn}><View style={[main.avatar,{backgroundColor:primaryColor+'CC'}]}><Text style={main.avatarTxt}>{activeProfile.name.charAt(0).toUpperCase()}</Text></View></TouchableOpacity>
        </View>
      </View>

      <Animated.View style={[{flex:1},{opacity:tabOpacity}]}>
        {activeTab===0 && <HomeSection primaryColor={primaryColor} activeProfile={activeProfile} continueWatching={continueWatching} onNavigateToTab={(i)=>changeTab(i)} onOpenSearch={()=>setGlobalSearchVisible(true)} />}
        {activeTab===1 && <MoviesPlayerSection primaryColor={primaryColor} driveItems={driveMovies} loadingDrive={loadingDriveMovies} onCargarDrive={cargarDriveMovies} activeProfile={activeProfile} updateProfile={updateProfile} continueWatching={continueWatching} addToContinueWatching={addToContinueWatching} />}
        {activeTab===2 && <LivePlayerSection primaryColor={primaryColor} listaCanales={listaCanales} loadingChannels={loadingChannels} refreshing={refreshing} onRefresh={onRefresh} favorites={favorites} setFavorites={setFavorites} />}
        {activeTab===3 && <SeriesPlayerSection primaryColor={primaryColor} plexShows={plexShows} loadingPlex={loadingPlex} onCargarPlex={cargarPlex} activeProfile={activeProfile} updateProfile={updateProfile} continueWatching={continueWatching} addToContinueWatching={addToContinueWatching} />}
        {activeTab===4 && <AjustesSection primaryColor={primaryColor} accentColor={activeProfile.accentColor} setAccentColor={(color:string)=>updateProfile({...activeProfile,accentColor:color})} onRefreshChannels={cargarListaM3U} onShowStats={()=>setShowStats(true)} onShowHistory={()=>setShowHistory(true)} />}
      </Animated.View>

      <View style={main.tabBar}>
        {[{label:'Inicio',icon:'home-outline',iconA:'home',idx:0},{label:'Películas',icon:'film-outline',iconA:'film',idx:1},{label:'TV En Vivo',icon:'tv-outline',iconA:'tv',idx:2},{label:'Series',icon:'videocam-outline',iconA:'videocam',idx:3},{label:'Ajustes',icon:'settings-outline',iconA:'settings',idx:4}].map(tab=>(
          <TouchableOpacity key={tab.idx} style={main.tabItem} onPress={()=>changeTab(tab.idx)} activeOpacity={0.75}>
            {activeTab===tab.idx && <View style={[main.tabIndicator,{backgroundColor:primaryColor}]} />}
            <Ionicons name={activeTab===tab.idx?tab.iconA:tab.icon as any} size={IS_TV?30:22} color={activeTab===tab.idx?primaryColor:T.color.textMuted} />
            <Text style={[main.tabLabel,activeTab===tab.idx&&{color:T.color.textPrimary,fontWeight:T.font.semibold}]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {globalSearchVisible && <GlobalSearch visible={globalSearchVisible} onClose={()=>setGlobalSearchVisible(false)} primaryColor={primaryColor} listaCanales={listaCanales} driveMovies={driveMovies} plexShows={plexShows} />}
      {showStats && (
        <Modal visible={showStats} animationType="slide">
          <View style={{ flex:1, backgroundColor:T.color.bg }}>
            <TouchableOpacity style={{ position:'absolute', top:50, right:20, zIndex:10 }} onPress={()=>setShowStats(false)}><Ionicons name="close" size={30} color="#fff" /></TouchableOpacity>
            <StatsScreen continueWatching={continueWatching} primaryColor={primaryColor} />
          </View>
        </Modal>
      )}
      {showHistory && (
        <HistoryScreen visible={showHistory} onClose={()=>setShowHistory(false)} data={continueWatching} primaryColor={primaryColor} onPlayItem={(item)=>{
          if (item.type === 'movie') changeTab(1);
          else changeTab(3);
          // En un entorno real, aquí pasarías el item al reproductor.
          setTimeout(() => Alert.alert('Reproduciendo', `Iniciando ${item.title}`), 500);
        }} />
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   ESTILOS
═══════════════════════════════════════════════════════════ */
const fs = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.space.lg, paddingTop: T.space.lg, paddingBottom: T.space.md, backgroundColor: 'rgba(0,0,0,0.7)' },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  titleTxt: { color: '#fff', fontSize: T.font.md, fontWeight: T.font.bold, letterSpacing: 0.3 },
  subtitleTxt: { color: 'rgba(255,255,255,0.6)', fontSize: T.font.sm, marginTop: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,45,85,0.95)', borderRadius: T.radius.full, paddingHorizontal: 12, paddingVertical: 5, gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTxt: { color: '#fff', fontSize: T.font.xs, fontWeight: T.font.black, letterSpacing: 1 },
  centerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.xl },
  navBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  seekBigBtn: { alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  seekBigLabel: { color: '#fff', fontSize: 10, fontWeight: T.font.black, marginTop: 2 },
  playPauseBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.space.lg, paddingBottom: T.space.lg, paddingTop: T.space.md, backgroundColor: 'rgba(0,0,0,0.7)', gap: T.space.sm },
  timeTxt: { color: '#fff', fontSize: T.font.sm, fontWeight: T.font.semibold, minWidth: 44, textAlign: 'center' },
  progressTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'visible', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  progressThumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, top: -6, marginLeft: -9, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, elevation: 6 },
  brightnessOverlay: { position: 'absolute', top: '42%', left: '42%', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  brightnessValue: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 8 },
});

const mp = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14,14,18,0.92)', borderTopWidth: 1, borderTopColor: T.color.glassBorder, paddingHorizontal: T.space.md, paddingVertical: T.space.sm, height: 80, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 15, position: 'relative', overflow: 'hidden' },
  progressLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.05)' },
  progressFill: { height: '100%' },
  poster: { width: 56, height: 56, borderRadius: T.radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  title: { color: T.color.textPrimary, fontSize: T.font.base, fontWeight: T.font.semibold },
  sub: { color: T.color.textMuted, fontSize: T.font.sm, marginTop: 2 },
  expandBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.color.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginRight: T.space.xs },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});

const pl = StyleSheet.create({
  seekOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: T.space.sm, gap: T.space.xl, backgroundColor: 'rgba(0,0,0,0.5)' },
  seekBtn: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  seekLabel: { color: '#fff', fontSize: 10, fontWeight: T.font.black },
  seekBtnPlay: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
});

const lv = StyleSheet.create({
  playerBox: { width: '100%', backgroundColor: '#000', position: 'relative', overflow: 'hidden', borderRadius: T.radius.xxl, marginBottom: T.space.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 10 },
  noSignal: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.color.surface },
  noSignalTxt: { color: T.color.textMuted, fontSize: T.font.sm, marginTop: 8 },
  navLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  navRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.space.md, paddingTop: T.space.sm, paddingBottom: T.space.sm },
  topBarRight: { flexDirection: 'row', gap: T.space.sm, marginLeft: 'auto' },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,45,85,0.95)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: T.radius.full, gap: 6, shadowColor: '#FF2D55', shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTxt: { color: '#fff', fontSize: T.font.xs, fontWeight: T.font.black, letterSpacing: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: T.space.lg, paddingBottom: T.space.md, paddingTop: 48, backgroundColor: 'rgba(0,0,0,0.7)' },
  channelInfoRow: { flexDirection: 'row', alignItems: 'center' },
  numBadgeLarge: { width: 44, height: 32, borderRadius: T.radius.md, alignItems: 'center', justifyContent: 'center', marginRight: T.space.md },
  numLarge: { color: '#fff', fontSize: T.font.sm, fontWeight: T.font.black },
  chName: { color: '#fff', fontSize: T.font.md, fontWeight: T.font.bold },
  chNow: { color: 'rgba(255,255,255,0.6)', fontSize: T.font.sm, marginTop: 2 },
  tapHint: { position: 'absolute', bottom: T.space.sm, right: T.space.md, flexDirection: 'row', alignItems: 'center', gap: 4 },
  tapHintTxt: { color: 'rgba(255,255,255,0.25)', fontSize: 10 },
  osd: { position: 'absolute', top: '30%', left: '50%', transform: [{ translateX: -35 }], backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: T.radius.lg, paddingHorizontal: T.space.lg, paddingVertical: T.space.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  osdTxt: { fontSize: T.font.xxl, fontWeight: T.font.black },
  osdError: { position: 'absolute', top: '40%', left: 20, right: 20, backgroundColor: 'rgba(229,9,20,0.95)', borderRadius: T.radius.lg, padding: T.space.md, alignItems: 'center' },
  osdErrTxt: { color: '#fff', fontWeight: T.font.bold, letterSpacing: 1 },
  recentsSection: { paddingTop: T.space.sm, marginBottom: T.space.sm },
  recentsSectionLabel: { color: T.color.textMuted, fontSize: 10, fontWeight: T.font.bold, letterSpacing: 1.5, marginLeft: T.space.lg, marginBottom: T.space.sm },
  recentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.full, borderWidth: 1, borderColor: T.color.glassBorder, paddingHorizontal: T.space.md, paddingVertical: T.space.xs },
  recentLogo: { width: 16, height: 16, borderRadius: 2 },
  recentTxt: { color: T.color.textSecondary, fontSize: T.font.sm, maxWidth: 100 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: T.space.md, marginTop: T.space.md, marginBottom: T.space.sm, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: T.radius.full, paddingHorizontal: T.space.md, height: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, color: T.color.textPrimary, fontSize: T.font.sm },
  catRow: { maxHeight: 44, marginVertical: T.space.sm },
  catChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.xl, paddingHorizontal: T.space.md, paddingVertical: T.space.sm, borderWidth: 1, borderColor: T.color.glassBorder, height: 38, justifyContent: 'center' },
  catTxt: { color: T.color.textSecondary, fontSize: T.font.sm },
  channelRow: { flexDirection: 'row', alignItems: 'center', height: 80, backgroundColor: T.color.surface, borderRadius: T.radius.xl, paddingHorizontal: T.space.md, borderWidth: 1, borderColor: T.color.glassBorder, marginBottom: T.space.sm },
  numBadge: { width: 44, height: 32, borderRadius: T.radius.md, alignItems: 'center', justifyContent: 'center' },
  numTxt: { fontSize: T.font.sm, fontWeight: T.font.bold },
  rowName: { color: T.color.textSecondary, fontSize: T.font.sm, fontWeight: '500' },
  rowNow: { color: T.color.textMuted, fontSize: T.font.xs },
  nowDot: { width: 5, height: 5, borderRadius: 2.5 },
  logo: { width: 40, height: 28, resizeMode: 'contain', marginLeft: T.space.sm },
  logoPlaceholder: { width: 40, height: 28, backgroundColor: T.color.surfaceHigh, borderRadius: T.radius.sm, alignItems: 'center', justifyContent: 'center', marginLeft: T.space.sm },
});

const vd = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: T.space.lg },
  addForm: { marginHorizontal: T.space.lg, marginBottom: T.space.sm, backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.lg, padding: T.space.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  addFormTitle: { color: T.color.textPrimary, fontSize: T.font.md, fontWeight: T.font.bold, marginBottom: T.space.sm },
  addInput: { backgroundColor: T.color.surface, color: T.color.textPrimary, borderRadius: T.radius.md, paddingHorizontal: T.space.md, height: 44, marginBottom: T.space.sm, fontSize: T.font.sm, borderWidth: 1, borderColor: T.color.border },
  addBtnSmall: { borderRadius: T.radius.md, paddingVertical: T.space.sm, alignItems: 'center', justifyContent: 'center' },
  card: { width: CARD_W, borderRadius: T.radius.xl, overflow: 'hidden', backgroundColor: T.color.surfaceElevated, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  cardInner: { width: '100%', height: '100%' },
  poster: { width: '100%', aspectRatio: 2 / 3, backgroundColor: T.color.surfaceHigh },
  posterGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', backgroundColor: 'transparent' },
  cardBottom: { padding: T.space.sm, paddingBottom: T.space.md },
  cardTitle: { color: T.color.textPrimary, fontSize: 13, fontWeight: T.font.semibold, lineHeight: 18, letterSpacing: 0.2 },
  cardYear: { color: T.color.textMuted, fontSize: 11 },
  ratingPill: { borderRadius: T.radius.full, paddingHorizontal: T.space.sm, paddingVertical: 2, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ratingTxt: { fontSize: T.font.xs, fontWeight: T.font.bold },
  playingBadge: { position: 'absolute', top: T.space.sm, left: T.space.sm, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 8, elevation: 8 },
  customBadge: { position: 'absolute', top: T.space.sm, right: T.space.sm, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: T.radius.sm, paddingHorizontal: T.space.xs, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  customBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: T.font.black, letterSpacing: 0.5 },
  detailHero: { width: '100%', height: H * 0.35 },
  detailGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.35, backgroundColor: 'rgba(0,0,0,0.55)' },
  detailClose: { position: 'absolute', top: T.space.lg, right: T.space.lg, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  detailBody: { padding: T.space.lg },
  detailPoster: { width: 100, height: 150, borderRadius: T.radius.lg, shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 14, elevation: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  detailTitle: { color: T.color.textPrimary, fontSize: T.font.xl, fontWeight: T.font.bold, lineHeight: 32, letterSpacing: 0.4 },
  detailOverview: { color: T.color.textSecondary, fontSize: T.font.sm, lineHeight: 24, marginTop: T.space.sm },
  detailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.sm, borderRadius: T.radius.lg, paddingVertical: T.space.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)' },
  detailBtnTxt: { color: '#fff', fontWeight: T.font.bold, fontSize: T.font.sm },
});

const px = StyleSheet.create({
  heroWrap: { position: 'relative' },
  heroImage: { width: '100%', height: 240 },
  heroGrad: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  backBtn: { position: 'absolute', top: T.space.lg, left: T.space.lg, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: T.radius.full, paddingHorizontal: T.space.md, paddingVertical: T.space.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  backTxt: { color: '#fff', fontSize: T.font.sm, fontWeight: T.font.semibold },
  heroInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', padding: T.space.lg },
  heroPoster: { width: 76, height: 114, borderRadius: T.radius.md, shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 12, elevation: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroTitle: { color: '#fff', fontSize: T.font.lg, fontWeight: T.font.black, lineHeight: 28, letterSpacing: 0.4 },
  heroOverview: { color: 'rgba(255,255,255,0.65)', fontSize: T.font.xs, lineHeight: 18, marginTop: T.space.sm },
  seasonBar: { backgroundColor: T.color.surface, paddingVertical: T.space.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  seasonChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.full, borderWidth: 1, borderColor: T.color.glassBorder, paddingHorizontal: 14, paddingVertical: 7, gap: 4 },
  seasonChipTxt: { color: T.color.textSecondary, fontSize: T.font.sm, fontWeight: T.font.semibold },
  seasonChipCount: { color: T.color.textMuted, fontSize: 11 },
  episodesSectionLabel: { color: T.color.textMuted, fontSize: 11, fontWeight: T.font.bold, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: T.space.lg, marginBottom: T.space.md },
  episodeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.color.surface, borderRadius: T.radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: T.space.sm, marginBottom: T.space.sm },
  epCodeBadge: { width: 46, height: 32, borderRadius: T.radius.md, alignItems: 'center', justifyContent: 'center', marginRight: T.space.sm },
  epCode: { fontSize: 11, fontWeight: T.font.black, letterSpacing: 0.5 },
  epThumb: { position: 'relative' },
  epThumbImg: { width: 92, height: 52, borderRadius: T.radius.md, overflow: 'hidden' },
  epThumbPlay: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  epTitle: { color: T.color.textPrimary, fontSize: T.font.sm, fontWeight: T.font.semibold },
  epMeta: { color: T.color.textMuted, fontSize: 11 },
  epOverview: { color: T.color.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  epPlayBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginLeft: T.space.sm },
  showBadgeWrap: { position: 'absolute', top: T.space.sm, right: T.space.sm },
  showBadge: { borderRadius: T.radius.md, paddingHorizontal: 8, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 8, elevation: 8 },
  showBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: T.font.black, letterSpacing: 0.5 },
});

const aj = StyleSheet.create({
  sectionTitle: { color: T.color.textMuted, fontSize: 10, fontWeight: T.font.bold, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: T.space.lg, marginTop: T.space.lg, marginBottom: T.space.sm },
  card: { marginHorizontal: T.space.lg, backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.lg, padding: T.space.md, marginBottom: T.space.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  label: { color: T.color.textSecondary, fontSize: T.font.sm },
  value: { color: T.color.textMuted, fontSize: T.font.sm },
  colorDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderWidth: 3, borderColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.3, shadowRadius: 6 },
});

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.lg, paddingTop: Platform.OS === 'ios' ? 50 : 14, paddingBottom: T.space.sm, backgroundColor: 'rgba(0,0,0,0.8)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  logoMark: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  logoMarkTxt: { color: '#fff', fontSize: 18, fontWeight: T.font.black, fontStyle: 'italic' },
  logo: { color: '#fff', fontSize: T.font.xl, fontWeight: T.font.black, letterSpacing: -0.5 },
  logoAccent: { fontWeight: T.font.black },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  headerBtn: { padding: T.space.xs },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  avatarTxt: { color: '#fff', fontSize: T.font.base, fontWeight: T.font.bold },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(10,10,12,0.92)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingBottom: Platform.OS === 'ios' ? 22 : 8, paddingTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 15 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: 6 },
  tabIndicator: { position: 'absolute', top: 0, left: '20%', right: '20%', height: 3, borderRadius: 1.5 },
  tabLabel: { color: T.color.textMuted, fontSize: 10, marginTop: 4, fontWeight: T.font.semibold },
});

const sp = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  bgOrb1: { position: 'absolute', width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(229,9,20,0.08)', top: -60, left: -80 },
  bgOrb2: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(108,99,255,0.06)', bottom: -40, right: -60 },
  center: { alignItems: 'center' },
  logoGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(229,9,20,0.2)' },
  ring: { width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: 'rgba(229,9,20,0.5)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  ringDot1: { position: 'absolute', top: 10, left: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E50914' },
  ringDot2: { position: 'absolute', bottom: 10, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(229,9,20,0.6)' },
  logoCore: { width: 80, height: 80, borderRadius: 18, backgroundColor: '#141414', borderWidth: 1.5, borderColor: 'rgba(229,9,20,0.35)', alignItems: 'center', justifyContent: 'center' },
  logoN: { color: '#E50914', fontSize: 42, fontWeight: '900', fontStyle: 'italic' },
  title: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: 6, marginTop: 24 },
  accent: { color: '#E50914' },
  sub: { color: 'rgba(255,255,255,0.3)', fontSize: 12, letterSpacing: 6, fontWeight: '600', marginTop: 8, marginBottom: 28 },
  track: { width: 180, height: 2, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 1, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#E50914', borderRadius: 1 },
  loadTxt: { color: 'rgba(255,255,255,0.25)', fontSize: 10, letterSpacing: 3, marginTop: 12 },
});

const cwa = StyleSheet.create({
  section: { marginBottom: T.space.sm },
  sectionTitle: { color: T.color.textMuted, fontSize: 10, fontWeight: T.font.bold, letterSpacing: 1.5, marginLeft: T.space.lg, marginBottom: T.space.xs, marginTop: T.space.sm },
  scroll: { paddingHorizontal: T.space.lg, gap: T.space.sm },
  card: { width: 160, height: 100, backgroundColor: T.color.surfaceElevated, borderRadius: T.radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginRight: T.space.sm },
  poster: { width: '100%', height: '100%', position: 'absolute' },
  cardGradient: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', padding: T.space.sm },
  title: { color: '#fff', fontSize: T.font.xs, fontWeight: T.font.bold, marginBottom: 2 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 4 },
  progressTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1 },
});

const ps = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingTop: 60 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 40, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
  profileCard: { alignItems: 'center', width: 100, marginBottom: 20 },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.15)' },
  avatarText: { color: '#fff', fontSize: 42, fontWeight: '700' },
  profileName: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 10, textAlign: 'center', width: '100%' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E50914', position: 'absolute', top: 80, alignSelf: 'center' },
  addIcon: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 10 },
  manageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 6 },
  manageText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 24, width: '85%', maxWidth: 340, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 16 },
  modalText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 20 },
  modalInput: { backgroundColor: '#2C2C2E', color: '#fff', borderRadius: 8, paddingHorizontal: 14, height: 44, fontSize: 16, marginBottom: 12 },
  modalSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 8 },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  colorCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorSelected: { borderColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.4, shadowRadius: 4 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  modalBtnPrimary: { backgroundColor: '#E50914' },
  modalBtnTextPrimary: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

const hs = StyleSheet.create({
  hero: { height: H * 0.5, justifyContent: 'flex-end' },
  heroContent: { padding: T.space.lg, paddingBottom: T.space.xl },
  heroTitle: { color: '#fff', fontSize: T.font.hero, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: T.font.sm, lineHeight: 20, marginBottom: 16 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, gap: 8 },
  heroBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 24, paddingHorizontal: 20 },
  quickBtn: { alignItems: 'center', gap: 8, backgroundColor: T.color.surfaceElevated, borderRadius: 16, padding: 16, width: '22%' },
  quickLabel: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  miniPoster: { width: 100, height: 150, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  miniPosterCard: { width: 100, marginRight: 10 },
  miniTitle: { color: '#fff', fontSize: 12, marginTop: 4, textAlign: 'center' },
  miniDate: { color: '#999', fontSize: 11, textAlign: 'center' },
});

const gs = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.space.md, paddingTop: 50, paddingBottom: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, backgroundColor: '#1C1C1E', color: '#fff', borderRadius: 8, height: 40, paddingHorizontal: 14, fontSize: 16 },
  closeBtn: { marginLeft: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  resultPoster: { width: 36, height: 54, borderRadius: 4, marginRight: 12 },
  resultTitle: { color: '#fff', fontWeight: '600', fontSize: 16 },
  resultSub: { color: '#999', fontSize: 13 },
});

const tr = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  playerContainer: { borderRadius: 12, overflow: 'hidden' },
  closeBtn: { position: 'absolute', top: 50, right: 20 },
});

const st = StyleSheet.create({
  card: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 },
  value: { color: '#fff', fontSize: 32, fontWeight: '800', marginVertical: 8 },
  label: { color: '#999', fontSize: 14 },
});

const livePulseStyle = StyleSheet.create({
  ring: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: T.color.live },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.color.live },
});

const glowBarStyle = StyleSheet.create({
  glow: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.3)', top: -7, marginLeft: -10 },
});
