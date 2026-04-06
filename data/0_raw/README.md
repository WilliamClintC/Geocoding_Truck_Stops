# data/

All data files live here. **Never edit raw files by hand.**

## Structure

| Subfolder   | Contents                                           |
|-------------|----------------------------------------------------|
| `raw/`      | Original data as received/downloaded               |
| `derived/`  | Cleaned and processed datasets (produced by code)  |

## Naming
Dataset folders use **standalone descriptive names** (not task names),
because a single dataset is often shared across many downstream tasks.
Example: `data/raw/redfin_dta/`, `data/derived/redfin_event_trees/`

## Documentation
Codebooks and data use agreements live in `docs/document_codebooks/`.
Each raw dataset folder should have a `README.md` documenting:
- Source (URL, institution, contact)
- Date obtained
- Version / vintage
- Terms of use
- Variable coverage

