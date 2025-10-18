/* prisma/seed.js */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function isStudentEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@student.edu.hr');
}

function generateJmbag() {
  // Generira 10-znamenkasti JMBAG kao string
  let s = '';
  for (let i = 0; i < 10; i++) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

async function generateUniqueJmbag() {
  // Petlja dok ne nađemo jedinstveni
  // (za SQLite i 10 studenata ovo je brzo; u prod okolini koristiti robusnije strategije)
  while (true) {
    const candidate = generateJmbag();
    const exists = await prisma.student.findUnique({ where: { jmbag: candidate } });
    if (!exists) return candidate;
  }
}

function ensureModule(enrolledYear, moduleValue) {
  // Modul smije biti postavljen samo ako je upisana godina 3
  if (enrolledYear === 3) return moduleValue || 'SE'; // default modul ako nije naveden
  return null;
}

function ensureYear(enrolledYear) {
  // godine mogu biti 1, 2 ili 3
  const allowed = [1, 2, 3];
  if (!allowed.includes(enrolledYear)) {
    throw new Error('enrolledYear mora biti 1, 2 ili 3');
  }
  return enrolledYear;
}

async function main() {
  // Očisti tablicu (opcionalno za razvoj)
  await prisma.student.deleteMany();

  const plainPassword = 'Lozinka123!'; // zajednička test lozinka
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // 10 primjera studenata
  const seedStudents = [
    { firstName: 'Ana', lastName: 'Anić',   email: 'ana.anic@student.edu.hr',   enrolledYear: 1, repeatingYear: false, module: null },
    { firstName: 'Marko', lastName: 'Markić', email: 'marko.markic@student.edu.hr', enrolledYear: 2, repeatingYear: false, module: null },
    { firstName: 'Iva', lastName: 'Ivić',    email: 'iva.ivic@student.edu.hr',    enrolledYear: 3, repeatingYear: false, module: 'SE' },
    { firstName: 'Luka', lastName: 'Lukić',  email: 'luka.lukic@student.edu.hr',  enrolledYear: 1, repeatingYear: true,  module: null },
    { firstName: 'Petra', lastName: 'Petrić', email: 'petra.petric@student.edu.hr', enrolledYear: 2, repeatingYear: false, module: null },
    { firstName: 'Ivan', lastName: 'Ivić',   email: 'ivan.ivic@student.edu.hr',   enrolledYear: 3, repeatingYear: true,  module: 'AI' },
    { firstName: 'Mia', lastName: 'Mijić',   email: 'mia.mijic@student.edu.hr',   enrolledYear: 1, repeatingYear: false, module: null },
    { firstName: 'Filip', lastName: 'Filić', email: 'filip.filic@student.edu.hr', enrolledYear: 2, repeatingYear: true,  module: null },
    { firstName: 'Ema', lastName: 'Emić',    email: 'ema.emic@student.edu.hr',    enrolledYear: 3, repeatingYear: false, module: 'IT' },
    { firstName: 'Sara', lastName: 'Sarić',  email: 'sara.saric@student.edu.hr',  enrolledYear: 3, repeatingYear: false, module: 'DS' },
  ];

  for (const s of seedStudents) {
    if (!isStudentEmail(s.email)) {
      throw new Error(`Email nije u dopuštenoj domeni: ${s.email}`);
    }
    const year = ensureYear(s.enrolledYear);
    const module = ensureModule(year, s.module);
    const jmbag = await generateUniqueJmbag();

    await prisma.student.create({
      data: {
        jmbag,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email.toLowerCase(),
        passwordHash,
        enrolledYear: year,
        repeatingYear: Boolean(s.repeatingYear),
        module,
      },
    });
  }

  console.log('Seed završen: dodano 10 studenata.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });