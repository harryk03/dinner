# Dinner votes

Group dinner vote pages for Harry and mates. One folder per dinner (`/<slug>/`), each with `index.html` (copied from `_template/`), `data.json` and `photos/`. Shared code is in `assets/`. Votes are stored in Supabase (`tools/supabase.sql`); `assets/config.js` holds the project URL and publishable key.

New dinner: create the folder, copy the template, write `data.json`, add up to 4 photos per venue (room, dish, dish/bar/drinks, bar/exterior), run `python3 -I tools/check_dinner.py <slug>`, commit and push.
