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

/* ----------- Podaci za kolegije (kao ranije) ----------- */
const courseData = [
  // Semestar 1 (Godina 1)
  { name: 'Uvod u programiranje', holder: 'dr.sc. Marko Markić', description: 'Osnove programiranja i algoritamskog razmišljanja.', ects: 6, semester: 1, year: 1 },
  { name: 'Matematika 1', holder: 'dr.sc. Ana Anić', description: 'Temelji matematičke analize.', ects: 6, semester: 1, year: 1 },
  { name: 'Osnove računarstva', holder: 'dr.sc. Luka Lukić', description: 'Uvod u računalne sustave i arhitekturu.', ects: 5, semester: 1, year: 1 },
  { name: 'Engleski jezik 1', holder: 'lekt. Petra Petrić', description: 'Akademski engleski za IT.', ects: 4, semester: 1, year: 1 },
  { name: 'Diskretna matematika', holder: 'dr.sc. Ivan Ivić', description: 'Skupovi, relacije, grafovi.', ects: 5, semester: 1, year: 1 },
  { name: 'Vještine učenja i istraživanja', holder: 'doc.dr.sc. Ema Emić', description: 'Učenje, istraživanje i pisanje.', ects: 4, semester: 1, year: 1 },

  // Semestar 2 (Godina 1) — preduvjeti
  { name: 'Programiranje 2', holder: 'dr.sc. Marko Markić', description: 'Strukture podataka, OOP osnove.', ects: 6, semester: 2, year: 1, prerequisiteName: 'Uvod u programiranje' },
  { name: 'Matematika 2', holder: 'dr.sc. Ana Anić', description: 'Nastavak matematičke analize.', ects: 6, semester: 2, year: 1, prerequisiteName: 'Matematika 1' },
  { name: 'Algoritmi i strukture podataka', holder: 'doc.dr.sc. Filip Filić', description: 'Analiza i dizajn algoritama.', ects: 6, semester: 2, year: 1 },
  { name: 'Engleski jezik 2', holder: 'lekt. Petra Petrić', description: 'Napredni akademski engleski za IT.', ects: 4, semester: 2, year: 1, prerequisiteName: 'Engleski jezik 1' },
  { name: 'Osnove baza podataka', holder: 'dr.sc. Mia Mijić', description: 'Relacijske baze, SQL osnove.', ects: 5, semester: 2, year: 1, prerequisiteName: 'Osnove računarstva' },
  { name: 'Sustavi i mreže', holder: 'dr.sc. Sara Sarić', description: 'Operativni sustavi i mrežni koncepti.', ects: 5, semester: 2, year: 1 },

  // Semestar 3 (Godina 2) — preduvjet
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
  await prisma.studentCourse.deleteMany();
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

  const students = [];
  for (const s of seedStudents) {
    if (!isStudentEmail(s.email)) {
      throw new Error(`Email nije u dopuštenoj domeni: ${s.email}`);
    }
    const year = ensureYear(s.enrolledYear);
    const module = ensureModule(year, s.module);
    const jmbag = await generateUniqueJmbag();

    const created = await prisma.student.create({
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
    students.push(created);
  }

  /* ---- Seed kolegija ---- */
  // Kreiraj sve kolegije bez preduvjeta (relacije naknadno)
  for (const c of courseData) {
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

  // Postavi preduvjete (ako su definirani)
  for (const c of courseData) {
    if (!c.prerequisiteName) continue;
    const prereq = await prisma.course.findUnique({ where: { name: c.prerequisiteName } });
    await prisma.course.update({
      where: { name: c.name },
      data: { prerequisiteId: prereq.id },
    });
  }
const courses = await prisma.course.findMany();
const coursesBySem = courses.reduce((acc, c) => {
  acc[c.semester] = acc[c.semester] || [];
  acc[c.semester].push(c);
  return acc;
}, {});
const coursesByYear = (y) => courses.filter(c => c.year === y);

const yearSemesters = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
};

function addEnrollment(enrollments, { studentId, course, status, assignedYear, assignedSemester }) {
  enrollments.push({
    studentId,
    courseId: course.id,
    status,
    assignedYear,
    assignedSemester,
  });
}

function shouldPassInHistory(course, semester) {
  // Heuristika: većina prolazi, ali neki tipični teži predmeti padaju
  const forcePass = new Set([
    'Programiranje 2',
    'Matematika 2',
    'Engleski jezik 2',
    'Osnove baza podataka',
  ]);
  const likelyFailBySem = {
    1: new Set(['Diskretna matematika']),
    2: new Set(['Algoritmi i strukture podataka', 'Sustavi i mreže']),
    3: new Set(['Operacijski sustavi']),
    4: new Set(['Računalne mreže']),
    5: new Set(['Cloud računarstvo']),
    6: new Set(['Big Data tehnologije']),
  };

  if (forcePass.has(course.name)) return true;
  if (likelyFailBySem[semester]?.has(course.name)) return false;

  // default: prolazi većina
  return true;
}

function collectYearHistory(student, targetYear, allEnrollments, passedSet, failedBySem) {
  // Zapiši PASSED/FAILED za sve kolegije iz targetYear (oba semestra)
  const [semA, semB] = yearSemesters[targetYear];

  for (const sem of [semA, semB]) {
    for (const course of (coursesBySem[sem] || [])) {
      const pass = shouldPassInHistory(course, sem);
      const status = pass ? 'PASSED' : 'FAILED';
      addEnrollment(allEnrollments, {
        studentId: student.id,
        course,
        status,
        assignedYear: targetYear,
        assignedSemester: sem,
      });
      if (pass) passedSet.add(course.id);
      else {
        failedBySem[sem] = failedBySem[sem] || [];
        failedBySem[sem].push(course);
      }
    }
  }
}

// Aktivne predmete punimo prvo retake, pa nove, uz limit od 6 kolegija i 30 ECTS po semestru
function fillSemesterActive({ enrollments, student, semester, retakeCandidates, newCandidates, passedSet, activeSet }) {
  const MAX_COUNT = 6;
  const MAX_ECTS = 30;
  let count = 0;
  let ects = 0;

  const canActivate = (course) => {
    // preduvjet mora biti PASSED (ako postoji)
    if (!course.prerequisiteId) return true;
    return passedSet.has(course.prerequisiteId);
  };

  const tryAdd = (course) => {
    if (count >= MAX_COUNT) return false;
    if (activeSet.has(course.id)) return false;         // ne dupliciraj ACTIVE za isti kolegij
    if (passedSet.has(course.id)) return false;         // nema smisla aktivirati već položen
    if (!canActivate(course)) return false;
    if (ects + course.ects > MAX_ECTS) return false;
    addEnrollment(enrollments, {
      studentId: student.id,
      course,
      status: 'ACTIVE',
      assignedYear: student.enrolledYear,
      assignedSemester: semester,
    });
    activeSet.add(course.id);
    count += 1;
    ects += course.ects;
    return true;
  };

  // 1) retake (FAILED iz prijašnjih relevantnih semestara)
  for (const course of retakeCandidates) tryAdd(course);

  // 2) novi kolegiji u tekućem semestru
  for (const course of newCandidates) tryAdd(course);
}

const allEnrollments = [];

for (const student of students) {
  const passedSet = new Set();              // courseId s PASSED statusom
  const failedBySem = {};                   // { sem: Course[] } - prikupljeni FAIL kroz godine
  const activeSet = new Set();              // već dodani ACTIVE courseId (izbjegni duplikate)

  // 1) Povijest PASSED/FAILED za sve prethodne godine (1..enrolledYear-1)
  for (let y = 1; y < student.enrolledYear; y++) {
    collectYearHistory(student, y, allEnrollments, passedSet, failedBySem);
  }

  // 2) Ako je ponavljač, dodaj povijest za istu godinu (pretodni ciklus iste godine)
  if (student.repeatingYear) {
    collectYearHistory(student, student.enrolledYear, allEnrollments, passedSet, failedBySem);
  }

  // 3) Planiranje ACTIVE za tekuću godinu (dva semestra), uz retake iz svih prethodnih odgovarajućih semestara
  const [currentOdd, currentEven] = yearSemesters[student.enrolledYear];
  const priorOdds = [1, 3, 5].filter(s => s < currentOdd);
  const priorEvens = [2, 4, 6].filter(s => s < currentEven);

  // retake kandidati: svi FAILED iz prijašnjih "istog pariteta" semestara
  const retakeOdd = [
    ...(priorOdds.flatMap(s => failedBySem[s] || [])),
    ...(student.repeatingYear ? (failedBySem[currentOdd] || []) : []),
  ];
  const retakeEven = [
    ...(priorEvens.flatMap(s => failedBySem[s] || [])),
    ...(student.repeatingYear ? (failedBySem[currentEven] || []) : []),
  ];

  // novi kolegiji u tekućoj godini
  const newOdd = (coursesBySem[currentOdd] || []);
  const newEven = (coursesBySem[currentEven] || []);

  // Aktiviraj uz ograničenja i preduvjete
  fillSemesterActive({
    enrollments: allEnrollments,
    student,
    semester: currentOdd,
    retakeCandidates: retakeOdd,
    newCandidates: newOdd,
    passedSet,
    activeSet,
  });

  fillSemesterActive({
    enrollments: allEnrollments,
    student,
    semester: currentEven,
    retakeCandidates: retakeEven,
    newCandidates: newEven,
    passedSet,
    activeSet,
  });
}

// Upis u bazu
if (allEnrollments.length) {
  await prisma.studentCourse.createMany({ data: allEnrollments });
}

  console.log('Seed završen: dodano 10 studenata, 36 kolegija i generirani upisi (PASSED/FAILED/ACTIVE) uz ograničenja i preduvjete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });