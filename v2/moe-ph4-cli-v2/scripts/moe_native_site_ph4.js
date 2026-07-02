#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

const AA = new Set([
  "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "HID", "HIE", "HIP",
  "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL", "SEC"
]);
const WATER = new Set(["HOH", "WAT", "DOD"]);
const AROMATIC = new Set(["PHE", "TYR", "TRP", "HIS", "HID", "HIE", "HIP"]);
const POS_RES = new Set(["ARG", "LYS", "HIP"]);
const NEG_RES = new Set(["ASP", "GLU"]);

function usage() {
  console.log(`Usage:
  node moe_native_site_ph4.js --config moe_native_config.json [--run]

Config fields:
  structure_pdb        required, input PDB path
  output_dir           required, run output directory
  moe_bin              optional, path to moebatch.exe
  receptor_chain       optional, receptor chain id(s), e.g. "A" or ["A","B"]
  ligand_chain         optional, ligand/peptide chain id(s), e.g. "E"
  site_radius          optional, default 6.0 Angstrom
  max_raw_features     optional, default 350
  feature_perspective  optional, ligand | receptor | complement, default ligand

This adapter creates a structure-contact raw candidate CSV, then asks MOE to write
the corresponding .ph4 query through ph4_QueryCreateF/ph4_QueryWriteFile.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--run") args.run = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-/g, "_");
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error(`Missing value for ${a}`);
      args[key] = val;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function winToSvl(file) {
  return path.resolve(file).replace(/\\/g, "/").replace(/'/g, "\\'");
}

function sha256(file) {
  return fs.existsSync(file)
    ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : "";
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function chainSet(value) {
  if (!value) return null;
  const arr = Array.isArray(value) ? value : String(value).split(/[,\s]+/).filter(Boolean);
  return new Set(arr.map((x) => (x === "_" ? "" : String(x))));
}

function parsePdb(pdbFile) {
  const atoms = [];
  const lines = fs.readFileSync(pdbFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const rec = line.slice(0, 6).trim();
    if (rec !== "ATOM" && rec !== "HETATM") continue;
    const name = line.slice(12, 16).trim();
    const resn = line.slice(17, 20).trim().toUpperCase();
    const chain = line.slice(21, 22).trim();
    const resi = Number.parseInt(line.slice(22, 26).trim(), 10);
    const x = Number.parseFloat(line.slice(30, 38));
    const y = Number.parseFloat(line.slice(38, 46));
    const z = Number.parseFloat(line.slice(46, 54));
    if (![x, y, z].every(Number.isFinite)) continue;
    let element = line.slice(76, 78).trim().toUpperCase();
    if (!element) element = name.replace(/^[0-9]+/, "").slice(0, 1).toUpperCase();
    atoms.push({
      rec,
      name,
      resn,
      chain,
      resi,
      x,
      y,
      z,
      element,
      isProtein: rec === "ATOM" && AA.has(resn),
      isWater: WATER.has(resn)
    });
  }
  return atoms;
}

function chainCounts(atoms, pred) {
  const counts = new Map();
  for (const a of atoms) {
    if (!pred(a)) continue;
    counts.set(a.chain, (counts.get(a.chain) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function chooseChains(atoms, cfg) {
  const recCfg = chainSet(cfg.receptor_chain);
  const ligCfg = chainSet(cfg.ligand_chain);
  const proteinCounts = chainCounts(atoms, (a) => a.isProtein);
  const receptor = recCfg || new Set(proteinCounts.length ? [proteinCounts[0][0]] : []);

  let ligand = ligCfg;
  if (!ligand) {
    const nonRecProtein = proteinCounts.filter(([c]) => !receptor.has(c));
    const hetCounts = chainCounts(atoms, (a) => a.rec === "HETATM" && !a.isWater && !receptor.has(a.chain));
    if (nonRecProtein.length) ligand = new Set([nonRecProtein[0][0]]);
    else if (hetCounts.length) ligand = new Set([hetCounts[0][0]]);
    else ligand = new Set();
  }

  return { receptor, ligand };
}

function d2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function residueLabel(a) {
  return `${a.chain || "_"}:${a.resn}${Number.isFinite(a.resi) ? a.resi : ""}`;
}

function atomLabel(a) {
  return `${residueLabel(a)}:${a.name}`;
}

function isBackbone(a) {
  return ["N", "CA", "C", "O", "OXT"].includes(a.name);
}

function aromaticAtom(a) {
  if (!AROMATIC.has(a.resn)) return false;
  return !isBackbone(a) && ["C", "N"].includes(a.element);
}

function strongNegative(a) {
  if (["PO4", "SO4"].includes(a.resn) && ["O", "P", "S"].includes(a.element)) return true;
  if (NEG_RES.has(a.resn) && ["OD1", "OD2", "OE1", "OE2"].includes(a.name)) return true;
  if (/^(OXT|OP1|OP2|OP3|O1P|O2P|O3P|O1S|O2S|O3S)$/.test(a.name)) return true;
  return false;
}

function strongPositive(a) {
  if (a.resn === "ARG" && /^N[EH]/.test(a.name)) return true;
  if (a.resn === "LYS" && a.name === "NZ") return true;
  if (a.resn === "HIP" && a.element === "N") return true;
  return false;
}

function classifyFamilies(a) {
  if (a.element === "H") return [];
  if (strongNegative(a)) return ["Neg", "HBA"];
  if (strongPositive(a)) return ["Pos", "HBD"];
  if (aromaticAtom(a)) return ["Aro"];
  if (a.element === "O") return ["HBA"];
  if (a.element === "N") return ["HBD"];
  if (a.element === "S") return ["Hyd"];
  if (a.element === "C" && !isBackbone(a)) return ["Hyd"];
  return [];
}

function familyToExpr(family) {
  return {
    HBA: "Acc",
    HBD: "Don",
    Neg: "Ani",
    Pos: "Cat",
    Hyd: "Hyd",
    Aro: "Aro",
    Metal: "Met"
  }[family] || "AtomQ";
}

function siteZone(family, distance) {
  if (family === "Neg" || family === "Pos") return "charged_anchor";
  if (family === "Aro") return "aromatic_wall_projection";
  if (family === "Hyd") return distance <= 4.0 ? "buried_nonpolar_anchor" : "nonpolar_shell";
  if (family === "HBA" || family === "HBD") return distance <= 3.6 ? "polar_gate" : "polar_shell";
  return "site_contact";
}

function nearestAtom(atom, receptors, maxD2) {
  let best = null;
  for (const r of receptors) {
    const dd = d2(atom, r);
    if (dd <= maxD2 && (!best || dd < best.d2)) best = { atom: r, d2: dd };
  }
  return best;
}

function buildRawFeatures(atoms, cfg) {
  const { receptor, ligand } = chooseChains(atoms, cfg);
  const siteRadius = Number(cfg.site_radius || 6.0);
  const maxD2 = siteRadius * siteRadius;
  const receptors = atoms.filter((a) => receptor.has(a.chain) && !a.isWater && a.element !== "H");
  const ligands = atoms.filter((a) => ligand.has(a.chain) && !a.isWater && a.element !== "H");
  const perspective = cfg.feature_perspective || "ligand";

  const features = [];
  const seen = new Set();
  for (const la of ligands) {
    const nearest = nearestAtom(la, receptors, maxD2);
    if (!nearest) continue;
    const distance = Math.sqrt(nearest.d2);
    for (const family of classifyFamilies(la)) {
      const id = `MOE_RAW_${String(features.length + 1).padStart(4, "0")}`;
      const key = `${family}|${atomLabel(la)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      features.push({
        id,
        family,
        moe_expr: familyToExpr(family),
        x: la.x,
        y: la.y,
        z: la.z,
        radius: 1.4,
        source: "pdb_contact_preannotation_to_moe_ph4",
        perspective,
        site_zone: siteZone(family, distance),
        nearest_receptor_residue: residueLabel(nearest.atom),
        nearest_ligand_residue: residueLabel(la),
        nearest_distance: Number(distance.toFixed(3)),
        receptor_chain: Array.from(receptor).join(";"),
        ligand_chain: Array.from(ligand).join(";"),
        ligand_atom: atomLabel(la),
        receptor_atom: atomLabel(nearest.atom),
        notes: "MOE adapter writes this feature to .ph4 via ph4_QueryCreateF"
      });
    }
  }

  const maxFeatures = Number(cfg.max_raw_features || 350);
  features.sort((a, b) => a.nearest_distance - b.nearest_distance);
  return {
    receptor_chains: Array.from(receptor),
    ligand_chains: Array.from(ligand),
    receptor_atom_count: receptors.length,
    ligand_atom_count: ligands.length,
    features: features.slice(0, maxFeatures),
    truncated: features.length > maxFeatures,
    generated_feature_count_before_truncation: features.length
  };
}

function writeRawCsv(features, file) {
  const header = [
    "id", "family", "moe_expr", "x", "y", "z", "radius", "source", "perspective", "site_zone",
    "nearest_receptor_residue", "nearest_ligand_residue", "nearest_distance",
    "receptor_chain", "ligand_chain", "ligand_atom", "receptor_atom", "notes"
  ];
  const lines = [header.join(",")];
  for (const f of features) {
    lines.push(header.map((h) => csvEscape(f[h])).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function svlFeature(feature) {
  const expr = String(feature.moe_expr || familyToExpr(feature.family)).replace(/'/g, "\\'");
  return `[expr:'${expr}', pos:[${feature.x.toFixed(3)},${feature.y.toFixed(3)},${feature.z.toFixed(3)}], rad:${Number(feature.radius || 1.4).toFixed(3)}]`;
}

function writeSvl(cfg, paths, raw) {
  const pdb = winToSvl(cfg.structure_pdb);
  const rawPh4 = winToSvl(paths.rawPh4);
  const rawCsv = winToSvl(paths.rawCsv);
  const displaySvl = winToSvl(paths.displaySvl);
  const features = raw.features || [];
  const fdata = features.map((f) => `\t\t${svlFeature(f)}`).join(",\n");
  const createLine = features.length
    ? `\tlocal fdata = [\n${fdata}\n\t];\n\tlocal fkey = ph4_QueryCreateF [q, fdata, []];\n`
    : "\twrite 'No raw features were generated; writing empty query.\\n';\n";

  const svl = `#set title 'MOE Native Site Pharmacophore Driver'
#set class 'SVL:run'
// Generated by moe_native_site_ph4.js. Raw coordinates are stored in:
// ${rawCsv}

function ReadPDB;
function ph4_QueryOpen;
function ph4_QueryCreateF;
function ph4_QueryWriteFile;
function ph4_QueryClose;

global function main []
	local pdb_file = '${pdb}';
	local out_ph4 = '${rawPh4}';
	write 'MOE native pharmacophore driver\\n';
	write 'Raw features were preannotated from structure contacts and are now written through MOE ph4_QueryCreateF\\n';
	ReadPDB [pdb_file, []];
	local q = ph4_QueryOpen [];
${createLine}\tph4_QueryWriteFile [q, out_ph4];
\tph4_QueryClose q;
\twrite 'Wrote MOE raw pharmacophore query\\n';
endfunction
`;
  fs.writeFileSync(paths.driverSvl, svl, "utf8");

  const display = `#set title 'Display Structure And Pharmacophore'
#set class 'SVL:run'
// Open this helper in MOE or load these files manually:
// structure: ${pdb}
// pharmacophore: ${rawPh4}
// raw csv: ${rawCsv}
function ReadPDB;
global function main []
\tReadPDB ['${pdb}', []];
\twrite 'Load the pharmacophore query file in MOE: ${rawPh4}\\n';
endfunction
`;
  fs.writeFileSync(displaySvl, display, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.config) {
    usage();
    process.exit(2);
  }
  const cfg = readJson(args.config);
  if (!cfg.structure_pdb || !cfg.output_dir) {
    throw new Error("Config requires structure_pdb and output_dir");
  }

  const outDir = path.resolve(cfg.output_dir);
  const rawDir = path.join(outDir, "02_moe_raw");
  ensureDir(rawDir);
  const paths = {
    driverSvl: path.join(rawDir, "moe_native_site_ph4.svl"),
    rawPh4: path.join(rawDir, "moe_raw_site_query.ph4"),
    rawCsv: path.join(rawDir, "moe_raw_features.csv"),
    displaySvl: path.join(rawDir, "display_structure_and_raw_ph4.svl"),
    log: path.join(rawDir, "moe_native_site_ph4.log"),
    manifest: path.join(rawDir, "moe_native_manifest.json")
  };

  const atoms = parsePdb(cfg.structure_pdb);
  const raw = buildRawFeatures(atoms, cfg);
  writeRawCsv(raw.features, paths.rawCsv);
  writeSvl(cfg, paths, raw);

  const manifest = {
    created_at: nowIso(),
    config: cfg,
    paths,
    structure: {
      atom_count: atoms.length,
      receptor_chains: raw.receptor_chains,
      ligand_chains: raw.ligand_chains,
      receptor_atom_count: raw.receptor_atom_count,
      ligand_atom_count: raw.ligand_atom_count
    },
    raw_generation: {
      provider: "pdb_contact_preannotation_to_moe_ph4",
      feature_count: raw.features.length,
      generated_feature_count_before_truncation: raw.generated_feature_count_before_truncation,
      truncated: raw.truncated,
      csv_sha256: sha256(paths.rawCsv)
    },
    execution: {
      ran_moebatch: Boolean(args.run),
      moe_bin: cfg.moe_bin || "C:/Program Files/moe2024/bin-win64/moebatch.exe"
    },
    notes: [
      "MOE writes the raw .ph4 through ph4_QueryCreateF/ph4_QueryWriteFile.",
      "Raw CSV is a candidate pool. Mechanism compression must still select independent high-information features.",
      "Direct ph4_AnnotationRec records are not yet parsed into CSV; see references/v2_moe_svl_adapter_notes_zh.md."
    ]
  };

  if (args.run) {
    const moeBin = cfg.moe_bin || "C:\\Program Files\\moe2024\\bin-win64\\moebatch.exe";
    const result = cp.spawnSync(moeBin, ["-run", paths.driverSvl], {
      cwd: rawDir,
      encoding: "utf8",
      windowsHide: true
    });
    fs.writeFileSync(paths.log, [
      `command=${moeBin} -run ${paths.driverSvl}`,
      `status=${result.status}`,
      `error=${result.error ? result.error.message : ""}`,
      "",
      "STDOUT",
      result.stdout || "",
      "",
      "STDERR",
      result.stderr || ""
    ].join("\n"), "utf8");
    manifest.execution.status = result.status;
    manifest.execution.error = result.error ? result.error.message : "";
    manifest.execution.ph4_sha256 = sha256(paths.rawPh4);
    if (result.status !== 0) {
      manifest.execution.warning = "moebatch returned non-zero status; inspect the log and references/svl_errors.md.";
    }
  }

  fs.writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Wrote ${paths.rawCsv}`);
  console.log(`Wrote ${paths.driverSvl}`);
  console.log(`Wrote ${paths.manifest}`);
  if (args.run) console.log(`Wrote ${paths.log}`);
}

main();
