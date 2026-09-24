"""
Daily Dev Journal Generator
Automatically generates daily dev tips, programming quotes, and journal updates.
Designed to run via GitHub Actions to maintain genuine daily repository activity.
"""

import json
import random
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
TIPS_FILE = BASE_DIR / "src" / "data" / "tips.json"
README_FILE = BASE_DIR / "README.md"
ARCHIVE_FILE = BASE_DIR / "ARCHIVE.md"

FALLBACK_QUOTES = [
    {"quote": "First, solve the problem. Then, write the code.", "author": "John Johnson"},
    {"quote": "Experience is the name everyone gives to their mistakes.", "author": "Oscar Wilde"},
    {"quote": "In order to be irreplaceable, one must always be different.", "author": "Coco Chanel"},
    {"quote": "Knowledge is power.", "author": "Francis Bacon"},
    {"quote": "Code is like humor. When you have to explain it, it’s bad.", "author": "Cory House"},
    {"quote": "Make it work, make it right, make it fast.", "author": "Kent Beck"},
    {"quote": "Simplicity is prerequisite for reliability.", "author": "Edsger W. Dijkstra"}
]

def fetch_quote():
    """Fetch an inspirational or tech quote from an online API, fallback gracefully on failure."""
    urls = [
        "https://dummyjson.com/quotes/random",
        "https://api.quotable.io/random"
    ]
    for url in urls:
        try:
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'DailyDevJournalBot/1.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    quote_text = data.get("quote") or data.get("content")
                    author = data.get("author", "Unknown")
                    if quote_text:
                        return {"quote": quote_text.strip(), "author": author.strip()}
        except Exception:
            continue
            
    return random.choice(FALLBACK_QUOTES)

def get_daily_tip():
    """Load and pick a curated programming tip."""
    try:
        if TIPS_FILE.exists():
            with open(TIPS_FILE, "r", encoding="utf-8") as f:
                tips = json.load(f)
                if tips:
                    return random.choice(tips)
    except Exception as e:
        print(f"Warning loading tips: {e}")
        
    return {
        "category": "General Dev",
        "tip": "Commit often, write clear commit messages, and keep your branches focused."
    }

def update_readme(quote_data, tip_data, now_utc, now_bst):
    """Generate or update the README.md with contemporary, professional styling."""
    formatted_date = now_bst.strftime("%B %d, %Y")
    formatted_time_bst = now_bst.strftime("%I:%M %p")
    formatted_time_utc = now_utc.strftime("%I:%M %p")
    
    badge_date = now_bst.strftime("%Y--%m--%d")
    
    readme_content = f"""# 🚀 Daily Dev Journal & Digest

> An automated daily developer journal & knowledge repository powered by **GitHub Actions** and **Python**.  
> Every day at 00:00 UTC, this repository automatically curates a fresh programming tip, architectural insight, and inspirational quote.

[![Daily Auto Update](https://github.com/features/actions/workflows/badge.svg)](https://github.com)
[![Last Updated](https://img.shields.io/badge/Last_Updated-{badge_date}-brightgreen.svg?style=flat-square&logo=github)](https://github.com)
[![Daily Streak](https://img.shields.io/badge/Active_Status-Daily_Automated-blue.svg?style=flat-square&logo=git)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

### 📅 Today's Edition: `{formatted_date}`
*Last synced: **{formatted_time_bst} BST** ({formatted_time_utc} UTC)*

```mermaid
flowchart LR
    A[⏰ GitHub Actions Cron] --> B[🐍 Python Automation]
    B --> C[🌐 Fetch Tip & Quote]
    C --> D[📝 Update README & Archive]
    D --> E[🟩 Green Contribution Tile]
```

---

### 💡 Tip of the Day
> **Category:** `{tip_data['category']}`  
> **Insight:**  
> {tip_data['tip']}

---

### 💬 Quote of the Day
> *" {quote_data['quote']} "*  
> — **{quote_data['author']}**

---

### 📊 Repository Objectives
- [x] Maintain an active, unbroken, genuine GitHub contribution streak.
- [x] Learn and automate CI/CD workflows using GitHub Actions.
- [x] Build an ever-growing archive of developer knowledge and best practices.

📜 View past daily entries in [ARCHIVE.md](file:///C:/Users/ASUS/.gemini/antigravity/scratch/daily-dev-journal/ARCHIVE.md).

---
*Created with ❤️ by an Automated Workflow.*
"""
    with open(README_FILE, "w", encoding="utf-8") as f:
        f.write(readme_content)
    print("README.md successfully updated.")

def update_archive(quote_data, tip_data, now_bst):
    """Append the day's record to the persistent archive file."""
    entry_date = now_bst.strftime("%Y-%m-%d")
    entry = f"""
### 🗓️ {entry_date}
- **Category:** `{tip_data['category']}`
- **Tip:** {tip_data['tip']}
- **Quote:** *"{quote_data['quote']}"* — {quote_data['author']}

---
"""
    header = "# 📚 Daily Dev Journal Archive\n\nAll historical daily updates recorded automatically.\n\n---\n"
    
    if not ARCHIVE_FILE.exists():
        with open(ARCHIVE_FILE, "w", encoding="utf-8") as f:
            f.write(header + entry)
    else:
        with open(ARCHIVE_FILE, "r", encoding="utf-8") as f:
            existing_content = f.read()
            
        # Prevent duplicate entries on the same day if run multiple times manually
        if f"### 🗓️ {entry_date}" not in existing_content:
            with open(ARCHIVE_FILE, "a", encoding="utf-8") as f:
                f.write(entry)
            print("ARCHIVE.md successfully appended.")
        else:
            print("ARCHIVE.md already has an entry for today.")

def main():
    print("Running Daily Dev Journal Generator...")
    now_utc = datetime.now(timezone.utc)
    # BST is UTC+6
    now_bst = now_utc + timedelta(hours=6)
    
    quote = fetch_quote()
    tip = get_daily_tip()
    
    print(f"Quote: {quote['quote']} - {quote['author']}")
    print(f"Tip ({tip['category']}): {tip['tip']}")
    
    update_readme(quote, tip, now_utc, now_bst)
    update_archive(quote, tip, now_bst)
    print("Journal update completed successfully.")

if __name__ == "__main__":
    main()
