import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import * as L from '../lib/linkedin.js';
import { files, zip } from './fixture.mjs';

test('csv: quotes, escapes, newlines, CRLF, BOM', () => {
  assert.deepEqual(L.parseCsv('﻿a,"b,c","d ""e""\nf"\r\n1,2,3'), [['a', 'b,c', 'd "e"\nf'], ['1', '2', '3']]);
  assert.deepEqual(L.parseCsv(''), []);
});

test('zip: reads the six CSVs (in a sub-folder too), ignores the rest', async () => {
  for (const dir of [null, 'Basic_LinkedInDataExport_10-24-2026']) {
    const d = await L.fromZip(JSZip, await zip(JSZip, { dir }));
    assert.deepEqual(d.files.sort(), ['certifications', 'connections', 'education', 'positions', 'profile', 'skills']);
    assert.ok(!JSON.stringify(d).includes('must never be read'));
  }
});

test('profile: keeps name/headline/summary/location/sites, drops address, birth date, zip, bad URLs', () => {
  const p = L.readProfile(files['Profile.csv']);
  assert.equal(p.firstName, 'Ada'); assert.equal(p.lastName, 'Testwright');
  assert.equal(p.headline, 'Engineer, writer & <b>builder</b>'); // kept as text; the page escapes it
  assert.equal(p.summary, 'Line one.\nLine two with a "quote".');
  assert.equal(p.location, 'London, England, United Kingdom');
  assert.deepEqual(p.websites, ['https://ada.example.com']);
  const s = JSON.stringify(p);
  for (const bad of ['Fake Street', '1990', 'ZZ1', 'javascript']) assert.ok(!s.includes(bad), bad);
});

test('positions newest first, current job on top; education; skills de-duplicated', () => {
  const ps = L.readPositions(files['Positions.csv']);
  assert.deepEqual(ps.map((p) => p.company), ['Example Labs', 'Old Co', 'First Job Ltd']);
  assert.equal(ps[0].finishedOn, '');
  assert.equal(ps[0].description, 'Built things, shipped them.\nLed a team of 4.');
  assert.ok(!('_start' in ps[0]));
  const ed = L.readEducation(files['Education.csv']);
  assert.equal(ed[0].school, 'University of Example'); assert.equal(ed[0].degree, 'BSc Computer Science');
  assert.deepEqual(L.readSkills(files['Skills.csv']), ['JavaScript', 'TypeScript', 'Bitcoin', 'Teaching, mentoring']);
});

test('certifications drop non-http URLs; connections skip the preamble and keep only linkedin URLs', () => {
  const c = L.readCertifications(files['Certifications.csv']);
  assert.equal(c[0].url, 'https://cert.example.com/123'); assert.equal(c[1].url, '');
  const k = L.readConnections(files['Connections.csv']);
  assert.equal(k.length, 2);
  assert.equal(k[0].firstName, 'Bob'); assert.equal(k[0].url, 'https://www.linkedin.com/in/bob-fake');
  assert.equal(k[1].company, 'Shop, Ltd'); assert.equal(k[1].url, '');
});

test('public profile: nothing by default; only ticked sections; never connections', async () => {
  const d = await L.fromZip(JSZip, await zip(JSZip));
  assert.equal(L.publicProfile(d, []), null);
  const p = L.publicProfile(d, ['skills']);
  assert.deepEqual(Object.keys(p).sort(), ['skills', 'v']);
  const all = L.publicProfile(d, L.PUBLIC_SECTIONS.concat(['connections']));
  assert.equal(all.name, 'Ada Testwright');
  const s = JSON.stringify(all);
  assert.ok(!s.includes('Fakeperson') && !s.includes('cara@example.com') && !('connections' in all));
});

test('limits: oversized CSV and ZIP refused, row caps hold, not-a-zip is a plain error', async () => {
  assert.throws(() => L.fromTexts([{ name: 'Skills.csv', text: 'x'.repeat(L.LIMITS.csvBytes + 1) }]), /too big/);
  await assert.rejects(L.fromZip(JSZip, { byteLength: L.LIMITS.zipBytes + 1 }), /over 60 MB/);
  await assert.rejects(L.fromZip(JSZip, new Uint8Array([1, 2, 3])), /not a ZIP/);
  const many = 'Name\n' + Array.from({ length: 5000 }, (_, i) => 'skill' + i).join('\n');
  assert.equal(L.readSkills(many).length, L.LIMITS.skills);
  const long = 'Company Name,Title,Description\nA,B,' + 'y'.repeat(10000) + '\n';
  assert.equal(L.readPositions(long)[0].description.length, L.LIMITS.field);
});

test('individual CSVs merge into an existing import', () => {
  let d = L.fromTexts([{ name: 'Skills.csv', text: files['Skills.csv'] }]);
  d = L.fromTexts([{ name: 'some/dir/Positions.csv', text: files['Positions.csv'] }, { name: 'notes.txt', text: 'x' }], d);
  assert.equal(d.skills.length, 4); assert.equal(d.positions.length, 3);
  assert.deepEqual(L.counts(d), { profile: 0, positions: 3, education: 0, skills: 4, certifications: 0, connections: 0 });
});
