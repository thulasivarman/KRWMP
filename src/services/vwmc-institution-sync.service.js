const pool = require('../../config/database');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildInstitutionCode(committee) {
  const code = cleanText(committee.committee_code) || `VWMC-${committee.id}`;
  return String(code).toUpperCase().replace(/[^A-Z0-9_-]/g, '-').slice(0, 50);
}

async function syncCommitteeAsInstitution(committeeId, username = 'system', client = pool) {
  const found = await client.query('SELECT * FROM public.vwmc_committees WHERE id = $1 LIMIT 1;', [committeeId]);
  const committee = found.rows[0];
  if (!committee) return null;

  const institutionName = cleanText(committee.committee_name);
  if (!institutionName) return null;

  const latitude = num(committee.latitude);
  const longitude = num(committee.longitude);
  const institutionCode = buildInstitutionCode(committee);
  const address = cleanText(committee.address) || cleanText([committee.village_name, committee.gnd_name, committee.dsd_name].filter(Boolean).join(', ')) || 'VWMC operating area';

  let existing = null;
  if (committee.institution_id) {
    const result = await client.query('SELECT id FROM public.intervention_institutions WHERE id = $1 LIMIT 1;', [committee.institution_id]);
    existing = result.rows[0] || null;
  }
  if (!existing) {
    const result = await client.query(`
      SELECT id FROM public.intervention_institutions
      WHERE source_module = 'vwmc' AND source_record_id = $1
      LIMIT 1;
    `, [committee.id]);
    existing = result.rows[0] || null;
  }

  let institution;
  if (existing) {
    const result = await client.query(`
      UPDATE public.intervention_institutions
      SET institution_name = $2,
          institution_code = $3,
          institution_type = 'VWMC',
          address = $4,
          district = NULL,
          dsd_name = $5,
          gnd_name = $6,
          description = $7,
          latitude = $8,
          longitude = $9,
          geom = CASE WHEN $8::numeric IS NOT NULL AND $9::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint(($9::numeric)::double precision, ($8::numeric)::double precision), 4326) ELSE geom END,
          active = ($10 <> 'inactive'),
          source_module = 'vwmc',
          source_record_id = $1,
          updated_by = $11,
          updated_at = now()
      WHERE id = $12
      RETURNING id;
    `, [committee.id, institutionName, institutionCode, address, cleanText(committee.dsd_name), cleanText(committee.gnd_name), cleanText(committee.remarks), latitude, longitude, cleanText(committee.status) || 'active', username, existing.id]);
    institution = result.rows[0];
  } else {
    const result = await client.query(`
      INSERT INTO public.intervention_institutions
        (institution_name, institution_code, institution_type, address, dsd_name, gnd_name, description, latitude, longitude, geom, active, source_module, source_record_id, created_by, updated_by)
      VALUES
        ($1,$2,'VWMC',$3,$4,$5,$6,$7,$8,
         CASE WHEN $7::numeric IS NOT NULL AND $8::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint(($8::numeric)::double precision, ($7::numeric)::double precision), 4326) ELSE NULL END,
         $9,'vwmc',$10,$11,$11)
      RETURNING id;
    `, [institutionName, institutionCode, address, cleanText(committee.dsd_name), cleanText(committee.gnd_name), cleanText(committee.remarks), latitude, longitude, (cleanText(committee.status) || 'active') !== 'inactive', committee.id, username]);
    institution = result.rows[0];
  }

  if (institution?.id && Number(institution.id) !== Number(committee.institution_id)) {
    await client.query('UPDATE public.vwmc_committees SET institution_id = $2 WHERE id = $1;', [committee.id, institution.id]);
  }
  return institution?.id || null;
}

async function syncAllVwmcInstitutions(username = 'system') {
  const result = await pool.query('SELECT id FROM public.vwmc_committees ORDER BY id;');
  let synced = 0;
  for (const row of result.rows) {
    const id = await syncCommitteeAsInstitution(row.id, username);
    if (id) synced += 1;
  }
  return { synced };
}

module.exports = { syncCommitteeAsInstitution, syncAllVwmcInstitutions };
