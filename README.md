## CRB Makerspace Docs (Material for MkDocs)

A lightweight documentation site built with Material for MkDocs.

### Prerequisites
- Python 3.9+
- One of:
  - pipx (recommended): `pipx install mkdocs-material`
  - or pip: `pip install mkdocs-material`

### Quick Start (Local Preview)
```bash
mkdocs serve
```
- Open the printed local URL (usually `http://127.0.0.1:8000`).
- Live reload is enabled; edits in `docs/` update automatically.

### Project Structure
- `mkdocs.yml` – site config, theme, navigation
- `docs/` – content
  - `index.md` – homepage
  - `policies.md`, `electronics.md`, `equipment/*` – section pages
  - `assets/` – images and static assets
  - `stylesheets/extra.css` – custom CSS (declared in `mkdocs.yml`)
  - `schedule-app/` – 3D printer scheduler frontend and Apps Script backend

### Editing Content
1. Create or edit Markdown files in `docs/`.
2. Add the page to the `nav:` section of `mkdocs.yml` to expose it in the menu.
3. Use standard Markdown; Material components (admonitions, tabs, icons) are supported if enabled in `mkdocs.yml`.

### Images and Assets
- Place images in `docs/assets/` and reference with relative paths, e.g. `![alt](assets/lab-overview.jpg)`.

### Custom Styles
- Edit `docs/stylesheets/extra.css` and ensure it is included under `extra_css:` in `mkdocs.yml`.

### 3D Printer Scheduler
- Frontend: `docs/schedule-app/index.html` (static page served at `/schedule-app/index.html`).
- Backend: `docs/schedule-app/apps-script.gs` (Google Apps Script for a Google Sheet).
- Setup steps are documented in `docs/schedule-app/README.md`.
- Before deploying, set `SHEET_API` in `docs/schedule-app/index.html` to your Apps Script Web App `/exec` URL.

### Testing Before Deploy
```bash
# build the site locally (outputs to site/)
mkdocs build --strict
```
- `--strict` treats warnings as errors to catch broken links/mistakes early.

### Deploy Options

#### GitHub Pages (recommended for simplicity)
```bash
mkdocs gh-deploy --clean
```
- Builds the site and pushes to the `gh-pages` branch. Ensure the repo has GitHub Pages enabled (Settings → Pages → Deploy from branch `gh-pages`).

#### Any Static Host (Netlify, Vercel, S3, etc.)
```bash
mkdocs build --clean
```
- Upload the generated `site/` directory to your static host.

### Common Tasks
- Add a new page: create `docs/new-page.md` → add to `nav` in `mkdocs.yml` → `mkdocs serve` to preview.
- Update navigation: edit `mkdocs.yml` `nav:` structure.
- Fix broken links: run `mkdocs build --strict` and update paths.

### Troubleshooting
- Scheduler JSONP errors: see the diagnostic notes in `docs/schedule-app/README.md` and verify your Web App URL ends with `/exec` and is deployed with access set to "Anyone".
- Theme/CSS not loading: confirm `extra_css:` paths in `mkdocs.yml` match `docs/stylesheets/extra.css`.


