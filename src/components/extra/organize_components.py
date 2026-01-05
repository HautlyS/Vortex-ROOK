#!/usr/bin/env python3
"""
Component Organizer Script
--------------------------
This script organizes Vue component files in the components_extra folder.

It detects .txt files that contain both Usage and Code sections mixed together,
and splits them into:
  - ComponentName.vue (the actual component code)
  - ComponentName-usage.txt (usage examples)

Files that are already properly organized are left untouched.
Backups are created in a .bak folder before any modifications.
"""

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

SCRIPT_DIR = Path(__file__).parent
BACKUP_DIR = SCRIPT_DIR / ".bak"


def create_backup(file_path: Path) -> Path:
    """Create a backup of the file in the .bak directory."""
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{file_path.name}.{timestamp}.bak"
    backup_path = BACKUP_DIR / backup_name
    shutil.copy2(file_path, backup_path)
    print(f"  Backup created: {backup_path.name}")
    return backup_path


def normalize_component_name(name: str) -> str:
    """Convert a component name to PascalCase for the .vue filename."""
    # Remove file extension if present
    name = re.sub(r"\.(txt|vue)$", "", name, flags=re.IGNORECASE)
    # Split by spaces and capitalize each word
    words = name.split()
    return "".join(word.capitalize() for word in words)


def detect_file_type(content: str) -> str:
    """
    Detect the type of file based on its content.
    Returns: 'mixed', 'usage_only', 'code_only', or 'unknown'
    """
    content_lower = content.lower()
    
    # Check for section markers (Usage and Code on their own lines)
    has_usage_marker = bool(re.search(r"^usage\s*$", content, re.MULTILINE | re.IGNORECASE))
    has_code_marker = bool(re.search(r"^code\s*$", content, re.MULTILINE | re.IGNORECASE))
    
    # Check for Vue component patterns
    has_template = "<template>" in content_lower
    has_script = "<script" in content_lower
    
    # Check for import statements (usage pattern)
    has_import = bool(re.search(r'import\s+\w+\s+from\s+["\']\./', content))
    
    if has_usage_marker and has_code_marker:
        return "mixed"
    elif has_usage_marker and not has_code_marker:
        return "usage_only"
    elif has_template and has_script and not has_usage_marker:
        return "usage_only" if has_import else "code_only"
    elif has_import and not has_code_marker:
        return "usage_only"
    
    return "unknown"



def extract_sections(content: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Extract the title, usage section, and code section from a mixed file.
    Returns: (title, usage_content, code_content)
    """
    lines = content.split("\n")
    title = lines[0].strip() if lines else None
    
    usage_start = None
    code_start = None
    installation_line = None
    
    for i, line in enumerate(lines):
        line_stripped = line.strip().lower()
        if line_stripped == "usage":
            usage_start = i + 1
        elif line_stripped == "code":
            code_start = i + 1
        elif line_stripped == "installation":
            installation_line = i
    
    if usage_start is None or code_start is None:
        return title, None, None
    
    # Usage content is between Usage and Code markers
    # But skip Installation section if it exists between them
    usage_lines = []
    for i in range(usage_start, code_start - 1):
        line = lines[i]
        # Skip installation marker and npm install lines
        if line.strip().lower() == "installation":
            continue
        if line.strip().lower().startswith("npm install"):
            continue
        usage_lines.append(line)
    
    usage_content = "\n".join(usage_lines).strip()
    
    # Code content is after Code marker
    code_lines = lines[code_start:]
    code_content = "\n".join(code_lines).strip()
    
    return title, usage_content, code_content


def clean_usage_content(usage_content: str) -> str:
    """Clean up the usage content, removing trailing markers."""
    lines = usage_content.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip().lower()
        if stripped in ["code", "installation"]:
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def process_mixed_file(file_path: Path, dry_run: bool = False) -> Dict[str, Any]:
    """Process a mixed file and split it into .vue and -usage.txt files."""
    result = {
        "file": file_path.name,
        "status": "skipped",
        "vue_file": None,
        "usage_file": None,
        "backup": None,
        "error": None
    }
    
    try:
        content = file_path.read_text(encoding="utf-8")
        title, usage_content, code_content = extract_sections(content)
        
        if not usage_content or not code_content:
            result["status"] = "error"
            result["error"] = "Could not extract usage or code sections"
            return result
        
        component_name = normalize_component_name(title or file_path.stem)
        vue_file = SCRIPT_DIR / f"{component_name}.vue"
        usage_file = SCRIPT_DIR / f"{component_name}-usage.txt"
        
        result["vue_file"] = vue_file.name
        result["usage_file"] = usage_file.name
        
        if dry_run:
            result["status"] = "would_process"
            return result
        
        # Create backup before any changes
        result["backup"] = create_backup(file_path).name
        
        # Clean and write files
        usage_content = clean_usage_content(usage_content)
        vue_file.write_text(code_content, encoding="utf-8")
        print(f"  Created: {vue_file.name}")
        
        usage_file.write_text(usage_content, encoding="utf-8")
        print(f"  Created: {usage_file.name}")
        
        # Remove original
        file_path.unlink()
        print(f"  Removed original: {file_path.name}")
        
        result["status"] = "processed"
        
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
    
    return result



def analyze_folder() -> Dict[str, List[Path]]:
    """Analyze the folder and categorize files."""
    categories = {"mixed": [], "organized": [], "unknown": []}
    
    txt_files = list(SCRIPT_DIR.glob("*.txt"))
    vue_files = list(SCRIPT_DIR.glob("*.vue"))
    
    # Also check for files without extensions (like "Rotating Text")
    for item in SCRIPT_DIR.iterdir():
        if item.is_file() and not item.suffix and item.name != "__pycache__":
            txt_files.append(item)
    
    for txt_file in txt_files:
        # Skip -usage.txt files (already organized)
        if txt_file.name.endswith("-usage.txt"):
            categories["organized"].append(txt_file)
            continue
        
        content = txt_file.read_text(encoding="utf-8")
        file_type = detect_file_type(content)
        
        if file_type == "mixed":
            categories["mixed"].append(txt_file)
        elif file_type in ["usage_only", "code_only"]:
            categories["organized"].append(txt_file)
        else:
            categories["unknown"].append(txt_file)
    
    categories["organized"].extend(vue_files)
    return categories


def print_analysis(categories: Dict[str, List[Path]]) -> None:
    """Print the analysis results."""
    print("\n" + "=" * 60)
    print("FOLDER ANALYSIS")
    print("=" * 60)
    
    print(f"\nFiles needing processing (mixed code+usage): {len(categories['mixed'])}")
    for f in categories["mixed"]:
        print(f"   - {f.name}")
    
    print(f"\nAlready organized files: {len(categories['organized'])}")
    for f in sorted(categories["organized"], key=lambda x: x.name):
        print(f"   - {f.name}")
    
    if categories["unknown"]:
        print(f"\nUnknown/unprocessable files: {len(categories['unknown'])}")
        for f in categories["unknown"]:
            print(f"   - {f.name}")


def main():
    """Main entry point."""
    print("\n" + "=" * 60)
    print("COMPONENT ORGANIZER SCRIPT")
    print("=" * 60)
    print(f"Working directory: {SCRIPT_DIR}")
    print(f"Backup directory: {BACKUP_DIR}")
    
    categories = analyze_folder()
    print_analysis(categories)
    
    if not categories["mixed"]:
        print("\nNo files need processing. Everything is already organized!")
        return
    
    print("\n" + "=" * 60)
    print("PROCESSING FILES")
    print("=" * 60)
    
    results = []
    for file_path in categories["mixed"]:
        print(f"\nProcessing: {file_path.name}")
        result = process_mixed_file(file_path, dry_run=False)
        results.append(result)
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    processed = [r for r in results if r["status"] == "processed"]
    errors = [r for r in results if r["status"] == "error"]
    
    print(f"\nSuccessfully processed: {len(processed)}")
    for r in processed:
        print(f"   {r['file']} -> {r['vue_file']} + {r['usage_file']}")
    
    if errors:
        print(f"\nErrors: {len(errors)}")
        for r in errors:
            print(f"   {r['file']}: {r['error']}")
    
    print(f"\nBackups saved in: {BACKUP_DIR}")
    print("\nDone!")


if __name__ == "__main__":
    main()
