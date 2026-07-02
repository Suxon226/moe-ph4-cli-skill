# Literature-Driven Iteration Report 003

## Purpose

This iteration tests whether a structure-derived article-style pharmacophore can recover a five-feature family composition containing polar, anionic, hydrophobic, and aromatic constraints.

## Input

- Structure: `3Q1I.pdb`
- Receptor chain: `A`
- Ligand/peptide chain: `E`
- Candidate source: contact-derived features
- Feature perspective: ligand-side
- Added rule: receptor aromatic wall projection

## Selected Family Composition

The selected model recovered:

- `HBA`
- `Neg`
- `HBD`
- `Hyd`
- `Aro`

This is substantially closer to an article-style five-feature pharmacophore containing acceptor, anionic/acceptor, donor/acceptor/polar, hydrophobic, and aromatic constraints.

## Mechanistic Interpretation

1. `HBA` and `HBD` features represent polar register constraints.
2. `Neg` represents a strongly anionic ligand-side group, consistent with phosphorylated or acidic motif logic.
3. `Hyd` represents a hydrophobic wall/anchor.
4. `Aro` was recovered only after adding receptor aromatic wall projection, because the template peptide itself does not necessarily contain an aromatic group at the design-equivalent position.

## Transferable Rule Learned

When reconstructing article-style ligand or peptide pharmacophores, a receptor aromatic or pi-rich wall can justify an aromatic projected candidate even when the template ligand atom is aliphatic. This represents a design opportunity: a future molecule may satisfy the same wall with an aromatic or pi-rich group.

This rule is transferable and has been added to:

`C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\references\v2_transferable_rule_deltas_zh.md`

## Remaining Work

To reach strict article-style reconstruction, the next layer must add:

- MOE-native pocket feature generation;
- feature coordinate comparison against article figures or exported article `.ph4`;
- optional/mandatory feature state;
- pharmacophore search validation metrics such as enrichment or GH score;
- explicit support for excluded volumes and shape walls.
