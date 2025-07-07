/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { SignJWT, importPKCS8 } from 'jose';
import { KVNamespace } from '@cloudflare/workers-types';

// Define the shape of our environment variables
export interface Env {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
  APPLE_MUSIC_USER_TOKEN: string;
  RESULT_CACHE: KVNamespace;
  APPLE_STATE_CACHE: KVNamespace;
}

// Spotify API endpoints
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`;
const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`;
const APPLE_RECENTLY_PLAYED_ENDPOINT = `https://api.music.apple.com/v1/me/recent/played/tracks?limit=1`;

interface ApiResponse {
  success: boolean;
  isPlaying: boolean;
  timeStamp: string;
  source?: string;
  duration?: number; // Duration in milliseconds
  title?: string;
  artist?: string;
  album?: string;
  albumImageUrl?: string;
  songUrl?: string;
  error?: string;
}


export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // If the request specified cache=false, skip the cache
    if (new URL(request.url).searchParams.get('noCache') === 'true') {
      console.log('Cache bypassed due to request parameter.');
      env.RESULT_CACHE.delete('now_playing_result');
    } else {
      // Check if there is a cached result first
      const cachedResult = await env.RESULT_CACHE.get('now_playing_result', { type: 'json' });

      if (cachedResult) {
        console.log("Cache Hit")
        return new Response(JSON.stringify(cachedResult, null, 2), {
          headers: { 'Content-Type': 'application/json', 'X-Cache-Status': 'HIT' , 'Access-Control-Allow-Origin': '*' },
        });
      }
    }


    const appleMusicUserToken = env.APPLE_MUSIC_USER_TOKEN;

    // Run both API calls in parallel
    const [spotify, apple]: [ApiResponse, ApiResponse] = await Promise.all([
      getSpotifyData(env),
      getAppleMusicData(env, appleMusicUserToken)
    ]);

    // Final Logic: Spotify takes priority.
    // If Spotify is playing, return that. Otherwise, check if Apple Music was playing recently.
    console.log('Spotify Data:', spotify);
    console.log('Apple Music Data:', apple);

    let responseData;
    if (spotify.isPlaying) {
      responseData = spotify;
    } else if (apple.isPlaying) {
      responseData = apple;
    } else {
      // Compare timestamps to find the most recent
      const spotifyTime = spotify.timeStamp ? new Date(spotify.timeStamp).getTime() : 0;
      const appleTime = apple.timeStamp ? new Date(apple.timeStamp).getTime() : 0;
      responseData = spotifyTime >= appleTime ? spotify : apple;
    }

    if (responseData.success) {
      ctx.waitUntil(
        // Cache the result with a TTL based on the duration of the song, or a default of 120 seconds. TTL is capped at 600 seconds (10 minutes).
        env.RESULT_CACHE.put('now_playing_result', JSON.stringify(responseData), {
          expirationTtl: responseData.duration ? Math.min(Math.floor(responseData.duration / 1000), 600) : 120,
        })
      );
    }

    return new Response(JSON.stringify(responseData, null, 2), {
      headers: { 'Content-Type': 'application/json', 'X-Cache-Status': 'MISS', 'Access-Control-Allow-Origin': '*' },
    });
  },
};


// --- SPOTIFY HELPER FUNCTIONS ---
async function getSpotifyData(env: Env) {
  const accessToken = await getAccessToken(env);
  if (!accessToken) {
    return { success: false, isPlaying: false, timeStamp: new Date().toISOString(), error: 'Could not get access token for Spotify.' };
  }
  return getNowPlaying(accessToken);
}

/**
 * Uses the refresh token to get a short-lived access token from Spotify.
 */
async function getAccessToken(env: Env) {
  // btoa() creates a Base64-encoded string, which is required by Spotify.
  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  const data: { access_token?: string } = await response.json();
  return data.access_token;
}

/**
 * Fetches the currently playing track from Spotify using an access token.
 */
async function getNowPlaying(accessToken: string) {
  const response = await fetch(NOW_PLAYING_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If nothing is playing, Spotify returns a 204 No Content response.
  if (response.status === 204) {
    return { success: true, isPlaying: false, timeStamp: new Date(0).toISOString() };
  }
  // If the response is not OK, we return an error.
  if (!response.ok) {
    return {
      success: false,
      isPlaying: false,
      timeStamp: new Date().toISOString(),
      error: `Failed to fetch from Spotify. Status: ${response.status} ${response.statusText}`,
    };
  }

  const song: any = await response.json();

  // We are structuring the response to only include the data we care about.
  return {
    success: true,
    source: 'Spotify',
    timeStamp: new Date(song.timestamp).toISOString(),
    duration: song.item.duration_ms, // Duration in milliseconds
    isPlaying: song.is_playing,
    title: song.item.name,
    artist: song.item.artists.map((_artist: any) => _artist.name).join(', '),
    album: song.item.album.name,
    albumImageUrl: song.item.album.images[0].url,
    songUrl: song.item.external_urls.spotify,
  };
}

/**
 * Generates a short-lived Developer Token to talk to the Apple Music API.
 */
async function getAppleDeveloperToken(env: Env) {
  try {

    const privateKey = await importPKCS8(env.APPLE_PRIVATE_KEY, 'ES256');
    const alg = 'ES256';

    const jwt = await new SignJWT({})
      .setProtectedHeader({
        alg,
        kid: env.APPLE_KEY_ID, // Your Key ID
      })
      .setIssuedAt()
      .setIssuer(env.APPLE_TEAM_ID) // Your Team ID
      .setExpirationTime('1h'); // Token is valid for 1 hour

    return jwt.sign(privateKey);
  } catch (err) {
    console.error('Apple Music Token Generation Error:', err);
    return null;
  }
}

interface AppleCacheState {
  songId: string;
  cachedAt: number; // Timestamp
}

async function getAppleMusicData(env: Env, musicUserToken: string) {
  const developerToken = await getAppleDeveloperToken(env);
  if (!developerToken || !musicUserToken) {
    return { success: false, isPlaying: false, timeStamp: new Date().toISOString(), error: 'Could not generate Apple Developer Token.' };
  }

  try {
    const response = await fetch(APPLE_RECENTLY_PLAYED_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${developerToken}`,
        'Music-User-Token': musicUserToken,
      },
    });

    if (response.status > 204 || !response.body) {
      return { isPlaying: false, timeStamp: new Date().toISOString(), success: false, error: `Failed to fetch from Apple Music. Status: ${response.status} ${response.statusText}` };
    }

    const { data }: any = await response.json();
    const lastSong = data[0];
    const songId = lastSong.id;

    const durationInMillis = lastSong.attributes.durationInMillis;

    const cachedState: AppleCacheState | null = await env.APPLE_STATE_CACHE.get('last_apple_song', { type: 'json' });

    const oneSongAgo = Date.now() - durationInMillis


    // If the current song is the same one we have in cache, it could be old. 
    if (cachedState && cachedState.songId === songId) {
      if (cachedState.cachedAt > oneSongAgo) {
        // The cached sone is not being played live, return with isLive = false
        return formatAppleSong(lastSong, false, cachedState.cachedAt);
      } else {
        // The cached song is being played live, return with isLive = true
        return formatAppleSong(lastSong, true, cachedState.cachedAt);
      }
    } else {
      // There's a new song, so we update the cache with the new song ID and current timestamp.
      const newState: AppleCacheState = { songId: songId, cachedAt: Date.now() };
      await env.APPLE_STATE_CACHE.put('last_apple_song', JSON.stringify(newState));
      return formatAppleSong(lastSong, false, Date.now());
    }

  } catch (error) {
    console.log('Apple Music API Error:', error);
    return {
      success: false,
      isPlaying: false,
      timeStamp: new Date().toISOString(),
      error: 'Failed to fetch from Apple Music. Is the User Token valid?'
    };
  }
}


function formatAppleSong(song: any, isLive: boolean, timestamp: number) {
  return {
    success: true,
    source: 'Apple Music',
    timeStamp: new Date(timestamp).toISOString(),
    isPlaying: isLive, // We still say true, but the 'isLive' flag gives more context.
    duration: song.attributes.durationInMillis, // Duration in milliseconds
    title: song.attributes.name,
    artist: song.attributes.artistName,
    album: song.attributes.albumName,
    albumImageUrl: song.attributes.artwork.url.replace('{w}', '500').replace('{h}', '500'),
    songUrl: song.attributes.url,
  };
}
