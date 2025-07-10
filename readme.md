# Now Playing API

This is a simple API that's intended to be used with Cloudflare Workers. It provides a way to fetch the currently/recently played song of an arbitrary user from either Apple Music or Spotify, depending on which service is currently playing music. There's only one endpoint, `/`, which returns the currently playing song in JSON format.

This API is used by [my personal webpage.](https://tomhcy.com)

## Response Format

On success, the API will return a JSON object with the following structure:
```json
{
  "success": true,
  "source": "Apple Music",
  "timeStamp": "2025-07-07T04:56:04.848Z",
  "isPlaying": false,
  "duration": 180000, // Duration in milliseconds
  "title": "Love Is Everywhere",
  "artist": "Magdalena Bay",
  "album": "Imaginal Disk",
  "albumImageUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/8f/e3/6c/8fe36c7a-d280-2d0e-8e67-4ee0fd4523cd/810090095448.png/500x500bb.jpg",
  "songUrl": "https://music.apple.com/us/album/love-is-everywhere/1751414757?i=1751414768"
}
```

If there is an error, the API will return a JSON object with the following structure:
```json
{
  "success": false,
  "isPlaying": false,
  "error": "Error Message"
}
```

## Environment Variables

Change the `.TEMPLATE.vars` file to `.dev.vars` and fill in the required variables:

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
APPLE_MUSIC_USER_TOKEN=
```

## How to Adapt This for Your Own Use

### Spotify 

You need three tokens to get Spotify's currently playing song: 

1. **Client ID**: application's unique identifier.
2. **Client Secret**: secret key used to authenticate your application.
3. **Authorization Code**: token that allows you to access the Spotify API (lasts for an hour).

First two is quite easy to obtain, with the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications). The authorization code is a bit more complicated, it only lasts for an hour and requires user authentication via OAuth. Once you have the token, you can make requests to the `/me/player/currently-playing` endpoint to get the current track information.

I would not be on my computer every hour to refresh the token, so I need another solution: **Refresh Token**. This token can be used to obtain a new access token without requiring user authentication again. But to get that token requires some hoops to jump through: 

1. Make up a callback URL and authorize that URL on the Spotify Developer Dashboard. (I used this domain, since I know there's no `/callback` endppoint). 
2. Fake a request to Spotify's authorization endpoint: `https://accounts.spotify.com/authorize?response_type=code&client_id=CLIENT_ID&scope=user-read-currently-playing&redirect_uri=CALLBACK_URL`
3. This will redirect you to the callback URL with a `code` parameter in the query, that is the authorization code. 
4. Make the following request to get the actual Token: 
```sh
curl -d client_id=YOUR_CLIENT_ID
     -d client_secret=YOUR_CLIENT_SECRET
     -d grant_type=authorization_code
     -d code=CODE_FROM_URL
     -d redirect_uri=https://yourdomain.com/callback 
     https://accounts.spotify.com/api/token
```

### Apple Music

Apple Music's API is quite different. Unlike Spotify, **you have to pay for an Apple Developer Account** to use the MusicKit API. But once you have that it is quite easy to use. You'll need: 

1. **Team ID**: your Apple Developer Team ID.
2. **Key ID**: the identifier of the key you created in the Apple Developer Portal.
3. **Private Key**: the private key you downloaded when you created the key in the Apple Developer Portal, it's a `.p8` file.
4. **Music User Token**: a token that represents the user, you can get this by authenticating the user with MusicKit JS or iOS SDK. I made [a static website that does it](src/apple_auth.html). 

Steps to get those: 

1. Create a Media ID: In the sidebar, select Identifiers and click the (+) button to add a new one. Choose Media IDs from the list and click Continue.
2. Create a Private Key for MusicKit: Under Media Services, check the box for MusicKit.
3. Download Your Key and Save Your IDs: It's a `.p8` file, and you will need to save the Key ID and Team ID from the Apple Developer Portal.

### Cloudflare Workers

#### KV-Cache
This API uses two KV namespaces: `RESULT_CACHE` and `APPLE_STATE_CACHE`. These are used to cache the results of the API calls to speed things up and determine if Apple Music is playing or recently played.

```sh
npx wrangler kv namespace create "RESULT_CACHE"
npx wrangler kv namespace create "APPLE_STATE_CACHE"
```

#### Secrets

Once you have those tokens in `.dev.vars`, and you test your API calls, you can deploy your application using Cloudflare Workers. You'll need to put those tokens as secrets in your Cloudflare Workers environment.

```sh
npx wrangler secret create SPOTIFY_CLIENT_ID
npx wrangler secret create SPOTIFY_CLIENT_SECRET
npx wrangler secret create SPOTIFY_REFRESH_TOKEN
npx wrangler secret create APPLE_TEAM_ID
npx wrangler secret create APPLE_KEY_ID
npx wrangler secret create APPLE_PRIVATE_KEY
npx wrangler secret create APPLE_MUSIC_USER_TOKEN
```

#### Deploying
Once you have everything set up, you can deploy your application using the following command:

```sh
npx wrangler deploy
```

Now your API should be live and accessible at the URL provided by Cloudflare Workers.

## Roadmap

- [ ] Add support for more music services (If I use ever use them)
- [ ] Add tests
