const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { JWT_SECRET } = require('../config');

function toAsciiLettersLower(s) {
  if (!s) return '';
  const map = {
    č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd',
    Č: 'c', Ć: 'c', Ž: 'z', Š: 's', Đ: 'd',
    ä: 'a', ö: 'o', ü: 'u', Ä: 'a', Ö: 'o', Ü: 'u',
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
    à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u',
    ñ: 'n', Ñ: 'n', ß: 'ss',
  };
  const replaced = s.split('').map(ch => map[ch] || ch).join('');
  return replaced.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

async function generateUniqueStudentEmail(firstName, lastName) {
  const domain = 'student.edu.hr';
  const fi = toAsciiLettersLower(firstName).charAt(0);
  let ln = toAsciiLettersLower(lastName);
  if (!ln) ln = toAsciiLettersLower(firstName); // fallback
  let base = `${fi}${ln}`;
  if (!base) base = 'student';
  let email = `${base}@${domain}`;
  let suffix = 2;
  while (true) {
    const exists = await prisma.student.findUnique({ where: { email } });
    if (!exists) return email;
    email = `${base}${suffix}@${domain}`;
    suffix++;
  }
}

function generateJmbag() {
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}
async function generateUniqueJmbag() {
  while (true) {
    const candidate = generateJmbag();
    const exists = await prisma.student.findUnique({ where: { jmbag: candidate } });
    if (!exists) return candidate;
  }
}

function issueJwt(student) {
  const payload = { sub: student.id, email: student.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function ensureYear(enrolledYear) {
  const y = Number(enrolledYear);
  if (![1, 2, 3].includes(y)) {
    throw new Error('enrolledYear mora biti 1, 2 ili 3');
  }
  return y;
}
function ensureModule(enrolledYear, module) {
  if (enrolledYear === 3) return module || null;
  return null;
}

module.exports = {
  toAsciiLettersLower,
  generateUniqueStudentEmail,
  generateUniqueJmbag,
  issueJwt,
  ensureYear,
  ensureModule,
};