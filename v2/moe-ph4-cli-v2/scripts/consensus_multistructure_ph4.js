#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

function usage() {
  console.log(`Usage:
  node consensus_multistructure_ph4.js --config consensus_config.json [--run-moe]

Purpose:
  Align multiple receptor structures to a reference, transform raw feature CSVs into
  the reference frame, cluster spatially, and build an article-style consensus query.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--run-moe") args.run_moe = true;
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

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === "\"") {
      if (quoted && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] == null ? "" : cells[i]; });
    return row;
  });
}

function writeCsv(file, rows, header) {
  fs.writeFileSync(file, [header.join(","), ...rows.map((r) => header.map((h) => csvEscape(r[h])).join(","))].join("\n") + "\n", "utf8");
}

function parseCa(pdbFile, chain) {
  const map = new Map();
  const lines = fs.readFileSync(pdbFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (line.slice(0, 6).trim() !== "ATOM") continue;
    if (line.slice(21, 22).trim() !== chain) continue;
    if (line.slice(12, 16).trim() !== "CA") continue;
    const resn = line.slice(17, 20).trim();
    const resi = Number.parseInt(line.slice(22, 26).trim(), 10);
    const x = Number.parseFloat(line.slice(30, 38));
    const y = Number.parseFloat(line.slice(38, 46));
    const z = Number.parseFloat(line.slice(46, 54));
    if (![x, y, z, resi].every(Number.isFinite)) continue;
    map.set(`${resn}:${resi}`, [x, y, z]);
  }
  return map;
}

function centroid(points) {
  const c = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0]; c[1] += p[1]; c[2] += p[2];
  }
  return c.map((x) => x / points.length);
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function matVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

function norm4(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function topEigen4(k) {
  let v = [1, 0, 0, 0];
  for (let iter = 0; iter < 80; iter += 1) {
    const w = [
      k[0][0] * v[0] + k[0][1] * v[1] + k[0][2] * v[2] + k[0][3] * v[3],
      k[1][0] * v[0] + k[1][1] * v[1] + k[1][2] * v[2] + k[1][3] * v[3],
      k[2][0] * v[0] + k[2][1] * v[1] + k[2][2] * v[2] + k[2][3] * v[3],
      k[3][0] * v[0] + k[3][1] * v[1] + k[3][2] * v[2] + k[3][3] * v[3]
    ];
    v = norm4(w);
  }
  return v;
}

function quatToRot(q) {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
    [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
    [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y]
  ];
}

function fitTransform(refPoints, movPoints) {
  const cref = centroid(refPoints);
  const cmov = centroid(movPoints);
  const s = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < refPoints.length; i += 1) {
    const x = sub(movPoints[i], cmov);
    const y = sub(refPoints[i], cref);
    for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) s[a][b] += x[a] * y[b];
  }
  const [sxx, sxy, sxz] = s[0];
  const [syx, syy, syz] = s[1];
  const [szx, szy, szz] = s[2];
  const k = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];
  const rot = quatToRot(topEigen4(k));
  const transform = (p) => add(matVec(rot, sub(p, cmov)), cref);
  let rmsd = 0;
  for (let i = 0; i < refPoints.length; i += 1) {
    const t = transform(movPoints[i]);
    const dx = t[0] - refPoints[i][0], dy = t[1] - refPoints[i][1], dz = t[2] - refPoints[i][2];
    rmsd += dx * dx + dy * dy + dz * dz;
  }
  rmsd = Math.sqrt(rmsd / refPoints.length);
  return { transform, rmsd, n: refPoints.length };
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function compatibleFamilies(a, b) {
  if (a === b) return true;
  if ((a === "Neg" && b === "HBA") || (a === "HBA" && b === "Neg")) return true;
  if ((a === "HBD" && b === "HBA") || (a === "HBA" && b === "HBD")) return true;
  if ((a === "Hyd" && b === "Aro") || (a === "Aro" && b === "Hyd")) return true;
  return false;
}

function classOfCluster(cluster) {
  const fam = new Set(cluster.features.map((f) => f.family));
  if (fam.has("Neg")) return "Ani&Acc";
  if (fam.has("HBD") && fam.has("HBA")) return "Don&Acc";
  if (fam.has("Aro")) return "Aro";
  if (fam.has("Hyd")) return "Hyd";
  if (fam.has("HBA")) return "Acc";
  if (fam.has("HBD")) return "Don";
  return Array.from(fam).sort().join("&") || "AtomQ";
}

function exprOfClass(cls) {
  return {
    "Ani&Acc": "Ani&Acc",
    "Don&Acc": "Don&Acc",
    Acc: "Acc",
    Don: "Don",
    Hyd: "Hyd",
    Aro: "Aro"
  }[cls] || "AtomQ";
}

function familyOfClass(cls) {
  return {
    "Ani&Acc": "Neg",
    "Don&Acc": "Mixed",
    Acc: "HBA",
    Don: "HBD",
    Hyd: "Hyd",
    Aro: "Aro"
  }[cls] || cls;
}

function recluster(features, radius) {
  const clusters = [];
  for (const f of features) {
    let best = null;
    for (const c of clusters) {
      if (!c.features.some((g) => compatibleFamilies(f.family, g.family))) continue;
      const d = dist(f, c.center);
      if (d <= radius && (!best || d < best.d)) best = { c, d };
    }
    if (best) {
      best.c.features.push(f);
      updateCluster(best.c);
    } else {
      const c = { features: [f], center: { x: f.x, y: f.y, z: f.z } };
      updateCluster(c);
      clusters.push(c);
    }
  }
  return clusters;
}

function updateCluster(c) {
  const n = c.features.length;
  const sx = c.features.reduce((s, f) => s + f.x, 0);
  const sy = c.features.reduce((s, f) => s + f.y, 0);
  const sz = c.features.reduce((s, f) => s + f.z, 0);
  c.center = { x: sx / n, y: sy / n, z: sz / n };
  c.structures = new Set(c.features.map((f) => f.structure_id));
  c.class = classOfCluster(c);
  c.score = c.structures.size * 10 + n + (c.class.includes("&") ? 2 : 0);
}

function tooClose(a, b, minDist) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < minDist;
}

function selectByTargets(clusters, targets, minSeparation) {
  const selected = [];
  const sorted = clusters.slice().sort((a, b) => b.score - a.score);
  for (const t of targets) {
    let count = Number(t.count || 1);
    for (const c of sorted) {
      if (count <= 0) break;
      if (c.class !== t.class) continue;
      if (selected.some((s) => tooClose(s.center, c.center, minSeparation))) continue;
      selected.push(c);
      count -= 1;
    }
  }
  return selected;
}

function svlFeature(row) {
  return `[expr:'${row.moe_expr}', pos:[${Number(row.x).toFixed(3)},${Number(row.y).toFixed(3)},${Number(row.z).toFixed(3)}], rad:${Number(row.radius || 1.4).toFixed(3)}]`;
}

function winToSvl(file) {
  return path.resolve(file).replace(/\\/g, "/").replace(/'/g, "\\'");
}

function writeMoeSvl(rows, outPh4, outSvl) {
  const fdata = rows.map((r) => `\t\t${svlFeature(r)}`).join(",\n");
  const svl = `#set title 'Consensus Multi-Structure Pharmacophore'
#set class 'SVL:run'
function ph4_QueryOpen;
function ph4_QueryCreateF;
function ph4_QueryWriteFile;
function ph4_QueryClose;
global function main []
\tlocal q = ph4_QueryOpen [];
\tlocal fdata = [\n${fdata}\n\t];\n\tlocal fkey = ph4_QueryCreateF [q, fdata, []];
\tph4_QueryWriteFile [q, '${winToSvl(outPh4)}'];
\tph4_QueryClose q;
\twrite 'Wrote consensus pharmacophore query\\n';
endfunction
`;
  fs.writeFileSync(outSvl, svl, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.config) {
    usage();
    process.exit(2);
  }
  const cfg = readJson(args.config);
  const outDir = path.resolve(cfg.output_dir);
  ensureDir(outDir);
  const ref = cfg.structures.find((s) => s.id === cfg.reference_id) || cfg.structures[0];
  const refCa = parseCa(ref.pdb, ref.receptor_chain || "A");
  const allFeatures = [];
  const alignmentRows = [];
  for (const s of cfg.structures) {
    const movCa = parseCa(s.pdb, s.receptor_chain || "A");
    const keys = [...refCa.keys()].filter((k) => movCa.has(k));
    const refPts = keys.map((k) => refCa.get(k));
    const movPts = keys.map((k) => movCa.get(k));
    const fit = s.id === ref.id
      ? { transform: (p) => p, rmsd: 0, n: keys.length }
      : fitTransform(refPts, movPts);
    alignmentRows.push({ id: s.id, reference: ref.id, common_ca: fit.n, receptor_ca_rmsd: fit.rmsd.toFixed(3) });
    for (const row of readCsv(s.raw_features_csv)) {
      const p = [Number(row.x), Number(row.y), Number(row.z)];
      if (!p.every(Number.isFinite)) continue;
      const t = fit.transform(p);
      allFeatures.push({
        ...row,
        structure_id: s.id,
        original_x: row.x,
        original_y: row.y,
        original_z: row.z,
        x: t[0],
        y: t[1],
        z: t[2],
        family: row.family
      });
    }
  }
  const clusters = recluster(allFeatures, Number(cfg.cluster_radius || 2.2));
  clusters.sort((a, b) => b.score - a.score);
  const selectedClusters = selectByTargets(
    clusters,
    cfg.article_feature_targets || [],
    Number(cfg.min_selected_separation || 1.3)
  );
  const selectedRows = selectedClusters.map((c, i) => ({
    id: `CONS_${String(i + 1).padStart(3, "0")}`,
    family: familyOfClass(c.class),
    article_class: c.class,
    moe_expr: exprOfClass(c.class),
    x: c.center.x.toFixed(3),
    y: c.center.y.toFixed(3),
    z: c.center.z.toFixed(3),
    radius: Number(cfg.feature_radius || 1.4).toFixed(3),
    support_structures: [...c.structures].sort().join(";"),
    support_count: c.structures.size,
    member_count: c.features.length,
    score: c.score.toFixed(3),
    source: "multi_structure_consensus",
    notes: `families=${[...new Set(c.features.map((f) => f.family))].sort().join("&")}`
  }));

  const transformedHeader = ["structure_id", "id", "family", "moe_expr", "x", "y", "z", "original_x", "original_y", "original_z", "nearest_ligand_residue", "nearest_receptor_residue", "site_zone"];
  writeCsv(path.join(outDir, "transformed_raw_features.csv"), allFeatures, transformedHeader);
  const clusterRows = clusters.map((c, i) => ({
    cluster_id: `CL_${String(i + 1).padStart(3, "0")}`,
    article_class: c.class,
    x: c.center.x.toFixed(3),
    y: c.center.y.toFixed(3),
    z: c.center.z.toFixed(3),
    support_structures: [...c.structures].sort().join(";"),
    support_count: c.structures.size,
    member_count: c.features.length,
    score: c.score.toFixed(3),
    families: [...new Set(c.features.map((f) => f.family))].sort().join("&")
  }));
  writeCsv(path.join(outDir, "consensus_clusters.csv"), clusterRows, ["cluster_id", "article_class", "x", "y", "z", "support_structures", "support_count", "member_count", "score", "families"]);
  writeCsv(path.join(outDir, "consensus_selected_features.csv"), selectedRows, ["id", "family", "article_class", "moe_expr", "x", "y", "z", "radius", "support_structures", "support_count", "member_count", "score", "source", "notes"]);
  writeCsv(path.join(outDir, "alignment_summary.csv"), alignmentRows, ["id", "reference", "common_ca", "receptor_ca_rmsd"]);

  const outPh4 = path.join(outDir, "consensus_selected_query.ph4");
  const outSvl = path.join(outDir, "write_consensus_query.svl");
  writeMoeSvl(selectedRows, outPh4, outSvl);
  const report = [
    "# Multi-Structure Consensus Pharmacophore",
    "",
    `Reference: ${ref.id}`,
    `Raw transformed features: ${allFeatures.length}`,
    `Clusters: ${clusters.length}`,
    `Selected: ${selectedRows.length}`,
    "",
    "## Selected Composition",
    ...Object.entries(selectedRows.reduce((m, r) => { m[r.article_class] = (m[r.article_class] || 0) + 1; return m; }, {})).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Alignment",
    ...alignmentRows.map((r) => `- ${r.id} -> ${r.reference}: common CA ${r.common_ca}, RMSD ${r.receptor_ca_rmsd} A`),
    "",
    "## Notes",
    "- Article-style mixed features are represented as expr strings such as Ani&Acc and Don&Acc.",
    "- This reproduces the paper workflow style: multiple structures, receptor alignment, consensus feature selection, then MOE ph4 writing.",
    "- It does not claim coordinate identity unless compared against extracted article F1-F9 coordinates."
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "consensus_report.md"), report, "utf8");

  if (args.run_moe) {
    const moeBin = cfg.moe_bin || "C:/Program Files/moe2024/bin-win64/moebatch.exe";
    const result = cp.spawnSync(moeBin, ["-run", outSvl], { cwd: outDir, encoding: "utf8", windowsHide: true });
    fs.writeFileSync(path.join(outDir, "write_consensus_query.log"), [
      `command=${moeBin} -run ${outSvl}`,
      `status=${result.status}`,
      `error=${result.error ? result.error.message : ""}`,
      "",
      "STDOUT",
      result.stdout || "",
      "",
      "STDERR",
      result.stderr || ""
    ].join("\n"), "utf8");
  }
  console.log(JSON.stringify({ ok: true, outDir, selected: selectedRows.length, report: path.join(outDir, "consensus_report.md") }, null, 2));
}

main();
