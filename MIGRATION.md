# CDN — Migration Plan

Assets to migrate from various sources into the CDN repo, roughly in priority order.

## 1. Last.fm stats (blog post)

- **Consumer**: manik.cc/2026/02/21/listening-history.html
- **Current source**: standalone `lastfm-stats` repo with GitHub Pages on `/docs`
- **What moves**: processed JSON (genre-drift, 3am-analysis, mainstream-analysis), raw cached API data, fetch/analyze scripts
- **Project type**: data
- **Scheduled workflow**: monthly refresh via Last.fm API
- **Status**: already extracted from portfolio repo, serving at manik.cc/lastfm-stats/. Needs to be folded into CDN repo structure.

### Migration steps
- [ ] Move scripts to `pipeline/lastfm-stats/`
- [ ] Move raw data to `source/lastfm-stats/`
- [ ] Move processed JSON to `docs/lastfm-stats/processed/`
- [ ] Add manifest.json
- [ ] Create `refresh-lastfm.yml` workflow
- [ ] Wire into shared `build.yml`
- [ ] Update `DATA_BASE` in portfolio's `lastfm-blog.js` to new CDN URL
- [ ] Archive or delete standalone `lastfm-stats` repo

## 2. Photos page

- **Consumer**: manik.cc/photos
- **Current source**: imgur album, fetched client-side
- **What moves**: all photos from the imgur album
- **Project type**: gallery
- **Scheduled workflow**: none (push-only)

### Migration steps
- [ ] Download all photos from imgur album
- [ ] Add to `source/photos/`
- [ ] Add `metadata.json` with captions/descriptions
- [ ] Verify image pipeline generates thumbs + WebP
- [ ] Update portfolio's photos page to fetch from CDN manifest
- [ ] Remove imgur dependency from portfolio

## 3. Art page

- **Consumer**: manik.cc/art
- **Current source**: imgur album (separate from photos)
- **What moves**: art images from imgur
- **Project type**: gallery
- **Scheduled workflow**: none (push-only)

### Migration steps
- [ ] Download all images from imgur album
- [ ] Add to `source/art/`
- [ ] Add `metadata.json` with descriptions
- [ ] Update portfolio's art page to fetch from CDN manifest
- [ ] Remove imgur dependency

## 4. Blog post images

- **Consumer**: various blog posts on manik.cc
- **Current source**: images live in the portfolio repo itself (or inline)
- **What moves**: any heavy images used in blog posts
- **Project type**: gallery (one project per post, or one shared `blog/` project)
- **Scheduled workflow**: none (push-only)
- **Priority**: low — only worth doing if blog images are noticeably heavy

### Migration steps
- [ ] Audit which blog posts have heavy images
- [ ] Move originals to `source/blog/<post-slug>/`
- [ ] Generate optimized versions via pipeline
- [ ] Update image references in blog posts to CDN URLs

## Future possibilities

- **Resume PDF**: serve latest resume from CDN, update via push
- **Project screenshots/demos**: optimized images for portfolio project cards
- **Any new project**: follows the same pattern — add a folder, push, done
