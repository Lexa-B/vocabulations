# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vocabulations is a Japanese vocabulary flashcard web application. It's a static site with no build process - just open `index.html` in a browser or serve with any static file server.

## Running the App

```bash
# Any static file server works, e.g.:
python3 -m http.server 8000
# Then open http://localhost:8000
```

## Architecture

**Two-page static site:**
- `index.html` + `script.js` - Main flashcard practice interface
- `stats.html` + `stats.js` - Performance statistics visualization (uses Chart.js)
- `style.css` - Shared styles for the practice page
- `data/vocab.csv` - Vocabulary data (Japanese, English, Description columns)
- `data/vocab_schema.json` - Schema for LLM-based vocab generation

**Data flow:**
- Vocabulary loaded from `data/vocab.csv` via fetch and parsed with custom CSV parser
- User progress stored in `localStorage` under key `vocabStats`
- Stats format: `{ "Japanese word": { correct: N, incorrect: N }, ... }`

**Card modes:**
- Direction toggle: English→Japanese or Japanese→English
- Distribution toggle: Random or weighted (prioritizes words with more incorrect answers)

**Key state in script.js:**
- `vocabData` - Array of vocabulary entries from CSV
- `stats` - User performance data from localStorage
- `currentCard` - Currently displayed vocabulary item
- `isFlipped` / `isLoading` - UI state flags
