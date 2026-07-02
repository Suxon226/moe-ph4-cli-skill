# moe-ph4-cli-v2

Use this skill for MOE-based pharmacophore construction, mechanism-curated feature compression, article-style comparison, and literature-iterative improvement. Version 2 keeps the 1.0 master workflow stable and adds a literature/validation loop that can deepen rules without memorizing target names, PDB IDs, residue numbers, or article-specific feature IDs.

## Operating Principles

1. MOE is the primary raw pharmacophore engine. Treat MOE as user-installed licensed software; this skill does not include MOE binaries, license files, authorization codes, proprietary databases, or license bypassing.
2. The LLM is the curator, not the raw feature generator. Use MOE/structure evidence to create the candidate pool, then compress by mechanism.
3. Pharmacophore features are spatial chemical hypotheses. Do not blindly copy all MOE annotations, contact atoms, residues, or paper figures.
4. Preserve transferability. Rules must be phrased as pocket geometry, chemistry, evidence tier, feature perspective, and screening utility, not as specific protein memories.
5. Show the final pharmacophore and structure together in MOE before concluding.

## Required Workflow

1. Prepare inputs in a fresh run directory:
   - `00_inputs/structure.pdb`
   - optional ligand/peptide/cofactor notes
   - optional article-style target JSON for validation
2. Run structure QC:
   - identify receptor chains, peptide/ligand chains, cofactors, metals, waters, missing segments, and contact zones.
   - script: `scripts/structure_qc.js`
3. Generate MOE raw candidates:
   - script: `scripts/moe_native_site_ph4.js`
   - output: `02_moe_raw/moe_raw_site_query.ph4`, `02_moe_raw/moe_raw_features.csv`, MOE log, manifest.
4. Normalize and curate candidates:
   - script: `scripts/master_moe_ph4_curate.js`
   - output: `05_curated/curated_features.csv`, `05_curated/curated_model.ph4`, `curation_report.md`, display SVL.
5. Display pharmacophore with structure in MOE:
   - use generated `.ph4` and display helper SVL.
6. If article-style evidence is available, compare after generation:
   - script: `scripts/compare_article_target.js`
   - output: strict/region coverage, missing zones, redundant selected features.
7. Update transferable rules only when an error recurs across mechanism classes. Never add target-specific memorized fixes.

## Standard Directory Layout

- `00_inputs/`: structures, ligand/peptide notes, user-provided public inputs.
- `01_structure_qc/`: chain and pocket QC.
- `02_moe_raw/`: MOE raw pharmacophore files, logs, manifests.
- `03_contacts/`: contact maps and geometric evidence.
- `04_candidates/`: normalized full candidate features.
- `05_curated/`: selected pharmacophore model and curation report.
- `06_visualization/`: MOE display helpers.
- `06_comparison/`: article-style comparison, GH/enrichment reports when available.
- `07_reports/`: final audit trail.

## Scripts

- `scripts/structure_qc.js`: PDB chain, residue, ligand/peptide, and contact QC.
- `scripts/moe_native_site_ph4.js`: generates structure-contact raw candidates and uses MOE `ph4_QueryCreateF/ph4_QueryWriteFile` to write the raw `.ph4`.
- `scripts/master_moe_ph4_curate.js`: mechanism-curates normalized full candidate CSV into selected `.ph4`.
- `scripts/write_selected_ph4.js`: writes selected features to `.ph4`.
- `scripts/compare_article_target.js`: compares curated features with article-style target JSON.
- `scripts/master_ph4_config.example.json`: curation config template.
- `scripts/moe_native_config.example.json`: MOE raw generation config template.
- `scripts/article_target.example.json`: article target comparison template.

## Required References

Read these as needed for the task:

- `references/master_moe_pharmacophore_workflow_zh.md`: 1.0 stable master workflow.
- `references/v2_moe_native_generation_protocol_zh.md`: MOE-native raw generation layer.
- `references/v2_mechanism_compression_deep_rules_zh.md`: generalized mechanism-compression rules.
- `references/v2_article_target_comparison_zh.md`: article-style target extraction and strict/region comparison.
- `references/v2_literature_iteration_protocol_zh.md`: how to iterate against public literature without overfitting.
- `references/v2_transferable_rule_deltas_zh.md`: rule deltas discovered during v2 iterations.
- `references/selection_mechanism_rules.md`: selection and ranking logic.
- `references/family_compression_segment_rules_zh.md`: family and segment compression.
- `references/api_reference.md`: MOE/SVL pharmacophore API notes.
- `references/svl_errors.md`: known MOE/SVL failure modes.
- `references/v2_moe_svl_adapter_notes_zh.md`: smoke-tested MOE/SVL adapter constraints for `moebatch -run`.
- `literature_corpus/niu_miaomiao_pharmacophore_corpus.json`: public literature corpus for rule iteration.

## MOE Raw Generation

Example:

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\moe_native_site_ph4.js `
  --config C:\path\to\moe_native_config.json --run
```

The generated SVL is intentionally inspectable. Current v2 adapter writes a standard raw candidate CSV from structure-contact preannotation, then asks MOE to write the `.ph4` query. If a MOE version changes function signatures, inspect `02_moe_raw/moe_native_site_ph4.log` and `references/svl_errors.md`, then adjust only the MOE adapter layer. Do not weaken the downstream mechanism-curation rules to compensate for an upstream extraction issue.

## Article-Style Comparison

Example:

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\compare_article_target.js `
  --candidate-csv C:\path\to\curated_features.csv `
  --target-json C:\path\to\article_target.json `
  --out-dir C:\path\to\06_comparison
```

Interpretation:

- `selected strict`: same family and near-identical coordinates.
- `selected region`: same mechanism region within article-level tolerance.
- high full-candidate coverage but low selected coverage means compression/ranking failed.
- low full-candidate coverage means upstream structure/MOE/site perspective failed.

## Curation Rules

1. Lock feature perspective first. Most query pharmacophores describe ligand/peptide-side functional groups.
2. Strong ionic groups keep their dominant family: phosphate/sulfate/carboxylate as `Neg` with possible `HBA` alias; guanidinium/protonated amines as `Pos`.
3. Aromatic walls are projected to ligand-side `Aro` only when shape/π recognition is discriminating; otherwise compress to `Hyd`.
4. Same microzone and same mechanism should be represented by one selected feature unless two independent chemical hypotheses are required.
5. Buried, directional, low-substitutability features outrank exposed or solvent-replaceable annotations.
6. Do not tune rules to reproduce a specific paper. Add a rule only if it can be justified by general physical chemistry or model-validation logic.

## Completion Criteria

A run is complete only when it contains:

- structure QC record,
- MOE raw generation record or explicit MOE failure log,
- full candidate pool,
- mechanism-curated selected `.ph4`,
- structure-plus-pharmacophore display artifact,
- curation report with feature perspective and compression rationale,
- comparison report when article-style evidence is available.
