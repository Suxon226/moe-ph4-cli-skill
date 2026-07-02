---
name: moe-ph4-cli-v2
description: Version 2.0 MOE pharmacophore workflow skill with literature-driven iteration, strict article-model reconstruction, mechanism-aware compression, and transferable curation rule refinement. Use when the task requires MOE pharmacophore generation, receptor-ligand or receptor-peptide pharmacophore curation, article-model reconstruction, .ph4 query writing, or reproducible pharmacophore workflow automation.
---

# MOE Pharmacophore CLI

Version: 2.0 literature-iterative edition.

Version 1.0 is a stable baseline. Version 2.0 adds a separate literature-driven
iteration layer: collect legitimate article inputs, classify pharmacophore
methodology, reconstruct article-style models when possible, compare mechanism
gaps, and update only transferable curation rules.

This skill turns MOE into a reproducible pharmacophore engine. It is not a simple
surface-feature dump. The required output is a mechanism-curated pharmacophore:
a compact set of spatial and chemical constraints that a ligand, peptide, or
designed molecule must satisfy at a defined binding site.

## Required Reading

Before generating or compressing a pharmacophore, read and apply:

1. `references/master_moe_pharmacophore_workflow_zh.md`
2. `references/selection_mechanism_rules.md`
3. `references/family_compression_segment_rules_zh.md`
4. `references/v2_literature_iteration_protocol_zh.md`
5. `literature_corpus/niu_miaomiao_pharmacophore_corpus.json`
6. `references/api_reference.md`
7. `references/svl_errors.md` when debugging MOE/SVL execution

## Non-Negotiable Principles

1. Do not use the first protein chain by default.
   Identify receptor chains, ligand or peptide chains, cofactors, waters, ions,
   and symmetry copies from the structure and from the user's stated target.

2. Do not use ligand centroid distance as the primary pocket definition.
   For peptides and extended ligands, define the pocket by receptor-atom to
   ligand-atom minimum distances.

3. Do not treat `ph4_AnnotationRec` as a complete pharmacophore.
   Receptor annotation is a candidate source. The selected model must be
   constrained by receptor-ligand or receptor-peptide contacts, pocket geometry,
   feature family balance, and mechanistic nonredundancy.

4. Do not rank selected features by raw feature density or contact count alone.
   Compression must preserve independent binding constraints: polar registration,
   hydrophobic or aromatic anchoring, electrostatic clamps, shape boundaries,
   metal/cofactor coordination where relevant, and ligand-accessible geometry.

5. Do not leave MOE feature expressions unnormalized.
   Convert native expressions such as `Don2`, `Acc2`, `Don$mAcc`, `Hyd`, and
   aromatic or charge annotations into stable feature families before scoring or
   selecting.

6. Do not output an unexplained `.ph4`.
   Every selected feature must carry provenance: source, chain, nearby residues
   or atoms, feature family, role, support distance, redundancy group, and reason
   for inclusion.

## Standard Deliverables

For each pharmacophore job, create a run directory with:

- `00_inputs/`: copied input PDB/MOE files and user config
- `01_structure_qc/structure_qc.json`
- `02_moe_raw/`: MOE-generated `.ph4`, `.moe`, logs, and raw CSV export
- `03_contacts/contact_map.csv`
- `04_candidates/full_features.csv`
- `05_curated/curated_features.csv`
- `05_curated/curated_model.ph4`
- `05_curated/curation_report.md`
- `06_visualization/`: MOE session/script that displays structure plus pharmacophore
- `run_manifest.json`: paths, command lines, tool versions, and checksums

Use names that describe the target class, modality, binding site, or design job.

## Execution Workflow

1. Prepare inputs.
   Require a structure file, target site definition, receptor chain policy, and
   ligand/peptide/cofactor policy. If the site is unknown, run chain and pocket
   inference first and report uncertainty.

2. Run structure QC.
   Detect chains, residue counts, ligands, peptides, nucleotides, cofactors,
   ions, waters, alternate locations, missing atoms, and chain copies.

3. Define the pharmacophore site.
   Prefer receptor-ligand or receptor-peptide atom contacts. Use 4.5-5.0 A for
   direct polar/contact support, 6.0 A for binding-site shell, and 8.0 A only for
   broad cofactors, nucleotides, induced pockets, or secondary walls.

4. Generate MOE raw candidate features.
   Use MOE native pharmacophore functions through `moebatch`. Generate receptor
   annotation in the pocket region and, when ligand or peptide atoms are present,
   generate interaction-pair candidates. Keep both raw `.ph4` and parsed CSV.

5. Add contact-derived mechanism candidates.
   Build candidates from atom-level contacts that MOE receptor annotation can
   miss: backbone hydrogen bonds, terminal clamps, peptide-side donors/acceptors,
   hydrophobic ridges, aromatic walls, charge pairs, metal/ion coordination, and
   water-mediated constraints when supported.

6. Normalize feature families.
   Convert all candidates into `HBD`, `HBA`, `Hyd`, `Aro`, `Pos`, `Neg`,
   `Metal`, `ExcludedVolume`, or `Mixed`. Preserve the original MOE expression.

7. Compress by mechanism.
   Use `scripts/master_moe_ph4_curate.js` or an equivalent implementation of
   the same rules. The selected model should be compact, nonredundant, and
   family-balanced, with one representative per independent binding zone.

8. Export and visualize.
   Write `.ph4`, `curated_features.csv`, and a MOE display script/session that
   shows receptor, ligand or peptide if present, pocket residues, full candidates,
   and selected pharmacophore together.

9. Quality control.
   Confirm that selected features are inside the intended site, ligand-accessible,
   not all from one chain copy, not all one family, and not redundant near-duplicates.

## MOE Path Discovery

Common Windows MOE path:

```powershell
$moeBin = "C:\Program Files\moe2024\bin-win64"
$moebatch = Join-Path $moeBin "moebatch.exe"
Test-Path $moebatch
```

When spaces or non-ASCII paths cause SVL trouble, copy the needed run files to a
short ASCII work directory under `C:\tmp`, run MOE there, and copy outputs back.

## Script Entry Points

Use these reusable scripts from this skill:

- `scripts/master_ph4_config.example.json`: configuration template
- `scripts/master_moe_ph4_curate.js`: mechanism-aware selected model builder
- `scripts/write_selected_ph4.js`: CSV to MOE `.ph4` writer
- `scripts/structure_qc.js`: chain, ligand, peptide, cofactor, and pocket QC

Typical curation call:

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli\scripts\master_moe_ph4_curate.js `
  --config C:\path\to\run\config.json
```

The config must point to the PDB structure and to the MOE full feature CSV.
If a ligand, peptide, or site residue set is present, declare it explicitly.

## SVL Guardrails

- Use `/` path separators inside SVL strings.
- Declare MOE functions used by batch scripts.
- Avoid `Atoms c(1)` unless the config explicitly selects chain 1.
- Prefer site-restricted atom sets over whole-receptor annotation.
- Use `ph4_AnnotationPairs` or contact-derived candidates whenever ligand or
  peptide atoms are present.
- Always write a marker file and MOE log for batch execution.

## Output Acceptance Checklist

A pharmacophore model is acceptable only if:

- The site definition is documented.
- The receptor and ligand/peptide chain choices are documented.
- Full candidates include MOE native features and contact-derived candidates
  where ligand or peptide geometry exists.
- The selected model contains independent constraints rather than duplicate
  points in one local patch.
- Hydrophobic/aromatic, polar, charged, and shape roles are considered according
  to pocket chemistry, not forced to a fixed quota.
- The `.ph4` opens in MOE together with the structure and displays at the
  intended site.
- The report explains why each selected feature was kept and what design role it
  serves.
