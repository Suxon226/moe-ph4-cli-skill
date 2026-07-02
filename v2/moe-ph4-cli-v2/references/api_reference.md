# MOE Pharmacophore API Reference (ph4_* family)

Complete function signatures for MOE SVL pharmacophore command-line usage.

## Scheme Functions

### ph4_SchemeDefmask
```svl
function ph4_SchemeDefmask;
local mask = ph4_SchemeDefmask 'Unified';  // -> 476156
```
Returns the bitmask of all feature types defined by the scheme.
Must be called before `ph4_AnnotationRec` to get `smask`.

### ph4_SchemeNewFeatureBits
```svl
function ph4_SchemeNewFeatureBits;
local nb = ph4_SchemeNewFeatureBits ['Unified', raw_bits];
```
Normalizes raw annotation bits into the standard scheme feature bits format.
Use BEFORE calling `ph4_SchemeBitsExpr` or `ph4_SchemeBitsRad`.

### ph4_SchemeBitsExpr
```svl
function ph4_SchemeBitsExpr;
local expr = ph4_SchemeBitsExpr ['Unified', feat_bits];
// Returns: 'Don', 'Don2', 'Acc', 'Acc2', 'Don$mAcc', 'Don2$mAcc2', 'Hyd', etc.
```
Converts a normalized feature bitmask into a human-readable expression token.
Returns empty token `[]` for unrecognized bits.

### ph4_SchemeBitsRad
```svl
function ph4_SchemeBitsRad;
local rv = ph4_SchemeBitsRad ['Unified', feat_bits];
local radius = max rv;  // rv is a vector, use max to get scalar
// Typical values: [1.4] for Don2/Acc2, [1.0] for Don/Acc
```
Returns default radius vector for the feature type.

### ph4_SchemeBitsColor (available but not required)
```svl
function ph4_SchemeBitsColor;
local color = ph4_SchemeBitsColor ['Unified', feat_bits];
```
Returns default color for feature visualization.

## Annotation Functions

### ph4_AnnotationRec
```svl
function ph4_AnnotationRec;
local rc = ph4_AnnotationRec [scheme, atoms, smask, options];
local map    = rc(1);  // annotation map
local abits  = rc(2);  // atom feature bits (one per atom)
local gfbits = rc(3);  // ghost feature bits (projected features)
local gfpos  = rc(4);  // ghost feature positions (3 parallel lists: X, Y, Z)
local other  = rc(5);  // additional data
```
Key options: `[rec:1, _sol:0, eatoms:atoms, excluded:[]]`
- `rec:1` — RECEPTOR mode (required for legacy projection with ph4_AnnotationPairs)
- `_sol:0` — solvent exclusion off
- `eatoms` — atoms to annotate
- `excluded` — atoms to exclude from annotation

### ph4_AnnotationPairs
```svl
function ph4_AnnotationPairs;
local pairs = ph4_AnnotationPairs [map, [ignore: ignore]];
// pairs(a) = [atom_index, ghost_index]
```
Returns pairs of annotation points for projection mode.
Must use `rec:1` in ph4_AnnotationRec or returns `exit NYET`.

## Query Functions

### ph4_QueryOpen
```svl
function ph4_QueryOpen;
local q = ph4_QueryOpen [];
```
Creates an empty pharmacophore query. Argument must be `[]` (empty vector).

### ph4_QueryCreateF
```svl
function ph4_QueryCreateF;
ph4_QueryCreateF [q, features, options];
// features = [[pos:[x,y,z], rad:1.4, expr:'Don2']]
```
Creates features in the query. **Tag names must be exactly**: `pos`, `rad`, `expr`.
Double brackets required: `[[pos:..., rad:..., expr:...]]`.

### ph4_QueryWriteFile
```svl
function ph4_QueryWriteFile;
ph4_QueryWriteFile [q, 'C:/output/query.ph4'];
```
Writes query to .ph4 file. Path must use forward slashes.

### ph4_QueryClose
```svl
function ph4_QueryClose;
ph4_QueryClose q;
```
Closes and frees the query.

## Utility Functions

### bitand
```svl
function bitand;
local [abits, gfbits] = bitand [[abits, gfbits], smask];
```
Bitwise AND for filtering annotation bits through scheme mask.
Returns multiple values via destructuring.

### prox_open / prox_find / prox_close
```svl
function prox_open;
function prox_find;
function prox_close;

local pk = prox_open [radius, positions, reference_radius];
local [seg] = prox_find [pk, aPos atoms, 0];  // NOTE: destructure [seg]!
prox_close pk;

local selected = atoms | seg;  // seg is bitmask (0/1), not indices
```
Proximity search: find atoms near a reference point or set of positions.
`prox_find` returns a BLOCK of bitmask vectors; destructure `[seg]` to get the first one.

## PDB Load Functions

### ReadPDB
```svl
function ReadPDB;
ReadPDB ['C:/path/file.pdb', []];
```
Loads PDB into the MOE system. Second argument `[]` uses default options.
Note: ReadPDB has NO return value; it loads directly into the system.

### Chains / Atoms / Residues / aPos
```svl
local c = Chains[];           // all chain keys
local atoms = Atoms c(1);     // atoms in chain 1
local residues = Residues c(1); // residues in chain 1
local pos = aPos atom_key;    // 3D position of atom
local rn = rName residue_key; // residue name (e.g. 'TYR', 'GDP')
local ru = rUID residue_key;  // residue sequence number

// Two-step aPos is REQUIRED in loops:
local ak = atoms(idx);
local pos = aPos ak;  // NOT: aPos atoms(idx)
```

### oCentroid / oParent
```svl
local center = oCentroid atoms;  // centroid of atom set
local parent = oParent atom_key; // parent residue/chain of atom
```
`oParent` may return unexpected keys for HETATM residues (like GDP).
Prefer residue-name matching via PDB text parsing for ligand identification.
