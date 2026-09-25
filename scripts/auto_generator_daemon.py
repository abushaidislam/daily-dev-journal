"""
RogueRealm 30-Minute Auto-Generator Daemon
Run this script locally if you want 100% clockwork precision automated commits
every 30 minutes, without waiting for GitHub Actions shared runner queues.
"""

import os
import sys
import time
import subprocess
from datetime import datetime

def run_step(cmd, check=True):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and res.returncode != 0:
        print(f"[!] Error running '{cmd}': {res.stderr.strip()}")
    return res

def main():
    print("=" * 60)
    print("  RogueRealm 30m Auto-Commit Daemon Started")
    print("=" * 60)
    
    interval_seconds = 1800 # 30 minutes
    
    while True:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n[{now_str}] Starting generation cycle...")
        
        # 1. Pull latest changes
        run_step("git pull --rebase origin main", check=False)
        
        # 2. Run dungeon generator
        res_gen = run_step(f'"{sys.executable}" src/dungeon_generator.py', check=False)
        if res_gen.returncode == 0:
            print("[+] Dungeon generator finished successfully.")
        else:
            print(f"[!] Dungeon generator failed: {res_gen.stderr}")
            
        # 3. Stage and check diff
        run_step("git add -A")
        diff_check = run_step("git diff --staged --quiet", check=False)
        
        if diff_check.returncode != 0:
            utc_now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            commit_msg = f"feat(dungeon): procedural level generated [{utc_now}]"
            run_step(f'git commit -m "{commit_msg}"')
            push_res = run_step("git push origin main", check=False)
            if push_res.returncode == 0:
                print(f"[✓] Successfully committed and pushed: {commit_msg}")
            else:
                print(f"[!] Push failed: {push_res.stderr.strip()}")
        else:
            print("[-] No changes to commit in this cycle.")
            
        print(f"[*] Sleeping for 30 minutes until next level...")
        time.sleep(interval_seconds)

if __name__ == "__main__":
    main()
