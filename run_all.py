"""
run_all.py  --  Execute the full Geocoding Truck Stops pipeline.

Runs every notebook in the project in dependency order, SKIPPING web-scraping
stages (which require live network access, API keys, and long runtimes).

Scraping outputs are assumed to already exist in output/0_raw/.

Usage:
    python run_all.py              # run everything (except scraping + geocoding API)
    python run_all.py --stage 0    # run only Stage 0  (OCR cleaning)
    python run_all.py --stage 1    # run only Stage 1  (derived merging)
    python run_all.py --stage 2    # run only Stage 2  (analysis)
    python run_all.py --geocode    # also run the Google Geocoding API notebook
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
os.chdir(PROJECT_ROOT)

# Each entry: (stage, label, notebook_path, skip_reason | None)
# skip_reason is a string if the notebook should be skipped by default.
PIPELINE = [
    # ── Stage 0: Raw ingestion ────────────────────────────────────────────
    # 0.1  OCR cleaning (strict sequential order)
    (0, "0.1.1  Standardize addresses",
     "source/0_raw/1_clean_ocr_records/1_standardize_addresses.ipynb", None),
    (0, "0.1.2  Identify proper addresses",
     "source/0_raw/1_clean_ocr_records/2_identify_proper_addresses.ipynb", None),
    (0, "0.1.3  Clean exit addresses",
     "source/0_raw/1_clean_ocr_records/3_clean_exit_addresses.ipynb", None),
    (0, "0.1.4  Extract road info",
     "source/0_raw/1_clean_ocr_records/4_extract_road_info.ipynb", None),
    (0, "0.1.5  Normalize chains",
     "source/0_raw/1_clean_ocr_records/5_normalize_chains.ipynb", None),
    (0, "0.1.6  Extract exit numbers",
     "source/0_raw/1_clean_ocr_records/6_extract_exit_numbers.ipynb", None),
    (0, "0.1.7  Clean source tables",
     "source/0_raw/1_clean_ocr_records/7_clean_source_tables.ipynb", None),
    (0, "0.1.8  Refine address parts",
     "source/0_raw/1_clean_ocr_records/8_refine_address_parts.ipynb", None),
    (0, "0.1.9  Correct exit values",
     "source/0_raw/1_clean_ocr_records/9_correct_exit_values.ipynb", None),

    # 0.2  Scrape truckstops services  (SKIPPED)
    (0, "0.2.1  Seed URLs",
     "source/0_raw/2_scrape_truckstops_services/1_webscraping_truckstops_services_seed_urls.ipynb",
     "scraping"),
    (0, "0.2.2  Full scraping run",
     "source/0_raw/2_scrape_truckstops_services/2_webscraping_truckstops_services_full_run.ipynb",
     "scraping"),

    # 0.3  Scrape Yelp  (SKIPPED)
    (0, "0.3.1  Yelp full run",
     "source/0_raw/3_scrape_yelp/1_webscraping_yelp_full_run.ipynb",
     "scraping"),

    # 0.4  Scrape YellowPages  (SKIPPED — JavaScript based)
    # 0.5  Scrape iExit        (SKIPPED — JavaScript based)

    # ── Stage 1: Derived merging ──────────────────────────────────────────
    (1, "1.1.1  Merge truckstops services records",
     "source/1_derived/1_merge_truckstops_services/1_merge_truckstops_services_records.ipynb", None),

    (1, "1.2.1  Match Yelp phone records",
     "source/1_derived/2_merge_yelp/1_match_phone_records.ipynb", None),
    (1, "1.2.2  Build Yelp match-rate flags",
     "source/1_derived/2_merge_yelp/2_build_match_rate_flags.ipynb", None),
    (1, "1.2.3  Reorder Yelp reference rows",
     "source/1_derived/2_merge_yelp/3_reorder_reference_rows.ipynb", None),
    (1, "1.2.4  Assign place identifiers",
     "source/1_derived/2_merge_yelp/4_assign_place_identifiers.ipynb", None),
    (1, "1.2.5  Detect place changes",
     "source/1_derived/2_merge_yelp/5_detect_place_changes.ipynb", None),

    (1, "1.3.1  Match YellowPages phone records",
     "source/1_derived/3_merge_yellowpages/1_match_phone_records.ipynb", None),
    (1, "1.3.2  Build YellowPages match-rate flags",
     "source/1_derived/3_merge_yellowpages/2_build_match_rate_flags.ipynb", None),

    (1, "1.4.1  Join all scraped sources",
     "source/1_derived/4_merge_all/1_join_all_scraped_sources.ipynb", None),
    (1, "1.4.2  Cross-source distances",
     "source/1_derived/4_merge_all/2_cross_source_distances.ipynb", None),
    (1, "1.4.3  Add manual review columns",
     "source/1_derived/4_merge_all/3_add_manual_review_columns.ipynb", None),
    (1, "1.4.4  Assemble final coordinates",
     "source/1_derived/4_merge_all/4_assemble_final_coordinates.ipynb", None),
    (1, "1.4.5  Geocode proper addresses (API)",
     "source/1_derived/4_merge_all/5_geocode_proper_addresses.ipynb",
     "geocoding_api"),
    (1, "1.4.6  Select final columns",
     "source/1_derived/4_merge_all/6_select_final_columns.ipynb", None),
    (1, "1.4.7  Apply manual fixes",
     "source/1_derived/4_merge_all/7_apply_manual_fixes.ipynb", None),
    (1, "1.4.8  Build supplementary",
     "source/1_derived/4_merge_all/8_build_supplementary.ipynb", None),

    # ── Stage 2: Analysis ─────────────────────────────────────────────────
    (2, "2.1.1  Analyze truckstops services match rates",
     "source/2_analysis/1_analyze_truckstops_services/1_analyze_truckstops_services_match_rates.ipynb", None),
    (2, "2.1.2  Review truckstops services match quality",
     "source/2_analysis/1_analyze_truckstops_services/2_review_truckstops_services_match_quality.ipynb", None),
    (2, "2.3.1  Analyze YellowPages match rates",
     "source/2_analysis/3_analyze_yellowpages/1_analyze_yellowpages_match_rates.ipynb", None),
    (2, "2.3.2  Review YellowPages match quality",
     "source/2_analysis/3_analyze_yellowpages/2_review_yellowpages_match_quality.ipynb", None),
    (2, "2.4.1  Map all sources",
     "source/2_analysis/4_analyze_merge_all/1_map_all_sources.ipynb", None),
    (2, "2.4.2  Flag disagreements",
     "source/2_analysis/4_analyze_merge_all/2_flag_disagreements.ipynb", None),
    (2, "2.4.3  Distance distributions",
     "source/2_analysis/4_analyze_merge_all/3_distance_distributions.ipynb", None),
    (2, "2.4.4  Per-source distances",
     "source/2_analysis/4_analyze_merge_all/4_per_source_distances.ipynb", None),
    (2, "2.4.5  Post-reconciliation maps",
     "source/2_analysis/4_analyze_merge_all/5_post_reconciliation_maps.ipynb", None),
    (2, "2.4.6  Simple geocoding accuracy",
     "source/2_analysis/4_analyze_merge_all/6_simple_geocoding_accuracy.ipynb",
     "geocoding_api"),
    (2, "2.4.7  Improved geocoding accuracy",
     "source/2_analysis/4_analyze_merge_all/7_improved_geocoding_accuracy.ipynb",
     "geocoding_api"),
    (2, "2.4.8  Strict geocoding accuracy",
     "source/2_analysis/4_analyze_merge_all/8_strict_geocoding_accuracy.ipynb",
     "geocoding_api"),
    (2, "2.4.9  Strict improved geocoding accuracy",
     "source/2_analysis/4_analyze_merge_all/9_strict_improved_geocoding_accuracy.ipynb",
     "geocoding_api"),
    (2, "2.4.10 Missing values analysis",
     "source/2_analysis/4_analyze_merge_all/10_missing_values_analysis.ipynb", None),
    (2, "2.4.11 Completion rate by state",
     "source/2_analysis/4_analyze_merge_all/11_completion_rate_by_state.ipynb", None),
]


# ---------------------------------------------------------------------------
# Notebook execution
# ---------------------------------------------------------------------------

def extract_code(nb_path: str) -> str:
    """Extract all code cells from a notebook, stripping IPython magics."""
    with open(nb_path, encoding="utf-8-sig") as f:
        nb = json.load(f)
    cells = []
    for cell in nb["cells"]:
        if cell["cell_type"] != "code":
            continue
        src = "".join(cell["source"])
        lines = []
        for line in src.split("\n"):
            stripped = line.strip()
            if stripped.startswith("%") or stripped.startswith("!"):
                continue
            lines.append(line)
        cells.append("\n".join(lines))
    return "\n\n".join(cells)


def _configure_non_interactive():
    """Disable interactive plot display for headless execution."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.show = lambda *a, **kw: None  # no-op

    try:
        import plotly.io as pio
        pio.renderers.default = "json"  # non-blocking renderer
        # Suppress fig.show() to avoid dumping large JSON to stdout
        import plotly.graph_objects as go
        go.Figure.show = lambda *a, **kw: None
    except ImportError:
        pass

    os.environ.setdefault("MPLBACKEND", "Agg")


def run_notebook(nb_path: str, label: str) -> bool:
    """Execute a notebook's code cells. Returns True on success."""
    print(f"\n{'=' * 64}")
    print(f"  {label}")
    print(f"  {nb_path}")
    print(f"{'=' * 64}")

    if not Path(nb_path).exists():
        print("  SKIPPED (file not found)")
        return True

    code = extract_code(nb_path)
    globs: dict = {
        "__name__": "__main__",
        "__file__": nb_path,
        "display": print,          # Jupyter display() fallback
    }

    t0 = time.time()
    try:
        exec(compile(code, nb_path, "exec"), globs)
    except Exception as e:
        elapsed = time.time() - t0
        print(f"  FAILED ({elapsed:.1f}s): {e}")
        return False

    elapsed = time.time() - t0
    print(f"  OK ({elapsed:.1f}s)")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Run Geocoding Truck Stops pipeline")
    parser.add_argument("--stage", type=int, default=None,
                        help="Run only this stage (0, 1, or 2)")
    parser.add_argument("--geocode", action="store_true",
                        help="Include the Google Geocoding API notebook (requires API key in .env)")
    args = parser.parse_args()

    _configure_non_interactive()
    skip_reasons = {"scraping"}          # always skip scraping
    if not args.geocode:
        skip_reasons.add("geocoding_api")  # skip unless --geocode

    steps = PIPELINE
    if args.stage is not None:
        steps = [(s, l, p, r) for s, l, p, r in steps if s == args.stage]

    total = 0
    skipped = 0
    passed = 0
    failed = 0
    failures = []

    for stage, label, nb_path, skip_reason in steps:
        total += 1
        if skip_reason in skip_reasons:
            print(f"\n  SKIP  {label}  ({skip_reason})")
            skipped += 1
            continue
        ok = run_notebook(nb_path, label)
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append(label)

    print(f"\n{'=' * 64}")
    print(f"  SUMMARY: {passed} passed, {failed} failed, {skipped} skipped  (total {total})")
    if failures:
        print("  Failures:")
        for f in failures:
            print(f"    - {f}")
    print(f"{'=' * 64}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
