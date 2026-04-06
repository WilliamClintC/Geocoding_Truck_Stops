# docs/

Project documentation.

## Subdirectories

### write_weekly_reports/
RA progress reports, one `.qmd` file per week, compiled to PDF via Quarto.

**Template:** `write_weekly_reports/_report_template.qmd` (underscore prefix keeps it sorted to the top)

Naming convention: `YYYYMMDD_task<N>_<purpose>_<name>.qmd`  
Example: `20260305_task1_sumstats_clintonco.qmd`

Date-first naming ensures VS Code Explorer automatically sorts reports newest-to-oldest.
The `.qmd` title should match: `Task <N>: <Purpose>`.

Workflow:
1. Copy `_report_template.qmd` to `YYYYMMDD_task<N>_<purpose>_<name>.qmd`
2. Fill in sections: Progress, Data Work, Analysis, Issues, Next Steps
3. Compile: `quarto render YYYYMMDD_task<N>_<purpose>_<name>.qmd`
4. Commit both the `.qmd` source and the rendered `.pdf`

Path conventions inside `.qmd` files:
- Data: `../../data/1_derived/<dataset>.csv`
- Figures: `../../output/2_analysis/figures/<figure>.png`
- Tables: `../../output/2_analysis/tables/<table>.tex`

### document_codebooks/
Data dictionaries, codebooks, and data use agreements for each dataset.
One subfolder per dataset, mirroring `data/0_raw/`.

