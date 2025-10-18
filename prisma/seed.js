/* prisma/seed.js */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/* ----------- Helperi za studente ----------- */
function isStudentEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@student.edu.hr');
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

function ensureModule(enrolledYear, moduleValue) {
  if (enrolledYear === 3) return moduleValue || 'SE';
  return null;
}

function ensureYear(enrolledYear) {
  const allowed = [1, 2, 3];
  if (!allowed.includes(enrolledYear)) {
    throw new Error('enrolledYear mora biti 1, 2 ili 3');
  }
  return enrolledYear;
}

/* ----------- Podaci za kolegije ----------- */
const courseData = [
  // Semestar 1 (Godina 1)
  { name: 'Uvod u programiranje', holder: 'dr.sc. Marko Markić', description: 'Osnove programiranja i algoritamskog razmišljanja.', ects: 6, semester: 1, year: 1 },
  { name: 'Matematika 1', holder: 'dr.sc. Ana Anić', description: 'Temelji matematičke analize.', ects: 6, semester: 1, year: 1 },
  { name: 'Osnove računarstva', holder: 'dr.sc. Luka Lukić', description: 'Uvod u računalne sustave i arhitekturu.', ects: 5, semester: 1, year: 1 },
  { name: 'Engleski jezik 1', holder: 'lekt. Petra Petrić', description: 'Akademski engleski za IT.', ects: 4, semester: 1, year: 1 },
  { name: 'Diskretna matematika', holder: 'dr.sc. Ivan Ivić', description: 'Skupovi, relacije, grafovi.', ects: 5, semester: 1, year: 1 },
  { name: 'Vještine učenja i istraživanja', holder: 'doc.dr.sc. Ema Emić', description: 'Učenje, istraživanje i pisanje.', ects: 4, semester: 1, year: 1 },

  // Semestar 2 (Godina 1) — 4 preduvjeta
  { name: 'Programiranje 2', holder: 'dr.sc. Marko Markić', description: 'Strukture podataka, OOP osnove.', ects: 6, semester: 2, year: 1, prerequisiteName: 'Uvod u programiranje' },
  { name: 'Matematika 2', holder: 'dr.sc. Ana Anić', description: 'Nastavak matematičke analize.', ects: 6, semester: 2, year: 1, prerequisiteName: 'Matematika 1' },
  { name: 'Algoritmi i strukture podataka', holder: 'doc.dr.sc. Filip Filić', description: 'Analiza i dizajn algoritama.', ects: 6, semester: 2, year: 1 },
  { name: 'Engleski jezik 2', holder: 'lekt. Petra Petrić', description: 'Napredni akademski engleski za IT.', ects: 4, semester: 2, year: 1, prerequisiteName: 'Engleski jezik 1' },
  { name: 'Osnove baza podataka', holder: 'dr.sc. Mia Mijić', description: 'Relacijske baze, SQL osnove.', ects: 5, semester: 2, year: 1, prerequisiteName: 'Osnove računarstva' },
  { name: 'Sustavi i mreže', holder: 'dr.sc. Sara Sarić', description: 'Operativni sustavi i mrežni koncepti.', ects: 5, semester: 2, year: 1 },

  // Semestar 3 (Godina 2) — 1 dodatni preduvjet (ukupno 5)
  { name: 'Objektno orijentirano programiranje', holder: 'dr.sc. Iva Ivić', description: 'Napredni OOP obrasci i praksa.', ects: 6, semester: 3, year: 2, prerequisiteName: 'Programiranje 2' },
  { name: 'Operacijski sustavi', holder: 'dr.sc. Luka Lukić', description: 'Koncepti OS-a i implementacije.', ects: 6, semester: 3, year: 2 },
  { name: 'Upravljanje bazama podataka', holder: 'dr.sc. Petra Petrić', description: 'Modeliranje, normalizacija, administracija.', ects: 5, semester: 3, year: 2 },
  { name: 'Vjerojatnost i statistika', holder: 'dr.sc. Ivan Ivić', description: 'Temelji statistike za računarstvo.', ects: 6, semester: 3, year: 2 },
  { name: 'Web tehnologije', holder: 'doc.dr.sc. Filip Filić', description: 'Frontend i backend osnove.', ects: 5, semester: 3, year: 2 },
  { name: 'Tehnike komunikacije', holder: 'mr.sc. Ema Emić', description: 'Prezentacijske i timske vještine.', ects: 4, semester: 3, year: 2 },

  // Semestar 4 (Godina 2)
  { name: 'Računalne arhitekture', holder: 'dr.sc. Luka Lukić', description: 'Napredne arhitekture i performanse.', ects: 5, semester: 4, year: 2 },
  { name: 'Softversko inženjerstvo', holder: 'dr.sc. Marko Markić', description: 'Procesi razvoja i kvaliteta softvera.', ects: 6, semester: 4, year: 2 },
  { name: 'Računalne mreže', holder: 'dr.sc. Sara Sarić', description: 'Protokoli, sigurnost i administracija.', ects: 6, semester: 4, year: 2 },
  { name: 'Napredne baze podataka', holder: 'dr.sc. Mia Mijić', description: 'Optimizacija, NoSQL, distribuirane baze.', ects: 5, semester: 4, year: 2 },
  { name: 'Strojno učenje', holder: 'dr.sc. Iva Ivić', description: 'Temelji ML-a i primjene.', ects: 6, semester: 4, year: 2 },
  { name: 'Praktični projekt 1', holder: 'doc.dr.sc. Filip Filić', description: 'Timskih projekt s mentorstvom.', ects: 5, semester: 4, year: 2 },

  // Semestar 5 (Godina 3)
  { name: 'Distribuirani sustavi', holder: 'dr.sc. Sara Sarić', description: 'Skalabilnost, konzistencija, komunikacija.', ects: 6, semester: 5, year: 3 },
  { name: 'Sigurnost informacijskih sustava', holder: 'dr.sc. Luka Lukić', description: 'Kriptografija, sigurnosne politike.', ects: 6, semester: 5, year: 3 },
  { name: 'Analiza podataka', holder: 'dr.sc. Iva Ivić', description: 'Statistička analiza i vizualizacija.', ects: 6, semester: 5, year: 3 },
  { name: 'Mobilne aplikacije', holder: 'dr.sc. Marko Markić', description: 'Android/iOS razvoj i UX.', ects: 6, semester: 5, year: 3 },
  { name: 'Cloud računarstvo', holder: 'dr.sc. Mia Mijić', description: 'IaaS, PaaS, DevOps alati.', ects: 5, semester: 5, year: 3 },
  { name: 'Poduzetništvo i inovacije', holder: 'mr.sc. Ema Emić', description: 'Osnove poduzetništva u IT-u.', ects: 4, semester: 5, year: 3 },

  // Semestar 6 (Godina 3)
  { name: 'Napredne web aplikacije', holder: 'doc.dr.sc. Filip Filić', description: 'SPA, SSR i performanse.', ects: 6, semester: 6, year: 3 },
  { name: 'Big Data tehnologije', holder: 'dr.sc. Sara Sarić', description: 'Hadoop ekosustav, stream obrada.', ects: 6, semester: 6, year: 3 },
  { name: 'Poslovna inteligencija', holder: 'dr.sc. Mia Mijić', description: 'DWH, ETL, BI alati.', ects: 6, semester: 6, year: 3 },
  { name: 'DevOps i CI/CD', holder: 'dr.sc. Luka Lukić', description: 'CI/CD prakse i alati.', ects: 6, semester: 6, year: 3 },
  { name: 'Diplomski seminar', holder: 'dr.sc. Ivan Ivić', description: 'Priprema diplomskog rada.', ects: 4, semester: 6, year: 3 },
  { name: 'Praktični projekt 2', holder: 'dr.sc. Marko Markić', description: 'Završni timski projekt.', ects: 6, semester: 6, year: 3 },
];

async function main() {
  // Očisti tablice (opcionalno u razvoju)
  await prisma.course.deleteMany();
  await prisma.student.deleteMany();

  /* ---- Seed studenata ---- */
  const plainPassword = 'Lozinka123!';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

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

  /* ---- Seed kolegija ---- */
  // Validacija da je 6 po semestru
  const bySemester = courseData.reduce((acc, c) => {
    acc[c.semester] = (acc[c.semester] || 0) + 1;
    return acc;
  }, {});
  for (let sem = 1; sem <= 6; sem++) {
    if ((bySemester[sem] || 0) !== 6) {
      throw new Error(`Semestar ${sem} mora imati točno 6 kolegija (trenutno: ${bySemester[sem] || 0}).`);
    }
  }

  // Kreiraj sve kolegije bez preduvjeta (relacije se naknadno postavljaju)
  for (const c of courseData) {
    // Osnovne validacije
    if (c.semester < 1 || c.semester > 6) throw new Error(`Neispravan semestar za kolegij "${c.name}".`);
    if (c.year < 1 || c.year > 3) throw new Error(`Neispravna godina za kolegij "${c.name}".`);
    await prisma.course.create({
      data: {
        name: c.name,
        holder: c.holder,
        description: c.description,
        ects: c.ects,
        semester: c.semester,
        year: c.year,
      },
    });
  }

  // Postavi 5 preduvjeta (ako su definirani)
  for (const c of courseData) {
    if (!c.prerequisiteName) continue;
    const prereq = await prisma.course.findUnique({ where: { name: c.prerequisiteName } });
    if (!prereq) throw new Error(`Preduvjet "${c.prerequisiteName}" nije pronađen za kolegij "${c.name}".`);
    await prisma.course.update({
      where: { name: c.name },
      data: { prerequisiteId: prereq.id },
    });
  }

  console.log('Seed završen: dodano 10 studenata i 36 kolegija (5 s preduvjetom).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });