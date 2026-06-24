const bcrypt = require('bcryptjs');
const pool = require('../../config/database');
const { signToken } = require('../utils/jwt');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeEmail(value) {
  const email = cleanText(value);
  return email ? email.toLowerCase() : null;
}

function normalizePhone(value) {
  const phone = cleanText(value);
  if (!phone) return null;
  const compact = phone.replace(/[\s()-]/g, '');
  if (/^\+94\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^94\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  return compact;
}

function initialsFromName(name = '') {
  return String(name || '')
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 4)
    .toUpperCase() || 'USR';
}

function validateSelfProfile(body = {}) {
  const name = cleanText(body.name || body.full_name);
  const email = normalizeEmail(body.email);
  const phoneNumber = normalizePhone(body.phone_number);

  if (!name || name.length < 2) {
    const error = new Error('Full name is required.');
    error.statusCode = 400;
    throw error;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Email format is invalid.');
    error.statusCode = 400;
    throw error;
  }
  if (phoneNumber && !/^[0-9+()\-\s]{7,30}$/.test(phoneNumber)) {
    const error = new Error('Phone number format is invalid.');
    error.statusCode = 400;
    throw error;
  }
  return { name, email, phoneNumber };
}

async function login(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  const cleanPassword = password.trim();

  const query = `
    SELECT u.id, u.name, u.designation, u.initials, u.identifier, u.email, u.phone_number, u.institution_id, u.password_hash,
           r.role_name, r.visible_sections,
           COALESCE(json_agg(json_build_object('section', perm.section_name, 'capability', perm.capability_type)) FILTER (WHERE perm.id IS NOT NULL), '[]') AS capabilities
    FROM public.users u
    LEFT JOIN public.roles r ON u.role_id = r.id
    LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
    LEFT JOIN public.permissions perm ON rp.permission_id = perm.id
    WHERE u.identifier = $1
    GROUP BY u.id, r.id
    LIMIT 1;
  `;

  const result = await pool.query(query, [cleanUsername]);
  if (result.rows.length === 0) return { success: false, message: 'Invalid username or password' };

  const user = result.rows[0];
  const passwordMatch = await bcrypt.compare(cleanPassword, user.password_hash);
  if (!passwordMatch) return { success: false, message: 'Invalid username or password' };

  delete user.password_hash;
  return { success: true, message: 'Login successful', token: signToken(user), user };
}

async function getProfile(identifier) {
  const query = `
    SELECT u.id, u.name, u.designation, u.initials, u.identifier, u.email, u.phone_number, u.institution_id,
           i.institution_name,
           r.role_name, r.visible_sections,
           p.id AS person_id,
           p.full_name AS person_full_name,
           p.preferred_name,
           p.nic_number,
           p.gender,
           p.date_of_birth,
           p.phone_number AS person_phone_number,
           p.email AS person_email,
           p.address,
           p.dsd,
           p.gnd,
           p.status AS person_status
    FROM public.users u
    LEFT JOIN public.roles r ON u.role_id = r.id
    LEFT JOIN public.intervention_institutions i ON i.id = u.institution_id
    LEFT JOIN public.persons p ON p.linked_user_id::text = u.id::text AND COALESCE(p.status, 'active') <> 'deleted'
    WHERE u.identifier = $1
    LIMIT 1;
  `;
  const result = await pool.query(query, [identifier]);
  return result.rows[0] || null;
}

async function updateProfile(identifier, data) {
  const { name, email, phoneNumber } = validateSelfProfile(data);
  const initials = cleanText(data.initials) || initialsFromName(name);
  await pool.query(`
    UPDATE public.users
    SET name = $1,
        initials = $2,
        email = $3,
        phone_number = $4
    WHERE identifier = $5;
  `, [name, initials.toUpperCase(), email, phoneNumber, identifier.trim().toLowerCase()]);
}

async function getSelfProfile(identifier) {
  const profile = await getProfile(identifier);
  if (!profile) return null;
  return {
    user: {
      id: profile.id,
      name: profile.name,
      designation: profile.designation,
      initials: profile.initials,
      identifier: profile.identifier,
      email: profile.email,
      phone_number: profile.phone_number,
      institution_id: profile.institution_id,
      institution_name: profile.institution_name,
      role_name: profile.role_name,
      visible_sections: profile.visible_sections,
    },
    person: profile.person_id ? {
      id: profile.person_id,
      full_name: profile.person_full_name,
      preferred_name: profile.preferred_name,
      nic_number: profile.nic_number,
      gender: profile.gender,
      date_of_birth: profile.date_of_birth,
      phone_number: profile.person_phone_number,
      email: profile.person_email,
      address: profile.address,
      dsd: profile.dsd,
      gnd: profile.gnd,
      status: profile.person_status,
    } : null,
  };
}

async function updateSelfProfile(identifier, body = {}) {
  const { name, email, phoneNumber } = validateSelfProfile(body);
  const preferredName = cleanText(body.preferred_name);
  const address = cleanText(body.address);
  const dsd = cleanText(body.dsd);
  const gnd = cleanText(body.gnd);
  const initials = initialsFromName(name);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(`
      UPDATE public.users
      SET name = $2,
          initials = $3,
          email = $4,
          phone_number = $5
      WHERE identifier = $1
      RETURNING id, name, designation, initials, identifier, email, phone_number, institution_id;
    `, [identifier.trim().toLowerCase(), name, initials, email, phoneNumber]);

    if (!userResult.rows.length) {
      const error = new Error('Profile not found.');
      error.statusCode = 404;
      throw error;
    }

    const user = userResult.rows[0];
    const linkedUserId = String(user.id);
    const personResult = await client.query(`SELECT id FROM public.persons WHERE linked_user_id::text = $1 AND COALESCE(status, 'active') <> 'deleted' LIMIT 1;`, [linkedUserId]);

    if (personResult.rows.length) {
      await client.query(`
        UPDATE public.persons
        SET full_name = $2,
            preferred_name = $3,
            phone_number = $4,
            email = $5,
            address = $6,
            dsd = $7,
            gnd = $8,
            updated_at = now()
        WHERE id = $1;
      `, [personResult.rows[0].id, name, preferredName, phoneNumber, email, address, dsd, gnd]);
    } else {
      await client.query(`
        INSERT INTO public.persons (full_name, preferred_name, phone_number, email, address, dsd, gnd, status, linked_user_id, is_system_user)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,true);
      `, [name, preferredName, phoneNumber, email, address, dsd, gnd, linkedUserId]);
    }

    await client.query('COMMIT');
    return getSelfProfile(identifier);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateSelfPassword(identifier, body = {}) {
  const currentPassword = cleanText(body.current_password || body.currentPassword);
  const newPassword = cleanText(body.new_password || body.newPassword);
  const confirmPassword = cleanText(body.confirm_password || body.confirmPassword);

  if (!currentPassword || !newPassword || !confirmPassword) {
    const error = new Error('Current password, new password and confirmation are required.');
    error.statusCode = 400;
    throw error;
  }
  if (newPassword.length < 8) {
    const error = new Error('New password must contain at least 8 characters.');
    error.statusCode = 400;
    throw error;
  }
  if (newPassword !== confirmPassword) {
    const error = new Error('New password and confirmation do not match.');
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query('SELECT id, password_hash FROM public.users WHERE identifier = $1 LIMIT 1;', [identifier.trim().toLowerCase()]);
  if (!result.rows.length) {
    const error = new Error('Profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!passwordMatch) {
    const error = new Error('Current password is incorrect.');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE public.users SET password_hash = $2 WHERE id = $1;', [result.rows[0].id, passwordHash]);
  return { success: true, message: 'Password updated successfully.' };
}

module.exports = { login, getProfile, updateProfile, getSelfProfile, updateSelfProfile, updateSelfPassword };
