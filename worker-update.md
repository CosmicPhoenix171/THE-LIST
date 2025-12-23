# Cloudflare Worker Update Required

To enable the "Add Collection" feature, update the Cloudflare Worker at `share-the-list.cosmicphoenix171.workers.dev` to include the `shareId` and `uid` parameters in the redirect URL for collection shares.

## Required Changes

In the worker's redirect logic for collection shares, ensure the redirect URL includes:

```javascript
// When building the redirect URL for collection shares:
const redirectParams = new URLSearchParams();
redirectParams.set('share_collection', 'true');
redirectParams.set('share_series', params.get('series'));
redirectParams.set('share_shareId', params.get('shareId'));  // <-- ADD THIS
redirectParams.set('share_uid', params.get('uid'));          // <-- ADD THIS
redirectParams.set('share_count', params.get('count'));
redirectParams.set('share_movies', params.get('movies'));
redirectParams.set('share_seasons', params.get('seasons'));
redirectParams.set('share_episodes', params.get('episodes'));
redirectParams.set('share_yearRange', params.get('yearRange'));
redirectParams.set('share_poster', params.get('poster'));
redirectParams.set('share_user', params.get('user'));

const redirectUrl = `${SHARE_BASE_URL}?${redirectParams.toString()}`;
```

## Why This is Needed

The `shareId` and `uid` parameters are required to fetch the full collection data from Firebase when the recipient clicks "Add Collection" in the shared collection modal.
