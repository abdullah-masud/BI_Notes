# BI Notes

Static study notes website for INMT5526 Business Intelligence.

## Project Structure

```text
.
|-- index.html
|-- assets/
|   |-- css/
|   |   `-- styles.css
|   `-- js/
|       |-- notes.js
|       `-- supabase-config.js
`-- .github/
    `-- workflows/
        `-- pages.yml
```

## Study Notes Sync

The note boxes are created by `assets/js/notes.js`.

Notes are saved in two places:

- Browser `localStorage`, so they still work locally.
- Supabase, so the same notes appear across laptop and phone.

The public Supabase project settings live in `assets/js/supabase-config.js`.

## Local Preview

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/
```
