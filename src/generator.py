"""
Daily Dev Journal Generator
Automatically generates daily dev tips, programming quotes, and journal updates.
Designed to run via GitHub Actions to maintain genuine multiple daily repository activities.
"""

import os
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
    {"quote": "Simplicity is prerequisite for reliability.", "author": "Edsger W. Dijkstra"},
    {"quote": "Before software can be reusable it first has to be usable.", "author": "Ralph Johnson"},
    {"quote": "Deleted code is debugged code.", "author": "Jeff Sickel"},
    {"quote": "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", "author": "Martin Fowler"}
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
            with urllib.request.urlopen(req, timeout=4) as response:
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

def count_archive_entries():
    """Calculate total entries recorded in ARCHIVE.md."""
    if not ARCHIVE_FILE.exists():
        return 0
    with open(ARCHIVE_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    return content.count("### 🗓️")

def update_readme(quote_data, tip_data, now_utc, now_bst, total_entries):
    """Generate or update the README.md with contemporary, professional styling."""
    formatted_date = now_bst.strftime("%B %d, %Y")
    formatted_time_bst = now_bst.strftime("%I:%M:%S %p")
    formatted_time_utc = now_utc.strftime("%I:%M:%S %p")
    badge_date = now_bst.strftime("%Y--%m--%d")
    
    readme_content = f"""# 🚀 Daily Dev Journal & Digest

> An automated high-frequency developer journal & knowledge repository powered by **GitHub Actions** and **Python**.  
> Runs continuously throughout the day (every 2 hours & on demand), curating programming insights, architecture tips, and quotes.

[![Auto Update](https://github.com/abushaidislam/daily-dev-journal/actions/workflows/daily_update.yml/badge.svg)](https://github.com/abushaidislam/daily-dev-journal/actions)
[![Last Updated](https://img.shields.io/badge/Last_Updated-{badge_date}-brightgreen.svg?style=flat-square&logo=github)](https://github.com)
[![Total Entries](https://img.shields.io/badge/Total_Entries-{total_entries}-blueviolet.svg?style=flat-square&logo=git)](ARCHIVE.md)
[![Frequency](https://img.shields.io/badge/Frequency-10+_Commits_Daily-orange.svg?style=flat-square)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

### 📅 Current Edition: `{formatted_date}`
*Last synced: **{formatted_time_bst} BST** ({formatted_time_utc} UTC) | Entry #{total_entries}*

```mermaid
flowchart LR
    A[⏰ Periodic Cron / Trigger] --> B[🐍 Python Generator]
    B --> C[🌐 Fetch Tip & Quote]
    C --> D[📝 Update README & Archive]
    D --> E[🟩 High-Density Green Heatmap]
```

---

### 💡 Tip of the Moment
> **Category:** `{tip_data['category']}`  
> **Insight:**  
> {tip_data['tip']}

---

### 💬 Quote of the Moment
> *" {quote_data['quote']} "*  
> — **{quote_data['author']}**

---

### 📊 Repository Objectives
- [x] Maintain high-frequency, authentic GitHub contributions (10+ commits/day).
- [x] Continuous automated workflow execution via GitHub Actions.
- [x] Build an extensive knowledge repository of development best practices.

📜 View all historical updates in [ARCHIVE.md](file:///C:/Users/ASUS/.gemini/antigravity/scratch/daily-dev-journal/ARCHIVE.md).

---
*Maintained with ❤️ by GitHub Actions Automation.*
"""
    with open(README_FILE, "w", encoding="utf-8") as f:
        f.write(readme_content)
    print("README.md successfully updated.")

def update_archive(quote_data, tip_data, now_bst):
    """Append the record to the persistent archive file with exact timestamp."""
    entry_datetime = now_bst.strftime("%Y-%m-%d %I:%M:%S %p")
    entry = f"""
### 🗓️ {entry_datetime} BST
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
        with open(ARCHIVE_FILE, "a", encoding="utf-8") as f:
            f.write(entry)
        print(f"ARCHIVE.md appended: {entry_datetime}")

def run_single_update():
    now_utc = datetime.now(timezone.utc)
    now_bst = now_utc + timedelta(hours=6)
    
    quote = fetch_quote()
    tip = get_daily_tip()
    
    update_archive(quote, tip, now_bst)
    total_entries = count_archive_entries()
    update_readme(quote, tip, now_utc, now_bst, total_entries)
    return tip['category']

def main():
    print("Running Daily Dev Journal Generator...")
    category = run_single_update()
    print(f"Update completed successfully [{category}].")

if __name__ == "__main__":
    main()
