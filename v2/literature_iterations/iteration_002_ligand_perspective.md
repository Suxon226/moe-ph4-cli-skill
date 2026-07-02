# Literature-Driven Iteration Report 002

## Article-Style Target

This iteration uses a structure-based peptide-pocket pharmacophore article as a strict reconstruction template. The public article describes a five-feature model with the following broad family composition:

- hydrophobic anchor
- anionic/acceptor acidic group
- acceptor
- donor/acceptor mixed polar feature
- aromatic feature

The goal of this iteration is not to memorize the target, but to test whether the workflow can generate an article-style ligand/peptide pharmacophore from structure contacts.

## Input

- Structure: `3Q1I.pdb`
- Receptor chain: `A`
- Ligand/peptide chain: `E`
- Candidate source in this prototype: contact-derived features only
- Selected feature count: 5
- Feature perspective: ligand-side

## Iteration 001 Problem

The first run used a receptor-complement contact interpretation. That produced chemically plausible interaction complements, but it did not match article-style ligand pharmacophore semantics.

Observed issue:

- receptor acidic contacts could become `Pos`, even though the article-style pharmacophore should describe the ligand/peptide functional group;
- strong anionic ligand groups could be simplified as generic polar atoms;
- hydrophobic/aromatic wall compression was not explicitly protected.

## Iteration 002 Rule Change

Added `feature_perspective` to the v2 curation script.

- `ligand`: feature family describes the design molecule or peptide functional group.
- `receptor_complement`: feature family describes the complementary group needed to bind a receptor feature.

For article-style ligand/peptide pharmacophore reconstruction, the default is now `ligand`.

Additional chemistry update:

- phosphorylated, sulfated, nucleotide-like, and strongly anionic residues/groups are promoted toward `Neg/HBA` rather than plain HBA.

## Transferable Lesson

Author-style MOE Query pharmacophores often place feature spheres at ligand-satisfiable positions. Therefore, strict reconstruction must first decide the feature perspective. Without this decision, the same atom contact can be interpreted with opposite chemistry.

This lesson is transferable and has been added to:

`C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\references\v2_transferable_rule_deltas_zh.md`

## Remaining Gaps

This prototype still lacks:

- MOE native full feature generation for the same pocket;
- article figure coordinate extraction;
- GH score/enrichment validation;
- optional/required feature state reconstruction;
- explicit hydrophobic-wall quota protection.

Next iteration should combine MOE-native full candidates with contact-derived ligand-side candidates, then compare against article-style family and spatial-region targets.
