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
  const byName = Object.fromEntries(courses.map(c => [c.name, c]));
  const bySemester = (sem) => courses.filter(c => c.semester === sem);
  const byYear = (y) => courses.filter(c => c.year === y);

  // Mapiranje: semestri po akademskoj godini
  const yearSemesters = {
    1: [1, 2],
    2: [3, 4],
    3: [5, 6],
  };

  function semesterShift(prevSem) {
    // kad student napreduje u slijedeću godinu, retake ide u semestar +2
    return prevSem + 2;
  }

  function addEnrollment(enrollments, student, course, status, assignedSemester) {
    enrollments.push({
      studentId: student.id,
      courseId: course.id,
      status,
      assignedYear: student.enrolledYear,
      assignedSemester,
    });
  }

  function fillSemesterActive(enrollments, student, semester, retakeCandidates, newCandidates, passedSet) {
    let count = 0;
    let ects = 0;
    const MAX_COUNT = 6;
    const MAX_ECTS = 30;

    const canActivate = (course) => {
      if (!course.prerequisiteId) return true;
      return passedSet.has(course.prerequisiteId);
    };

    // Prvo retakeovi
    for (const course of retakeCandidates) {
      if (count >= MAX_COUNT) break;
      if (!canActivate(course)) continue;
      if (ects + course.ects > MAX_ECTS) continue;
      addEnrollment(enrollments, student, course, 'ACTIVE', semester);
      count += 1;
      ects += course.ects;
    }

    // Zatim novi kolegiji
    for (const course of newCandidates) {
      if (count >= MAX_COUNT) break;
      if (!canActivate(course)) continue;
      if (ects + course.ects > MAX_ECTS) continue;
      addEnrollment(enrollments, student, course, 'ACTIVE', semester);
      count += 1;
      ects += course.ects;
    }
  }

  // Odredi PASSED/FAILED za prethodnu godinu (ili isti razred ako ponavljač),
  // zatim planiraj ACTIVE uz ograničenja i preduvjete.
  const allEnrollments = [];

  for (const student of students) {
    const [semA, semB] = yearSemesters[student.enrolledYear];

    const passedSet = new Set(); // courseId koji su PASSED (za provjeru preduvjeta)
    const failedPrevYearBySem = { }; // { sem: Course[] }

    // Ako student nije na 1. godini, definiraj ishod prethodne godine (godina-1)
    if (student.enrolledYear > 1 && !student.repeatingYear) {
      const prevYear = student.enrolledYear - 1;
      const [prevSemA, prevSemB] = yearSemesters[prevYear];

      const prevA = bySemester(prevSemA);
      const prevB = bySemester(prevSemB);

      // Semestar A prethodne godine:
      // Položi ključne preduvjete; ponešto ostavi FAIL radi retake-a
      const mustPassNamesA = ['Uvod u programiranje', 'Matematika 1', 'Osnove računarstva', 'Engleski jezik 1'];
      for (const course of prevA) {
        const pass = mustPassNamesA.includes(course.name) || course.name.includes('Diskretna') || course.name.includes('Vještine učenja');
        const status = pass ? 'PASSED' : 'FAILED';
        addEnrollment(allEnrollments, student, course, status, prevSemA);
        if (status === 'PASSED') passedSet.add(course.id);
        else {
          failedPrevYearBySem[prevSemA] = failedPrevYearBySem[prevSemA] || [];
          failedPrevYearBySem[prevSemA].push(course);
        }
      }

      // Semestar B prethodne godine:
      // Ako student nije ponavljač, većina položi, ali ostavi 1-2 FAIL
      for (const course of prevB) {
        let status = 'PASSED';
        // neka Algoritmi i Sustavi budu češće FAIL
        if (course.name === 'Algoritmi i strukture podataka' || course.name === 'Sustavi i mreže') status = 'FAILED';
        // obavezno položi preduvjete za kasnije (Programiranje 2, Engleski 2, Matematika 2, Osnove baza)
        if (course.name === 'Programiranje 2' || course.name === 'Engleski jezik 2' || course.name === 'Matematika 2' || course.name === 'Osnove baza podataka') {
          status = 'PASSED';
        }
        addEnrollment(allEnrollments, student, course, status, prevSemB);
        if (status === 'PASSED') passedSet.add(course.id);
        else {
          failedPrevYearBySem[prevSemB] = failedPrevYearBySem[prevSemB] || [];
          failedPrevYearBySem[prevSemB].push(course);
        }
      }

      // Planiraj ACTIVE u tekućoj godini:
      // Semestar A: retake iz prevSemA (shift +2) + svi novi semestar A tekuće godine (uz preduvjete)
      const retakeA = (failedPrevYearBySem[prevSemA] || []).map(c => ({ ...c, semester: semesterShift(prevSemA) }));
      const newA = bySemester(semA);
      fillSemesterActive(allEnrollments, student, semA, retakeA, newA, passedSet);

      // Semestar B: retake iz prevSemB (shift +2) + svi novi semestar B tekuće godine (uz preduvjete)
      const retakeB = (failedPrevYearBySem[prevSemB] || []).map(c => ({ ...c, semester: semesterShift(prevSemB) }));
      const newB = bySemester(semB);
      fillSemesterActive(allEnrollments, student, semB, retakeB, newB, passedSet);
    } else if (student.repeatingYear) {
      // Ponavlja istu godinu: postavi neke FAIL iz iste godine pa ih upiši kao ACTIVE (retake) + nove
      const [repSemA, repSemB] = yearSemesters[student.enrolledYear];
      const repA = bySemester(repSemA);
      const repB = bySemester(repSemB);

      // U istom razredu prošle godine (attempt), neka ključni preduvjeti uglavnom PASSED,
      // ali ostavi FAIL na nekoliko kolegija da ima retake.
      const mustPassNamesA = ['Uvod u programiranje', 'Matematika 1', 'Osnove računarstva', 'Engleski jezik 1'];
      for (const course of repA) {
        const pass = mustPassNamesA.includes(course.name);
        const status = pass ? 'PASSED' : 'FAILED';
        // upiši kao uspjeh/neuspjeh prethodnog pokušaja (assignedSemester = sem tog kolegija)
        addEnrollment(allEnrollments, student, course, status, repSemA);
        if (status === 'PASSED') passedSet.add(course.id);
        else {
          failedPrevYearBySem[repSemA] = failedPrevYearBySem[repSemA] || [];
          failedPrevYearBySem[repSemA].push(course);
        }
      }

      for (const course of repB) {
        // Ako je preduvjet, pokušaj ga staviti PASSED; ostale neka budu FAIL povremeno
        let status = 'PASSED';
        if (student.enrolledYear === 1) {
          // u 1. godini, nekad padne Algoritmi ili Sustavi
          if (course.name === 'Algoritmi i strukture podataka' || course.name === 'Sustavi i mreže') status = 'FAILED';
        }
        // Preduvjete (Programiranje 2, Engleski 2, Matematika 2, Osnove baza) nastoj PASSED
        if (course.name === 'Programiranje 2' || course.name === 'Engleski jezik 2' || course.name === 'Matematika 2' || course.name === 'Osnove baza podataka') {
          status = 'PASSED';
        }
        addEnrollment(allEnrollments, student, course, status, repSemB);
        if (status === 'PASSED') passedSet.add(course.id);
        else {
          failedPrevYearBySem[repSemB] = failedPrevYearBySem[repSemB] || [];
          failedPrevYearBySem[repSemB].push(course);
        }
      }

      // ACTIVE za istu godinu (ponavljanje): retake iz FAIL + novi kolegiji tekućeg semestra
      const retakeA = failedPrevYearBySem[repSemA] || [];
      const newA = bySemester(repSemA);
      fillSemesterActive(allEnrollments, student, repSemA, retakeA, newA, passedSet);

      const retakeB = failedPrevYearBySem[repSemB] || [];
      const newB = bySemester(repSemB);
      fillSemesterActive(allEnrollments, student, repSemB, retakeB, newB, passedSet);
    } else {
      // 1. godina, nije ponavljač: upiši ACTIVE u semestar 1 (bez preduvjeta), semestar 2 preskoči jer preduvjeti su iz sem1
      const newA = bySemester(semA);
      fillSemesterActive(allEnrollments, student, semA, [], newA, passedSet);
      // opcionalno: nakon što položi sem1, može u sem2 — ovdje to ne radimo radi jednostavnosti
    }
  }

  // Zapisi sve upise u bazu
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