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

// Define the shape of our environment variables
export interface Env {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
}

// Spotify API endpoints
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`;
const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`;
const APPLE_RECENTLY_PLAYED_ENDPOINT = `https://api.music.apple.com/v1/me/recent/played/tracks?limit=1`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // We can run both requests in parallel for better performance
    const [spotifyData, appleDeveloperToken] = await Promise.all([
      getSpotifyData(env),
      getAppleDeveloperToken(env),
    ]);

    // For now, we'll just return both results to see that they're working
    const combinedResponse = {
      spotify: spotifyData,
      apple: {
        developerToken: appleDeveloperToken,
        // We will add recentlyPlayed data here in the next major step
      },
    };

    return new Response(JSON.stringify(combinedResponse, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};


// --- SPOTIFY HELPER FUNCTIONS ---
async function getSpotifyData(env: Env) {
  const accessToken = await getAccessToken(env);
  if (!accessToken) {
    return { isPlaying: false, error: 'Could not get access token.' };
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
  if (response.status === 204 || response.status > 400) {
    return { isPlaying: false };
  }

  const song = await response.json();

  // We are structuring the response to only include the data we care about.
  return {
    isPlaying: song.is_playing,
    title: song.item.name,
    artist: song.item.artists.map((_artist: any) => _artist.name).join(', '),
    album: song.item.album.name,
    albumImageUrl: song.item.album.images[0].url,
    songUrl: song.item.external_urls.spotify,
  };
}

async function getAppleMusicData(env: Env) {
  // We'll add logic here soon
  return { message: "Apple Music logic goes here" };
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
  }catch (err) {
    console.error('Apple Music Token Generation Error:', err);
    return null;
  }
}