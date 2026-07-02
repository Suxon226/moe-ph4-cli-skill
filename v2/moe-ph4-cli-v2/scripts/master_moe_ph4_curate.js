#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AA = new Set("ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL MSE SEC PYL".split(" "));
const WATER = new Set(["HOH", "WAT", "DOD"]);
const POS_RES = new Set(["ARG", "LYS", "HIP"]);
const NEG_RES = new Set(["ASP", "GLU"]);
const ARO_RES = new Set(["PHE", "TYR", "TRP", "HIS", "HIP", "HID", "HIE"]);
const HYD_RES = new Set(["ALA", "VAL", "LEU", "ILE", "MET", "PHE", "TRP", "PRO", "TYR"]);
const ANIONIC_LIGAND_RES = new Set(["SEP", "TPO", "PTR", "PO4", "SO4", "GOL", "GDP", "GTP", "ADP", "ATP", "NAD"]);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsv(lines[0]).map(h => h.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line);
    const row = {};
    headers.forEach((h, i) => row[h] = cols[i] || "");
    rows.push(row);
  }
  return rows;
}

function csvQuote(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => csvQuote(row[h])).join(","));
  }
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

function parsePdb(file) {
  const atoms = [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const rec = line.slice(0, 6).trim();
    if (rec !== "ATOM" && rec !== "HETATM") continue;
    const name = line.slice(12, 16).trim();
    const resn = line.slice(17, 20).trim();
    const chain = line.slice(21, 22).trim() || "_";
    const resi = Number.parseInt(line.slice(22, 26).trim(), 10);
    const x = Number.parseFloat(line.slice(30, 38));
    const y = Number.parseFloat(line.slice(38, 46));
    const z = Number.parseFloat(line.slice(46, 54));
    const element = (line.length >= 78 ? line.slice(76, 78).trim() : "") || name.replace(/[^A-Za-z]/g, "").slice(0, 1);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    atoms.push({ rec, name, resn, chain, resi, x, y, z, element: element.toUpperCase() });
  }
  return atoms;
}

function atomId(a) {
  return `${a.chain}:${a.resn}${a.resi}:${a.name}`;
}

function residueId(a) {
  return `${a.chain}:${a.resn}${a.resi}`;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function nearest(point, atoms) {
  let best = null;
  let bestD = Infinity;
  for (const a of atoms) {
    const d = dist(point, a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { atom: best, distance: bestD };
}

function residueMatch(a, spec) {
  if (spec.chain && String(spec.chain) !== a.chain) return false;
  if (spec.resi != null && Number(spec.resi) !== a.resi) return false;
  if (spec.resn && String(spec.resn).toUpperCase() !== a.resn) return false;
  return true;
}

function selectAtoms(atoms, cfg) {
  const receptorChains = new Set(cfg.receptor_chains || []);
  const ligandChains = new Set(cfg.ligand_chains || []);
  const ligandSpecs = cfg.ligand_residues || [];
  const siteSpecs = cfg.site_residues || [];
  const excludedNames = new Set(cfg.exclude_residue_names || ["HOH", "WAT"]);

  const receptorAtoms = atoms.filter(a => a.rec === "ATOM" && AA.has(a.resn) && (!receptorChains.size || receptorChains.has(a.chain)));
  let ligandAtoms = atoms.filter(a => {
    if (excludedNames.has(a.resn)) return false;
    if (ligandChains.size && ligandChains.has(a.chain)) return true;
    if (ligandSpecs.some(s => residueMatch(a, s))) return true;
    return false;
  });
  if (!ligandAtoms.length && ligandChains.size) {
    ligandAtoms = atoms.filter(a => ligandChains.has(a.chain) && !excludedNames.has(a.resn));
  }
  const siteAtoms = siteSpecs.length ? atoms.filter(a => siteSpecs.some(s => residueMatch(a, s))) : ligandAtoms;
  return { receptorAtoms, ligandAtoms, siteAtoms };
}

function normalizeFamily(expr, cls = "") {
  const s = `${expr || ""} ${cls || ""}`.toLowerCase();
  if (/excluded|xvol|volume|shape/.test(s)) return "ExcludedVolume";
  if (/metal|coord|chelat| zn| mg| mn| fe| cu/.test(s)) return "Metal";
  if (/arom|aro|pi/.test(s)) return "Aro";
  if (/hyd|rophobic|aliph|lip/.test(s)) return "Hyd";
  if (/pos|cat|cation|guan|ammon/.test(s)) return "Pos";
  if (/neg|ani|anion|acid|carbox|phosph/.test(s)) return "Neg";
  if (/don/.test(s) && /acc/.test(s)) return "Mixed";
  if (/don|hbd/.test(s)) return "HBD";
  if (/acc|hba/.test(s)) return "HBA";
  if (/polar|hbond/.test(s)) return "Mixed";
  return "Mixed";
}

function exprForFamily(family, fallback = "") {
  if (fallback && !/^\d/.test(fallback) && fallback !== "ffffff") return fallback;
  return ({
    HBD: "Don",
    HBA: "Acc",
    Hyd: "Hyd",
    Aro: "Aro",
    Pos: "Cat",
    Neg: "Ani",
    Metal: "Met",
    ExcludedVolume: "XVol",
    Mixed: "Don$mAcc"
  })[family] || "Hyd";
}

function atomChem(a) {
  const e = a.element.toUpperCase();
  if (ANIONIC_LIGAND_RES.has(a.resn) && /O|P|S/.test(e)) return "Neg";
  if (POS_RES.has(a.resn) && /N/.test(e)) return "Pos";
  if (NEG_RES.has(a.resn) && /O/.test(e)) return "Neg";
  if (ARO_RES.has(a.resn) && /C/.test(e)) return "Aro";
  if (HYD_RES.has(a.resn) && /C|S/.test(e)) return "Hyd";
  if (/N/.test(e)) return "HBD";
  if (/O|S/.test(e)) return "HBA";
  if (/C/.test(e)) return "Hyd";
  return "Mixed";
}

function complementFamily(receptorFamily, ligandFamily) {
  if (receptorFamily === "HBD") return "HBA";
  if (receptorFamily === "HBA") return "HBD";
  if (receptorFamily === "Pos") return "Neg";
  if (receptorFamily === "Neg") return "Pos";
  if (receptorFamily === "Aro" || ligandFamily === "Aro") return "Aro";
  if (receptorFamily === "Hyd" || ligandFamily === "Hyd") return "Hyd";
  return receptorFamily || ligandFamily || "Mixed";
}

function readMoeFeatures(file, cfg, receptorAtoms, siteAtoms) {
  const rows = parseCsv(file);
  const features = [];
  rows.forEach((row, i) => {
    const x = Number(row.x ?? row.X);
    const y = Number(row.y ?? row.Y);
    const z = Number(row.z ?? row.Z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const expr = row.expr || row.Expression || row.feature || row.raw || "";
    const cls = row.family || row.class || row.type || "";
    const family = normalizeFamily(expr, cls);
    const p = { x, y, z };
    const nr = nearest(p, receptorAtoms);
    const ns = siteAtoms.length ? nearest(p, siteAtoms) : { atom: null, distance: Infinity };
    features.push({
      idx: `moe_${i + 1}`,
      expr: exprForFamily(family, expr),
      expr_original: expr,
      family,
      secondary_family: family === "Mixed" ? "" : "",
      x, y, z,
      radius: Number(row.r || row.radius || cfg.feature_radius || 1.4),
      role: "candidate",
      source: "moe_native",
      receptor_chain: nr.atom ? nr.atom.chain : "",
      ligand_chain: ns.atom ? ns.atom.chain : "",
      nearest_receptor_residue: nr.atom ? residueId(nr.atom) : "",
      nearest_ligand_residue: ns.atom ? residueId(ns.atom) : "",
      nearest_contact_distance: Number.isFinite(ns.distance) ? ns.distance : "",
      site_zone: ns.atom ? residueId(ns.atom) : "site_unspecified",
      cluster_id: "",
      cluster_size: "",
      selection_score: 0,
      selection_reason: "",
      uncertainty: family === "Mixed" ? "family_ambiguous" : ""
    });
  });
  return features;
}

function contactCandidates(cfg, receptorAtoms, ligandAtoms) {
  const out = [];
  const contactD = Number(cfg.contact_distance || 4.5);
  if (!ligandAtoms.length) return out;
  let id = 1;
  for (const ra of receptorAtoms) {
    for (const la of ligandAtoms) {
      const d = dist(ra, la);
      if (d > contactD) continue;
      const rf = atomChem(ra);
      const lf = atomChem(la);
      const perspective = cfg.feature_perspective || "ligand";
      const family = perspective === "receptor_complement" ? complementFamily(rf, lf) : lf;
      let role = "contact_support";
      if (family === "Hyd") role = "hydrophobic_wall";
      if (family === "Aro") role = "aromatic_wall";
      if (family === "HBD" || family === "HBA") role = "polar_register";
      if (family === "Pos" || family === "Neg") role = "charge_clamp";
      out.push({
        idx: `contact_${id++}`,
        expr: exprForFamily(family),
        expr_original: `${rf}-${lf}`,
        family,
        secondary_family: "",
        x: la.x,
        y: la.y,
        z: la.z,
        radius: Number(cfg.feature_radius || 1.4),
        role,
        source: "contact_derived",
        receptor_chain: ra.chain,
        ligand_chain: la.chain,
        nearest_receptor_residue: residueId(ra),
        nearest_ligand_residue: residueId(la),
        nearest_contact_distance: d,
        site_zone: residueId(la),
        cluster_id: "",
        cluster_size: "",
        selection_score: 0,
        selection_reason: "",
        uncertainty: ""
      });
      if (rf === "Aro" && (lf === "Hyd" || lf === "Aro")) {
        out.push({
          idx: `contact_${id++}`,
          expr: "Aro",
          expr_original: `${rf}-${lf};receptor_aromatic_wall_projection`,
          family: "Aro",
          secondary_family: lf === "Hyd" ? "Hyd" : "",
          x: la.x,
          y: la.y,
          z: la.z,
          radius: Number(cfg.feature_radius || 1.4),
          role: "aromatic_wall",
          source: "contact_derived",
          receptor_chain: ra.chain,
          ligand_chain: la.chain,
          nearest_receptor_residue: residueId(ra),
          nearest_ligand_residue: residueId(la),
          nearest_contact_distance: d,
          site_zone: residueId(la),
          cluster_id: "",
          cluster_size: "",
          selection_score: 0,
          selection_reason: "",
          uncertainty: "projected_from_receptor_aromatic_wall"
        });
      }
    }
  }
  return out;
}

function siteSupport(f, siteDistance) {
  const d = Number(f.nearest_contact_distance);
  if (!Number.isFinite(d)) return 0.5;
  if (d <= 3.5) return 3;
  if (d <= 4.5) return 2.5;
  if (d <= siteDistance) return 1.5;
  if (d <= siteDistance + 2) return 0.5;
  return -2;
}

function sourceConfidence(f) {
  if (f.source === "contact_derived") return 2;
  if (f.source === "moe_native") return 1.2;
  return 0.5;
}

function familyValue(family) {
  return ({
    HBD: 1.5,
    HBA: 1.5,
    Hyd: 1.4,
    Aro: 1.6,
    Pos: 1.5,
    Neg: 1.5,
    Metal: 1.8,
    ExcludedVolume: 1.2,
    Mixed: 0.4
  })[family] || 0.5;
}

function baseScore(f, cfg) {
  let s = 0;
  s += siteSupport(f, Number(cfg.site_distance || 6.0));
  s += sourceConfidence(f);
  s += familyValue(f.family);
  if (f.role && f.role !== "candidate") s += 1;
  if (f.uncertainty) s -= 0.6;
  return s;
}

function clusterThreshold(family) {
  if (family === "Hyd" || family === "Aro") return 3.5;
  if (family === "ExcludedVolume") return 4.0;
  if (family === "Metal") return 2.0;
  return 2.5;
}

function clusterFeatures(features) {
  const clusters = [];
  const sorted = [...features].sort((a, b) => b._base_score - a._base_score);
  for (const f of sorted) {
    let found = null;
    for (const c of clusters) {
      if (c.family !== f.family) continue;
      const d = dist(f, c.centroid);
      if (d <= clusterThreshold(f.family)) {
        found = c;
        break;
      }
    }
    if (!found) {
      found = { id: `cluster_${clusters.length + 1}`, family: f.family, members: [], centroid: { x: 0, y: 0, z: 0 } };
      clusters.push(found);
    }
    found.members.push(f);
    const n = found.members.length;
    found.centroid.x = (found.centroid.x * (n - 1) + f.x) / n;
    found.centroid.y = (found.centroid.y * (n - 1) + f.y) / n;
    found.centroid.z = (found.centroid.z * (n - 1) + f.z) / n;
  }
  for (const c of clusters) {
    c.members.sort((a, b) => b._base_score - a._base_score);
    for (const m of c.members) {
      m.cluster_id = c.id;
      m.cluster_size = c.members.length;
    }
  }
  return clusters;
}

function marginalScore(f, selected, coveredFamilies, coveredZones) {
  let s = f._base_score;
  if (!coveredFamilies.has(f.family)) s += 2.0;
  if (!coveredZones.has(f.site_zone)) s += 1.5;
  if (selected.some(x => dist(x, f) < clusterThreshold(f.family))) s -= 4.0;
  const sameFamilyCount = selected.filter(x => x.family === f.family).length;
  s -= sameFamilyCount * 0.6;
  if (f.family === "Mixed") s -= 0.8;
  return s;
}

function selectFeatures(features, cfg) {
  const selectedCount = Number(cfg.selected_count || 6);
  const candidates = features.filter(f => {
    const d = Number(f.nearest_contact_distance);
    if (!Number.isFinite(d)) return true;
    return d <= Number(cfg.broad_site_distance || 8.0);
  });
  for (const f of candidates) f._base_score = baseScore(f, cfg);
  const clusters = clusterFeatures(candidates);
  const reps = clusters.map(c => c.members[0]).sort((a, b) => b._base_score - a._base_score);
  const selected = [];
  const coveredFamilies = new Set();
  const coveredZones = new Set();
  while (selected.length < selectedCount && reps.length) {
    let bestI = -1;
    let bestS = -Infinity;
    for (let i = 0; i < reps.length; i++) {
      const s = marginalScore(reps[i], selected, coveredFamilies, coveredZones);
      if (s > bestS) {
        bestS = s;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    const [f] = reps.splice(bestI, 1);
    f.selection_score = Number(bestS.toFixed(3));
    f.selection_reason = reasonFor(f, coveredFamilies, coveredZones);
    selected.push(f);
    coveredFamilies.add(f.family);
    coveredZones.add(f.site_zone);
  }
  selected.sort((a, b) => b.selection_score - a.selection_score);
  selected.forEach((f, i) => f.idx = String(i + 1));
  return { selected, allCandidates: candidates, clusters };
}

function reasonFor(f, coveredFamilies, coveredZones) {
  const parts = [];
  if (!coveredFamilies.has(f.family)) parts.push(`adds_${f.family}_family`);
  if (!coveredZones.has(f.site_zone)) parts.push("adds_new_site_zone");
  if (f.source === "contact_derived") parts.push("direct_contact_supported");
  if (f.role && f.role !== "candidate") parts.push(`role_${f.role}`);
  if (!parts.length) parts.push("best_nonredundant_representative");
  return parts.join(";");
}

function writePh4(rows, out) {
  const lines = [];
  lines.push("#moe:ph4que 2024.06");
  lines.push("#pharmacophore generated by moe-ph4-cli");
  lines.push(`#feature ${rows.length} expr tt color ix x r y r z r r r ebits ix gbits ix`);
  for (const row of rows) {
    const expr = exprForFamily(row.family, row.expr);
    lines.push(`${expr} 16777215 ${Number(row.x).toFixed(3)} ${Number(row.y).toFixed(3)} ${Number(row.z).toFixed(3)} ${Number(row.radius || 1.4).toFixed(3)} 0 0`);
  }
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
}

function writeCreatePh4Svl(rows, outPh4, outSvl) {
  const lines = [];
  lines.push("function ph4_QueryCreate;");
  lines.push("function ph4_QueryCreateF;");
  lines.push("function ph4_QueryWriteFile;");
  lines.push("local q;");
  lines.push("q = ph4_QueryCreate [];");
  for (const row of rows) {
    const expr = exprForFamily(row.family, row.expr).replace(/'/g, "");
    lines.push(`ph4_QueryCreateF [q, [[pos:[${Number(row.x).toFixed(4)}, ${Number(row.y).toFixed(4)}, ${Number(row.z).toFixed(4)}], rad:${Number(row.radius || 1.4).toFixed(4)}, expr:'${expr}']], 0];`);
  }
  lines.push(`ph4_QueryWriteFile [q, '${outPh4.replace(/\\/g, "/")}'];`);
  fs.writeFileSync(outSvl, lines.join("\n") + "\n", "utf8");
}

function writeDisplaySvl(cfg, outPh4, outSvl) {
  const structure = path.resolve(cfg.structure).replace(/\\/g, "/");
  const ph4 = path.resolve(outPh4).replace(/\\/g, "/");
  const lines = [];
  lines.push("function ReadPDB;");
  lines.push("function ph4_QueryOpen;");
  lines.push(`ReadPDB ['${structure}', []];`);
  lines.push(`ph4_QueryOpen '${ph4}';`);
  lines.push("// Display receptor, ligand or peptide, and selected pharmacophore in MOE.");
  fs.writeFileSync(outSvl, lines.join("\n") + "\n", "utf8");
}

function writeReport(file, cfg, stats, selected) {
  const lines = [];
  lines.push("# MOE Pharmacophore Curation Report");
  lines.push("");
  lines.push(`Job: ${cfg.job_id || "pharmacophore_job"}`);
  lines.push(`Structure: ${cfg.structure}`);
  lines.push(`Full feature CSV: ${cfg.full_features_csv}`);
  lines.push(`Receptor chains: ${(cfg.receptor_chains || []).join(",") || "not specified"}`);
  lines.push(`Ligand chains: ${(cfg.ligand_chains || []).join(",") || "not specified"}`);
  lines.push(`Site distance: ${cfg.site_distance || 6.0} A`);
  lines.push(`Contact distance: ${cfg.contact_distance || 4.5} A`);
  lines.push("");
  lines.push("## Candidate Summary");
  lines.push("");
  lines.push(`MOE native candidates: ${stats.moeCount}`);
  lines.push(`Contact-derived candidates: ${stats.contactCount}`);
  lines.push(`Candidates after site gating: ${stats.gatedCount}`);
  lines.push(`Clusters: ${stats.clusterCount}`);
  lines.push(`Selected features: ${selected.length}`);
  lines.push("");
  lines.push("## Selected Features");
  lines.push("");
  lines.push("| idx | family | role | source | score | zone | nearest receptor | nearest ligand/site | reason |");
  lines.push("|---:|---|---|---|---:|---|---|---|---|");
  for (const f of selected) {
    lines.push(`| ${f.idx} | ${f.family} | ${f.role} | ${f.source} | ${f.selection_score} | ${f.site_zone} | ${f.nearest_receptor_residue} | ${f.nearest_ligand_residue} | ${f.selection_reason} |`);
  }
  lines.push("");
  lines.push("## Design Interpretation");
  lines.push("");
  lines.push("Use these features as independent binding constraints. Preserve polar register points for orientation, hydrophobic or aromatic wall points for anchoring, charged points for electrostatic specificity, and shape or excluded-volume points for selectivity.");
  lines.push("");
  lines.push("## Uncertainty");
  lines.push("");
  lines.push("Review protonation, missing atoms, alternate conformations, chain-copy selection, and whether cofactors or waters should be retained for the intended design state.");
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

function main() {
  const configPath = arg("--config");
  if (!configPath) {
    console.error("Usage: node master_moe_ph4_curate.js --config config.json");
    process.exit(2);
  }
  const cfg = readJson(configPath);
  if (!cfg.structure || !cfg.full_features_csv || !cfg.output_dir) {
    throw new Error("Config requires structure, full_features_csv, and output_dir.");
  }
  const outDir = path.resolve(cfg.output_dir);
  const curatedDir = path.join(outDir, "05_curated");
  ensureDir(curatedDir);

  const atoms = parsePdb(cfg.structure);
  const { receptorAtoms, ligandAtoms, siteAtoms } = selectAtoms(atoms, cfg);
  if (!receptorAtoms.length) throw new Error("No receptor atoms found. Set receptor_chains explicitly.");
  const effectiveSiteAtoms = siteAtoms.length ? siteAtoms : ligandAtoms;

  const moe = readMoeFeatures(cfg.full_features_csv, cfg, receptorAtoms, effectiveSiteAtoms);
  const contacts = contactCandidates(cfg, receptorAtoms, ligandAtoms);
  const merged = moe.concat(contacts);
  const { selected, allCandidates, clusters } = selectFeatures(merged, cfg);

  const headers = [
    "idx", "expr", "expr_original", "family", "secondary_family", "x", "y", "z", "radius", "role", "source",
    "receptor_chain", "ligand_chain", "nearest_receptor_residue", "nearest_ligand_residue",
    "nearest_contact_distance", "site_zone", "cluster_id", "cluster_size", "selection_score",
    "selection_reason", "uncertainty"
  ];
  const curatedCsv = path.join(curatedDir, "curated_features.csv");
  const fullCsv = path.join(curatedDir, "full_mechanism_candidates.csv");
  const ph4 = path.join(curatedDir, "curated_model.ph4");
  const writeSvl = path.join(curatedDir, "write_curated_model.svl");
  const displaySvl = path.join(curatedDir, "display_in_moe.svl");
  const report = path.join(curatedDir, "curation_report.md");
  const manifest = path.join(outDir, "run_manifest.json");

  writeCsv(curatedCsv, selected, headers);
  writeCsv(fullCsv, allCandidates, headers);
  writePh4(selected, ph4);
  writeCreatePh4Svl(selected, ph4, writeSvl);
  if (cfg.write_display_svl !== false) writeDisplaySvl(cfg, ph4, displaySvl);
  writeReport(report, cfg, {
    moeCount: moe.length,
    contactCount: contacts.length,
    gatedCount: allCandidates.length,
    clusterCount: clusters.length
  }, selected);

  const manifestObj = {
    job_id: cfg.job_id || "pharmacophore_job",
    generated_at: new Date().toISOString(),
    config: path.resolve(configPath),
    structure: path.resolve(cfg.structure),
    full_features_csv: path.resolve(cfg.full_features_csv),
    outputs: { curatedCsv, fullCsv, ph4, writeSvl, displaySvl, report },
    checksums: {
      config: sha256(configPath),
      structure: sha256(cfg.structure),
      full_features_csv: sha256(cfg.full_features_csv),
      curated_features_csv: sha256(curatedCsv),
      curated_model_ph4: sha256(ph4)
    }
  };
  fs.writeFileSync(manifest, JSON.stringify(manifestObj, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, selected: selected.length, output_dir: outDir, report }, null, 2));
}

main();
