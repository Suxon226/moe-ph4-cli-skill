# moe-ph4-cli

MOE-based pharmacophore construction skill for reproducible, mechanism-aware
pharmacophore generation and curation.

This repository contains:

- `SKILL.md`: agent-facing skill entry point.
- `references/`: transferable workflow and mechanism curation rules.
- `scripts/`: reusable command-line scripts for structure QC, curation, and
  `.ph4` export.

## Core Idea

The workflow does not treat MOE receptor annotations as the final model.
It combines:

1. MOE native pharmacophore candidates.
2. Structure-derived receptor-ligand or receptor-peptide contact candidates.
3. Family normalization.
4. Mechanism-aware selected model compression.
5. MOE visualization of the structure and selected pharmacophore together.

## Minimal Usage

Copy `scripts/master_ph4_config.example.json`, edit paths and chain policies,
then run:

```powershell
node scripts/master_moe_ph4_curate.js --config C:\path\to\config.json
```

The output includes `curated_features.csv`, `curated_model.ph4`,
`display_in_moe.svl`, `curation_report.md`, and `run_manifest.json`.

## Notes

This skill is written as a transferable workflow. It intentionally avoids
target-specific examples, benchmark language, and case-specific residue memory.
