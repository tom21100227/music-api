# Music API

This is a simple API that's intended to be used with Cloudflare Workers. It provides a way to fetch the currently/recently played song from either Apple Music or Spotify, depending on which service is currently playing music. There's only one endpoint, `/`, which returns the currently playing song in JSON format.

This API is used by [my personal webpage.](https://tomhcy.com)

## Response Format

On success, the API will return a JSON object with the following structure:
```json
{
  "success": true,
  "source": "Apple Music",
  "timeStamp": "2025-07-07T04:56:04.848Z",
  "isPlaying": false,
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

TODO: Explain how to get these, but you can use AI. 

## Roadmap

- [ ] Add support for more music services (If I use ever use them)
- [ ] Add tests