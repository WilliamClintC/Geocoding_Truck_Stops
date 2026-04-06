# source/

All code scripts live here, organized by pipeline stage.
Supported languages: **Stata** (`.do`), **R** (`.R`), **Python** (`.py`), **Jupyter** (`.ipynb`).

## Task naming convention
Each task gets its own subfolder: **verb + noun**, snake_case.
Examples: `process_redfin_raw`, `preclean_redfin`, `sumstats_main`

| Stage         | What it does                                      | Data flows to           | Languages          |
|---------------|---------------------------------------------------|-------------------------|-----------------|
| `0_raw/`      | Ingest raw files, convert formats, append         | `data/0_raw/`           | `.do` `.py`     |
| `1_derived/`  | Clean, reshape, merge, transform                  | `data/1_derived/`       | `.do` `.py` `.R`|
| `2_analysis/` | Regressions, summary stats, tables, figures       | `output/2_analysis/`    | `.R` `.ipynb`   |

## Working directory
All scripts assume the **project root** as the working directory.
- **Stata:** `stata-mp -e do source/0_raw/<task>/<task>.do` (or add to `run_all.py`)
- **R:** `setwd(here::here())` at top of script, or open via `.Rproj`
- **Jupyter:** launch `jupyter notebook` from the project root terminal

Use relative paths from the project root in every script. Never use absolute paths.

## Log files
Every script should log to `output/<stage>/<task>/<task>.log`.
- **Stata batch mode:** `stata-mp -e do source/0_raw/<task>/<task>.do`
- **R:** `sink("output/2_analysis/<task>/<task>.log", split = TRUE)`
- **Jupyter:** export executed notebook to `output/2_analysis/<task>/<task>.ipynb`

## lib/
Shared helper scripts used across multiple tasks.
- `.ado` files for Stata
- `.R` files for shared R functions
- `.py` modules for shared Python utilities
