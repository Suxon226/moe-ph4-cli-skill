#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const AA = new Set("ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL MSE SEC PYL".split(" "));
const WATER = new Set(["HOH", "WAT", "DOD"]);
const METALS = new Set(["ZN", "MG", "MN", "CA", "FE", "CU", "CO", "NI", "NA", "K", "CL"]);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
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

function key(a) {
  return `${a.chain}:${a.resn}:${a.resi}`;
}

function summarize(atoms) {
  const chains = {};
  for (const a of atoms) {
    if (!chains[a.chain]) {
      chains[a.chain] = {
        chain: a.chain,
        atom_count: 0,
        atom_residue_count: 0,
        amino_acid_residue_count: 0,
        nonstandard_atom_residue_count: 0,
        hetero_residue_count: 0,
        water_residue_count: 0,
        metal_or_ion_residue_count: 0,
        hetero_residue_names: {},
        likely_role: "unknown"
      };
    }
    const c = chains[a.chain];
    c.atom_count += 1;
    if (a.rec === "ATOM") {
      c._atomResidues = c._atomResidues || new Set();
      c._atomResidues.add(key(a));
    } else {
      c._hetResidues = c._hetResidues || new Set();
      c._hetResidues.add(key(a));
      c.hetero_residue_names[a.resn] = (c.hetero_residue_names[a.resn] || 0) + 1;
    }
  }

  for (const c of Object.values(chains)) {
    const atomResidues = Array.from(c._atomResidues || []);
    const hetResidues = Array.from(c._hetResidues || []);
    c.atom_residue_count = atomResidues.length;
    c.hetero_residue_count = hetResidues.length;
    c.amino_acid_residue_count = atomResidues.filter(k => AA.has(k.split(":")[1])).length;
    c.nonstandard_atom_residue_count = atomResidues.length - c.amino_acid_residue_count;
    c.water_residue_count = hetResidues.filter(k => WATER.has(k.split(":")[1])).length;
    c.metal_or_ion_residue_count = hetResidues.filter(k => METALS.has(k.split(":")[1])).length;
    if (c.amino_acid_residue_count >= 60) c.likely_role = "protein_receptor_or_domain";
    else if (c.amino_acid_residue_count >= 2) c.likely_role = "peptide_or_short_protein_chain";
    else if (c.hetero_residue_count > c.water_residue_count) c.likely_role = "ligand_cofactor_or_ion_chain";
    delete c._atomResidues;
    delete c._hetResidues;
  }
  return Object.values(chains).sort((a, b) => a.chain.localeCompare(b.chain));
}

function main() {
  const pdb = arg("--pdb");
  const out = arg("--out");
  if (!pdb) {
    console.error("Usage: node structure_qc.js --pdb structure.pdb --out structure_qc.json");
    process.exit(2);
  }
  const atoms = parsePdb(pdb);
  const report = {
    structure: path.resolve(pdb),
    atom_count: atoms.length,
    chains: summarize(atoms),
    generated_at: new Date().toISOString()
  };
  const json = JSON.stringify(report, null, 2);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json + "\n", "utf8");
  } else {
    console.log(json);
  }
}

main();
