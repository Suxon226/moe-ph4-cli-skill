# moe-ph4-cli-v2

Final-core correction: after MOE generation and mechanism curation, always split
the output into `selected_candidates` and `final_core_features`. For ordinary
structure-based pocket/interface models, use 4 mandatory features by default and
put the fifth feature in optional evidence unless it represents an independent
subpocket, extended-groove endpoint, or new spatial mechanism role. Do not allow
interaction-pair, ligand-side/pair-derived features, or repeated charged anchors
to crowd out one representative feature per spatial mechanism region.

Use this skill for MOE-based pharmacophore construction, mechanism-curated feature compression, evidence-target comparison, and validation-guided improvement. Version 2 keeps the 1.0 master workflow stable and adds a public-evidence/validation loop that can deepen rules without memorizing target names, PDB IDs, residue numbers, or source-specific feature IDs.

## Operating Principles

1. MOE is the primary raw pharmacophore engine. Treat MOE as user-installed licensed software; this skill does not include MOE binaries, license files, authorization codes, proprietary databases, or license bypassing.
2. The LLM is the curator, not the raw feature generator. Use MOE/structure evidence to create the candidate pool, then compress by mechanism.
3. Pharmacophore features are spatial chemical hypotheses. Do not blindly copy all MOE annotations, contact atoms, residues, or external figures.
4. Preserve transferability. Rules must be phrased as pocket geometry, chemistry, evidence tier, feature perspective, and screening utility, not as specific protein memories.
5. Show the final pharmacophore and structure together in MOE before concluding.

## Required Workflow

1. Confirm modeling method before generating features:
   - decide whether the task is single-structure, multi-structure consensus, ligand-training-set, or hybrid-validation modeling.
   - choose how many PDBs or conformers should participate and document inclusion/exclusion reasons.
   - use `references/modeling_method_confirmation_zh.md`.
2. Prepare inputs in a fresh run directory:
   - `00_inputs/structure.pdb`
   - optional ligand/peptide/cofactor notes
   - optional validation-target JSON for comparison
3. Run structure QC:
   - identify receptor chains, peptide/ligand chains, cofactors, metals, waters, missing segments, and contact zones.
   - script: `scripts/structure_qc.js`
4. Generate MOE raw candidates:
   - script: `scripts/moe_native_site_ph4.js`
   - output: `02_moe_raw/moe_raw_site_query.ph4`, `02_moe_raw/moe_raw_features.csv`, MOE log, manifest.
5. For multi-structure evidence, build consensus before final compression:
   - script: `scripts/consensus_multistructure_ph4.js`
   - output: aligned raw features, consensus clusters, consensus `.ph4`, alignment summary.
6. Normalize and curate candidates:
   - script: `scripts/master_moe_ph4_curate.js`
   - output: `05_curated/curated_features.csv`, `05_curated/curated_model.ph4`, `curation_report.md`, display SVL.
7. Display pharmacophore with structure in MOE:
   - use generated `.ph4` and display helper SVL.
8. If validation-target evidence is available, compare after generation:
   - script: `scripts/compare_validation_target.js`
   - output: strict/region coverage, missing zones, redundant selected features.
9. Update transferable rules only when an error recurs across mechanism classes. Never add target-specific memorized fixes.

## Standard Directory Layout

- `00_inputs/`: structures, ligand/peptide notes, user-provided public inputs.
- `01_structure_qc/`: chain and pocket QC.
- `02_moe_raw/`: MOE raw pharmacophore files, logs, manifests.
- `03_contacts/`: contact maps and geometric evidence.
- `04_candidates/`: normalized full candidate features.
- `05_curated/`: selected pharmacophore model and curation report.
- `06_visualization/`: MOE display helpers.
- `06_comparison/`: validation-target comparison, GH/enrichment reports when available.
- `07_reports/`: final audit trail.

## Scripts

- `scripts/structure_qc.js`: PDB chain, residue, ligand/peptide, and contact QC.
- `scripts/moe_native_site_ph4.js`: generates structure-contact raw candidates and uses MOE `ph4_QueryCreateF/ph4_QueryWriteFile` to write the raw `.ph4`.
- `scripts/consensus_multistructure_ph4.js`: aligns multiple receptor structures, transforms raw feature CSVs into one reference frame, clusters consensus hotspots, and writes an validation-target consensus `.ph4` through MOE.
- `scripts/master_moe_ph4_curate.js`: mechanism-curates normalized full candidate CSV into selected `.ph4`.
- `scripts/write_selected_ph4.js`: writes selected features to `.ph4`.
- `scripts/compare_validation_target.js`: compares curated features with validation-target JSON.
- `scripts/master_ph4_config.example.json`: curation config template.
- `scripts/moe_native_config.example.json`: MOE raw generation config template.
- `scripts/validation_target.example.json`: validation target comparison template.

## Required References

Read these as needed for the task:

- `references/master_moe_pharmacophore_workflow_zh.md`: 1.0 stable master workflow.
- `references/modeling_method_confirmation_zh.md`: method confirmation and PDB/conformer selection rules.
- `references/v2_moe_native_generation_protocol_zh.md`: MOE-native raw generation layer.
- `references/v2_mechanism_compression_deep_rules_zh.md`: generalized mechanism-compression rules.
- `references/v2_validation_target_comparison_zh.md`: validation-target extraction and strict/region comparison.
- `references/v2_public evidence_iteration_protocol_zh.md`: how to iterate against public evidence without overfitting.
- `references/v2_transferable_rule_deltas_zh.md`: rule deltas discovered during v2 iterations.
- `references/selection_mechanism_rules.md`: selection and ranking logic.
- `references/family_compression_segment_rules_zh.md`: family and segment compression.
- `references/api_reference.md`: MOE/SVL pharmacophore API notes.
- `references/svl_errors.md`: known MOE/SVL failure modes.
- `references/v2_moe_svl_adapter_notes_zh.md`: smoke-tested MOE/SVL adapter constraints for `moebatch -run`.
- `references/local_runtime_error_experience_pack_zh.md`: local MOE/PowerShell/Node/SVL runtime error experience package.
- `public evidence_corpus/niu_miaomiao_pharmacophore_corpus.json`: public-evidence corpus for rule iteration.

## MOE Raw Generation

Example:

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\moe_native_site_ph4.js `
  --config C:\path\to\moe_native_config.json --run
```

The generated SVL is intentionally inspectable. Current v2 adapter writes a standard raw candidate CSV from structure-contact preannotation, then asks MOE to write the `.ph4` query. If a MOE version changes function signatures, inspect `02_moe_raw/moe_native_site_ph4.log`, `references/svl_errors.md`, and `references/local_runtime_error_experience_pack_zh.md`, then adjust only the MOE adapter layer. Do not weaken the downstream mechanism-curation rules to compensate for an upstream extraction issue.

## Validation-Target Comparison

Example:

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\compare_validation_target.js `
  --candidate-csv C:\path\to\curated_features.csv `
  --target-json C:\path\to\validation_target.json `
  --out-dir C:\path\to\06_comparison
```

Interpretation:

- `selected strict`: same family and near-identical coordinates.
- `selected region`: same mechanism region within validation-level tolerance.
- high full-candidate coverage but low selected coverage means compression/ranking failed.
- low full-candidate coverage means upstream structure/MOE/site perspective failed.

## Curation Rules

1. Lock feature perspective first. Most query pharmacophores describe ligand/peptide-side functional groups.
2. Strong ionic groups keep their dominant family: phosphate/sulfate/carboxylate as `Neg` with possible `HBA` alias; guanidinium/protonated amines as `Pos`.
3. Aromatic walls are projected to ligand-side `Aro` only when shape/π recognition is discriminating; otherwise compress to `Hyd`.
4. Same microzone and same mechanism should be represented by one selected feature unless two independent chemical hypotheses are required.
5. Buried, directional, low-substitutability features outrank exposed or solvent-replaceable annotations.
6. Do not tune rules to reproduce a specific public source. Add a rule only if it can be justified by general physical chemistry or model-validation logic.

## Completion Criteria

A run is complete only when it contains:

- structure QC record,
- MOE raw generation record or explicit MOE failure log,
- full candidate pool,
- mechanism-curated selected `.ph4`,
- final core pharmacophore layer with 4-6 mandatory features by default,
- structure-plus-pharmacophore display artifact,
- curation report with feature perspective and compression rationale,
- comparison report when validation-target evidence is available.

## Final Core Compression Addendum

Always separate the broad `selected_candidates` evidence layer from the true `final_core_features` model. The final core model is the one used for design, screening, and MOE display. By default it should contain 4 mandatory features plus 0-1 optional evidence feature, each representing an independent spatial mechanism role rather than a repeated atom-level contact.

Before final delivery, read and apply `references/final_core_feature_compression_zh.md`. If the selected candidate layer has more than 4 features, run `scripts/final_core_feature_select.js` or manually apply the same role-coverage logic. The fifth feature should be optional unless the site has an extended, multi-pocket, cross-domain, or multi-subsite groove with independent evidence for that extra point.

