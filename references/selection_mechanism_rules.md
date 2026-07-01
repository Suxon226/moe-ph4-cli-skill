# Mechanism-Aware Pharmacophore Selection Rules

This file defines transferable rules for compressing MOE pharmacophore candidates
into a selected model. It intentionally avoids target names, residue numbers, and
paper-specific examples. The rules are structural chemistry principles.

## 1. Core Concept

A pharmacophore is not a list of the strongest surface annotations. It is a
compact set of spatial constraints that a molecule must satisfy to bind a
defined site.

Raw MOE candidates answer:

```text
What chemical features can be annotated on this structure?
```

Selected pharmacophore compression answers:

```text
Which independent constraints define binding at this site?
```

These are different questions. A mature workflow must keep them separate.

## 2. Candidate Sources

Use two parallel candidate sources and merge them before compression.

### Layer 1: MOE Native Candidates

Generate with MOE pharmacophore functions:

- receptor annotation in the site region;
- ligand/receptor or peptide/receptor pair annotation when a ligand or peptide is present;
- excluded volume and shape constraints when the binding pocket requires them.

MOE native candidates provide standardized `.ph4` features and are useful for
reproducibility, visualization, and downstream screening.

### Layer 2: Contact-Derived Mechanism Candidates

Generate from atom-level structure analysis:

- backbone or side-chain hydrogen bonds;
- salt bridges and charge clamps;
- hydrophobic and aromatic wall contacts;
- cation-pi or pi-pi interactions;
- terminal anchors and peptide register points;
- metal, ion, cofactor, or water-mediated constraints;
- shape boundaries, entry channels, and excluded-volume walls.

This layer captures features that receptor-only annotation often misses,
especially peptide-side and interface-driven constraints.

## 3. Site Definition

The site must be defined before candidate generation.

### Preferred Definition

Use atom-to-atom minimum distance:

```text
site receptor atom = any receptor atom within D Angstrom of any ligand/peptide/site atom
```

Recommended shells:

- `<= 3.5 A`: direct hydrogen bond, salt bridge, metal coordination, close polar contact.
- `<= 4.5 A`: direct hydrophobic, aromatic, or polar support.
- `<= 6.0 A`: binding-site shell for feature selection.
- `<= 8.0 A`: broad induced pocket, cofactor, nucleotide, large ligand, or secondary wall.

### Avoid

Do not define peptide or extended-ligand pockets by ligand centroid distance.
Centroids can fall outside the true binding path and systematically exclude
terminal or elongated contact regions.

## 4. Chain and Assembly Rules

Never assume the first chain is correct.

Before annotation, classify:

- receptor protein chains;
- ligand or peptide chains;
- nucleic acid chains;
- cofactors, nucleotides, metals, ions, and waters;
- symmetry or biological assembly copies;
- engineered tags or crystallographic artifacts.

For each chain copy, evaluate:

- proximity to ligand/peptide/site atoms;
- completeness of local residues;
- whether the chain copy contributes to the intended pocket;
- whether duplicate chains create redundant candidates.

If multiple receptor chains form one pocket, annotate the pocket as a multi-chain
site. If multiple equivalent copies exist, select one canonical copy and record
the choice.

## 5. Feature Family Rules

Normalize all candidates into:

```text
HBD, HBA, Hyd, Aro, Pos, Neg, Metal, ExcludedVolume, Mixed
```

Use the detailed family definitions in
`family_compression_segment_rules_zh.md`.

General rules:

- Polar features are valuable when they define register, directionality, or
  selectivity.
- Hydrophobic features are valuable when they represent a buried wall, groove,
  floor, or anchor, not merely a solvent-exposed nonpolar surface.
- Aromatic features are valuable when planar geometry or pi interactions matter.
- Charged features are valuable when protonation and geometry support a salt
  bridge, charge clamp, or electrostatic steering role.
- Excluded-volume features are valuable when they encode shape selectivity or
  prevent false positives in screening.
- Mixed features must be resolved by local geometry before final selection.

## 6. Compression Algorithm

Use this algorithm for selected model construction.

### Step 1: Gate Candidates by Site

Keep candidates that satisfy at least one:

- within the direct contact shell of ligand/peptide/site atoms;
- inside a receptor pocket zone connected to the binding path;
- representing a shape wall, entrance, terminal anchor, or secondary wall with
  structural support;
- derived from an explicit receptor-ligand/peptide contact.

Remove candidates that are:

- far from the intended site;
- located on unrelated chain copies;
- solvent-exposed with no matching ligand-accessible trajectory;
- artifacts from water, ions, alternate locations, or unresolved atoms unless
  explicitly justified.

### Step 2: Cluster Redundant Features

Cluster by spatial proximity and family:

- polar same-family near-duplicates: typically merge within `2.0-2.5 A`;
- hydrophobic/aromatic wall duplicates: typically merge within `3.0-4.0 A`;
- charged or metal features: merge conservatively and keep direction-specific
  points when geometry differs;
- excluded volumes: cluster by wall or boundary region, not just distance.

Each cluster should produce one representative unless separate ligand vectors or
opposite walls make them independent.

### Step 3: Identify Binding Zones

Partition the site into zones:

- central anchor;
- terminal anchor;
- polar register zone;
- hydrophobic or aromatic wall;
- charge clamp;
- entrance or exit vector;
- shape boundary;
- cofactor/metal/water-mediated zone where relevant.

Zone definitions should come from geometry and contacts, not from residue names.

### Step 4: Select Representatives

Select features by independent constraint value:

1. Choose high-support candidates that cover distinct zones.
2. Prefer candidates with direct atom contact or pair annotation.
3. Ensure polar directionality and hydrophobic/aromatic anchoring are both
   considered when present.
4. Add charged, metal, or excluded-volume features only when they encode a
   real binding constraint.
5. Penalize candidates that duplicate an already selected feature in the same
   zone and family.
6. Stop when adding another feature no longer adds a new independent constraint.

Typical selected models contain `4-8` features. Larger sites, macrocycles,
multi-chain interfaces, or highly directional screening models may justify more.

### Step 5: Assign Roles

Each selected feature must have a role such as:

- `polar_register`
- `core_anchor`
- `terminal_anchor`
- `hydrophobic_wall`
- `aromatic_wall`
- `charge_clamp`
- `shape_boundary`
- `metal_or_cofactor_constraint`
- `exit_vector`

The role explains design meaning; family alone is insufficient.

## 7. Scoring Formula

Use a transparent score. One practical form:

```text
selection_score =
  site_support
  + contact_support
  + family_coverage_gain
  + zone_coverage_gain
  + geometry_quality
  + source_confidence
  - redundancy_penalty
  - exposure_penalty
  - ambiguity_penalty
```

Suggested ranges:

- `site_support`: 0-3
- `contact_support`: 0-4
- `family_coverage_gain`: 0-3
- `zone_coverage_gain`: 0-4
- `geometry_quality`: 0-3
- `source_confidence`: 0-2
- penalties: 0-5 each

Scores are for ranking only. The final model must still pass the mechanistic
acceptance checklist.

## 8. Hydrophobic and Aromatic Wall Rules

Hydrophobic and aromatic candidates are often under-selected by naive workflows.
Use these rules:

- Promote a hydrophobic candidate when it lies in a buried groove, wall, floor,
  or terminal pocket and is supported by ligand/peptide nonpolar atoms.
- Promote an aromatic candidate when the planar face or edge defines orientation,
  pi stacking, cation-pi interaction, or a rigid wall.
- Down-rank hydrophobic candidates that are solvent-exposed, isolated, or not
  aligned with a ligand-accessible vector.
- If several hydrophobic points form one wall, keep one representative wall
  feature plus shape boundaries rather than many redundant Hyd points.

## 9. Polar Register Rules

Polar candidates define specificity only when geometry is credible.

Promote polar points when:

- donor-acceptor geometry is plausible;
- the point participates in a network or repeated register;
- it anchors a terminus, turn, or backbone alignment;
- loss of the interaction would allow a different binding register.

Down-rank polar points when:

- donor/acceptor direction is unresolved;
- the point is exposed and not paired with ligand/peptide geometry;
- multiple nearby points represent the same chemical constraint.

## 10. Charge, Metal, and Water Rules

- Charge features require protonation and geometry checks.
- Metal features require coordination geometry and atom identity checks.
- Water-mediated features are optional and should be marked lower confidence
  unless the water is conserved, buried, and geometrically central.
- Cofactors and nucleotides can define pocket geometry; decide whether they are
  retained, displaced, or used as shape/electrostatic context before selecting.

## 11. Output Quality Control

Reject or revise the selected model if:

- most features are outside the intended site;
- features come from an unintended chain copy;
- all features are one family despite chemically diverse contacts;
- hydrophobic/aromatic anchoring is missing from a nonpolar groove;
- polar register is missing from a highly directional peptide interface;
- the model contains near-duplicate points with no new role;
- selected points cannot be displayed in MOE with the structure at the same site;
- feature provenance cannot be explained.

## 12. Report Template

Every selected model report should include:

```text
Site definition:
Chain and ligand policy:
Candidate sources:
Family normalization:
Selected features:
  - idx, family, role, source, coordinates, support evidence, reason
Rejected/merged candidates:
Design implications:
Uncertainty and required follow-up:
MOE files:
```

The report should make the model reusable by another agent or scientist without
needing access to the conversation that produced it.
