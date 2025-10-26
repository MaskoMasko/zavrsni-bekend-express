/* prisma/seed.js */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

/* ----------- Helperi ----------- */
function isStudentEmail(email) {
  return (
    typeof email === "string" && email.toLowerCase().endsWith("@student.edu.hr")
  );
}
function generateJmbag() {
  let s = "";
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}
async function generateUniqueJmbag() {
  while (true) {
    const candidate = generateJmbag();
    const exists = await prisma.student.findUnique({
      where: { jmbag: candidate },
    });
    if (!exists) return candidate;
  }
}
function ensureYear(enrolledYear) {
  const allowed = [1, 2, 3];
  if (!allowed.includes(enrolledYear))
    throw new Error("enrolledYear mora biti 1, 2 ili 3");
  return enrolledYear;
}
function toAsciiLettersLower(s) {
  if (!s) return "";
  const map = {
    č: "c",
    ć: "c",
    ž: "z",
    š: "s",
    đ: "d",
    Č: "c",
    Ć: "c",
    Ž: "z",
    Š: "s",
    Đ: "d",
  };
  const replaced = s
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
  return replaced
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
function generateStudentEmail(firstName, lastName, idx) {
  const fi = toAsciiLettersLower(firstName).charAt(0) || "s";
  const ln = toAsciiLettersLower(lastName) || "student";
  return `${fi}${ln}${idx}@student.edu.hr`;
}
// Staff email generator (simple)
function staffEmailFromName(fullName, domain = "uni.hr") {
  // e.g. "dr.sc. Marko Markić" -> "marko.markic@uni.hr"
  const nameOnly = fullName
    .replace(/dr\.sc\.|doc\.dr\.sc\.|mr\.sc\.|lekt\.|doc\.|prof\.|ing\./gi, "")
    .trim();
  const parts = nameOnly.split(/\s+/).filter(Boolean);
  const ascii = parts.map(toAsciiLettersLower);
  if (ascii.length === 1) return `${ascii[0]}@${domain}`;
  return `${ascii[0]}.${ascii[ascii.length - 1]}@${domain}`;
}
// Deterministic capacity per course: 25..40 based on course name
function capacityForCourse(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return 25 + (sum % 16);
}

/* ----------- Kolegiji ----------- */
const courseData = [
  // Semestar 1 (Godina 1)
  {
    name: "Uvod u programiranje",
    holder: "dr.sc. Marko Markić",
    description: "Osnove programiranja i algoritamskog razmišljanja.",
    ects: 6,
    semester: 1,
    year: 1,
  },
  {
    name: "Matematika 1",
    holder: "dr.sc. Ana Anić",
    description: "Temelji matematičke analize.",
    ects: 6,
    semester: 1,
    year: 1,
  },
  {
    name: "Osnove računarstva",
    holder: "dr.sc. Luka Lukić",
    description: "Uvod u računalne sustave i arhitekturu.",
    ects: 5,
    semester: 1,
    year: 1,
  },
  {
    name: "Engleski jezik 1",
    holder: "lekt. Petra Petrić",
    description: "Akademski engleski za IT.",
    ects: 4,
    semester: 1,
    year: 1,
  },
  {
    name: "Diskretna matematika",
    holder: "dr.sc. Ivan Ivić",
    description: "Skupovi, relacije, grafovi.",
    ects: 5,
    semester: 1,
    year: 1,
  },
  {
    name: "Vještine učenja i istraživanja",
    holder: "doc.dr.sc. Ema Emić",
    description: "Učenje, istraživanje i pisanje.",
    ects: 4,
    semester: 1,
    year: 1,
  },
  // Semestar 2 (Godina 1)
  {
    name: "Operacijski sustavi",
    holder: "dr.sc. Luka Lukić",
    description: "Koncepti OS-a i implementacije.",
    ects: 6,
    semester: 2,
    year: 1,
  },
  {
    name: "Upravljanje bazama podataka",
    holder: "dr.sc. Petra Petrić",
    description: "Modeliranje, normalizacija, administracija.",
    ects: 5,
    semester: 2,
    year: 1,
  },
  {
    name: "Algoritmi i strukture podataka",
    holder: "doc.dr.sc. Filip Filić",
    description: "Analiza i dizajn algoritama.",
    ects: 6,
    semester: 2,
    year: 1,
  },
  {
    name: "Računalne arhitekture",
    holder: "dr.sc. Luka Lukić",
    description: "Napredne arhitekture i performanse.",
    ects: 5,
    semester: 2,
    year: 1,
  },
  {
    name: "Softversko inženjerstvo",
    holder: "dr.sc. Marko Markić",
    description: "Procesi razvoja i kvaliteta softvera.",
    ects: 6,
    semester: 2,
    year: 1,
  },
  {
    name: "Sustavi i mreže",
    holder: "dr.sc. Sara Sarić",
    description: "Operativni sustavi i mrežni koncepti.",
    ects: 5,
    semester: 2,
    year: 1,
  },
  // Semestar 3 (Godina 2)
  {
    name: "Programiranje 2",
    holder: "dr.sc. Marko Markić",
    description: "Strukture podataka, OOP osnove.",
    ects: 6,
    semester: 3,
    year: 2,
    prerequisiteName: "Uvod u programiranje",
  },
  {
    name: "Matematika 2",
    holder: "dr.sc. Ana Anić",
    description: "Nastavak matematičke analize.",
    ects: 6,
    semester: 3,
    year: 2,
    prerequisiteName: "Matematika 1",
  },
  {
    name: "Objektno orijentirano programiranje",
    holder: "dr.sc. Iva Ivić",
    description: "Napredni OOP obrasci i praksa.",
    ects: 6,
    semester: 3,
    year: 2,
    prerequisiteName: "Programiranje 2",
  },
  {
    name: "Vjerojatnost i statistika",
    holder: "dr.sc. Ivan Ivić",
    description: "Temelji statistike za računarstvo.",
    ects: 6,
    semester: 3,
    year: 2,
  },
  {
    name: "Web tehnologije",
    holder: "doc.dr.sc. Filip Filić",
    description: "Frontend i backend osnove.",
    ects: 5,
    semester: 3,
    year: 2,
  },
  {
    name: "Tehnike komunikacije",
    holder: "mr.sc. Ema Emić",
    description: "Prezentacijske i timske vještine.",
    ects: 4,
    semester: 3,
    year: 2,
  },
  // Semestar 4 (Godina 2)
  {
    name: "Engleski jezik 2",
    holder: "lekt. Petra Petrić",
    description: "Napredni akademski engleski za IT.",
    ects: 4,
    semester: 4,
    year: 2,
    prerequisiteName: "Engleski jezik 1",
  },
  {
    name: "Osnove baza podataka",
    holder: "dr.sc. Mia Mijić",
    description: "Relacijske baze, SQL osnove.",
    ects: 5,
    semester: 4,
    year: 2,
    prerequisiteName: "Osnove računarstva",
  },
  {
    name: "Računalne mreže",
    holder: "dr.sc. Sara Sarić",
    description: "Protokoli, sigurnost i administracija.",
    ects: 6,
    semester: 4,
    year: 2,
  },
  {
    name: "Napredne baze podataka",
    holder: "dr.sc. Mia Mijić",
    description: "Optimizacija, NoSQL, distribuirane baze.",
    ects: 5,
    semester: 4,
    year: 2,
  },
  {
    name: "Strojno učenje",
    holder: "dr.sc. Iva Ivić",
    description: "Temelji ML-a i primjene.",
    ects: 6,
    semester: 4,
    year: 2,
  },
  {
    name: "Praktični projekt 1",
    holder: "doc.dr.sc. Filip Filić",
    description: "Timskih projekt s mentorstvom.",
    ects: 5,
    semester: 4,
    year: 2,
  },
  // Semestar 5 (Godina 3)
  {
    name: "Distribuirani sustavi",
    holder: "dr.sc. Sara Sarić",
    description: "Skalabilnost, konzistencija, komunikacija.",
    ects: 6,
    semester: 5,
    year: 3,
  },
  {
    name: "Sigurnost informacijskih sustava",
    holder: "dr.sc. Luka Lukić",
    description: "Kriptografija, sigurnosne politike.",
    ects: 6,
    semester: 5,
    year: 3,
  },
  {
    name: "Analiza podataka",
    holder: "dr.sc. Iva Ivić",
    description: "Statistička analiza i vizualizacija.",
    ects: 6,
    semester: 5,
    year: 3,
  },
  {
    name: "Mobilne aplikacije",
    holder: "dr.sc. Marko Markić",
    description: "Android/iOS razvoj i UX.",
    ects: 6,
    semester: 5,
    year: 3,
  },
  {
    name: "Cloud računarstvo",
    holder: "dr.sc. Mia Mijić",
    description: "IaaS, PaaS, DevOps alati.",
    ects: 5,
    semester: 5,
    year: 3,
  },
  {
    name: "Poduzetništvo i inovacije",
    holder: "mr.sc. Ema Emić",
    description: "Osnove poduzetništva u IT-u.",
    ects: 4,
    semester: 5,
    year: 3,
  },
  // Semestar 6 (Godina 3)
  {
    name: "Napredne web aplikacije",
    holder: "doc.dr.sc. Filip Filić",
    description: "SPA, SSR i performanse.",
    ects: 6,
    semester: 6,
    year: 3,
  },
  {
    name: "Big Data tehnologije",
    holder: "dr.sc. Sara Sarić",
    description: "Hadoop ekosustav, stream obrada.",
    ects: 6,
    semester: 6,
    year: 3,
  },
  {
    name: "Poslovna inteligencija",
    holder: "dr.sc. Mia Mijić",
    description: "DWH, ETL, BI alati.",
    ects: 6,
    semester: 6,
    year: 3,
  },
  {
    name: "DevOps i CI/CD",
    holder: "dr.sc. Luka Lukić",
    description: "CI/CD prakse i alati.",
    ects: 6,
    semester: 6,
    year: 3,
  },
  {
    name: "Diplomski seminar",
    holder: "dr.sc. Ivan Ivić",
    description: "Priprema diplomskog rada.",
    ects: 4,
    semester: 6,
    year: 3,
  },
  {
    name: "Praktični projekt 2",
    holder: "dr.sc. Marko Markić",
    description: "Završni timski projekt.",
    ects: 6,
    semester: 6,
    year: 3,
  },
];

/* ----------- Seed Main ----------- */
async function main() {
  // Očisti tablice
  await prisma.studentDocument.deleteMany().catch(() => {});
  await prisma.studentCourse.deleteMany();
  await prisma.course.deleteMany();
  await prisma.student.deleteMany();

  /* ---- Seed kolegija ---- */
  const assistants = [
    "asst. Ivana Horvat",
    "asst. Tomislav Kovač",
    "asst. Marija Novak",
    "asst. Petra Jurić",
    "asst. Dario Marin",
    "asst. Lea Grgić",
    "asst. Luka Pavić",
    "asst. Nina Babić",
    "asst. Karlo Klarić",
    "asst. Dora Perić",
  ];

  for (let i = 0; i < courseData.length; i++) {
    const c = courseData[i];
    const assistant = assistants[i % assistants.length];
    await prisma.course.create({
      data: {
        name: c.name,
        holder: c.holder,
        holderEmail: staffEmailFromName(c.holder, "uni.hr"),
        assistant,
        assistantEmail: staffEmailFromName(assistant, "uni.hr"),
        description: c.description,
        ects: c.ects,
        semester: c.semester,
        year: c.year,
        capacity: capacityForCourse(c.name), // per-course capacity
      },
    });
  }

  // Preduvjeti
  for (const c of courseData) {
    if (!c.prerequisiteName) continue;
    const prereq = await prisma.course.findUnique({
      where: { name: c.prerequisiteName },
    });
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
  const courseECTS = new Map(courses.map((c) => [c.id, c.ects]));
  const yearSemesters = { 1: [1, 2], 2: [3, 4], 3: [5, 6] };

  /* ---- Upisi helperi ---- */
  function addEnrollment(
    enrollments,
    { studentId, course, status, assignedYear, assignedSemester }
  ) {
    enrollments.push({
      studentId,
      courseId: course.id,
      status,
      assignedYear,
      assignedSemester,
    });
  }
  function shouldPassInHistory(course, semester) {
    const forcePass = new Set([
      "Programiranje 2",
      "Matematika 2",
      "Engleski jezik 2",
      "Osnove baza podataka",
    ]);
    const likelyFailBySem = {
      1: new Set(["Diskretna matematika"]),
      2: new Set(["Algoritmi i strukture podataka", "Sustavi i mreže"]),
      3: new Set(["Operacijski sustavi"]),
      4: new Set(["Računalne mreže"]),
      5: new Set(["Cloud računarstvo"]),
      6: new Set(["Big Data tehnologije"]),
    };
    if (forcePass.has(course.name)) return true;
    if (likelyFailBySem[semester]?.has(course.name)) return false;
    return true;
  }
  function collectYearHistory(
    student,
    targetYear,
    allEnrollments,
    passedSet,
    failedBySem
  ) {
    const [semA, semB] = yearSemesters[targetYear];
    for (const sem of [semA, semB]) {
      for (const course of coursesBySem[sem] || []) {
        const pass = shouldPassInHistory(course, sem);
        const status = pass ? "PASSED" : "FAILED";
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
  function fillSemesterActive({
    enrollments,
    student,
    semester,
    retakeCandidates,
    newCandidates,
    passedSet,
    activeSet,
  }) {
    const MAX_COUNT = 6;
    const MAX_ECTS = 30;
    let count = 0;
    let ects = 0;
    const canActivate = (course) => {
      if (!course.prerequisiteId) return true;
      return passedSet.has(course.prerequisiteId);
    };
    const tryAdd = (course) => {
      if (count >= MAX_COUNT) return false;
      if (activeSet.has(course.id)) return false;
      if (passedSet.has(course.id)) return false;
      if (!canActivate(course)) return false;
      if (ects + course.ects > MAX_ECTS) return false;
      addEnrollment(enrollments, {
        studentId: student.id,
        course,
        status: "ACTIVE",
        assignedYear: student.enrolledYear,
        assignedSemester: semester,
      });
      activeSet.add(course.id);
      count += 1;
      ects += course.ects;
      return true;
    };
    for (const course of retakeCandidates) tryAdd(course);
    for (const course of newCandidates) tryAdd(course);
  }

  /* ---- Seed 100 studenata ---- */
  const plainPassword = "Lozinka123!";
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const FIRST_NAMES = [
    "Ana",
    "Marko",
    "Iva",
    "Luka",
    "Petra",
    "Ivan",
    "Mia",
    "Filip",
    "Ema",
    "Sara",
    "Josip",
    "Karlo",
    "Nina",
    "Dora",
    "Laura",
    "Tin",
    "Lea",
    "Vito",
    "Matea",
    "Paula",
  ];
  const LAST_NAMES = [
    "Anić",
    "Markić",
    "Ivić",
    "Lukić",
    "Petrić",
    "Mijić",
    "Filić",
    "Emić",
    "Sarić",
    "Pavić",
    "Babić",
    "Perić",
    "Kovač",
    "Horvat",
    "Novak",
    "Klarić",
    "Grgić",
    "Marin",
    "Jurić",
  ];
  const MODULES = ["MMS", "RPP", "BIZ"];

  const students = [];
  for (let i = 0; i < 100; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const enrolledYear = ensureYear(1 + (i % 3)); // 1..3
    const repeatingYear = Math.random() < 0.2; // ~20% ponavljača

    // Modul: slobodna raspodjela bez kapaciteta (po zahtjevu da kapacitet bude po kolegiju, ne po modulima)
    const module = enrolledYear === 3 ? MODULES[i % MODULES.length] : null;

    const email = generateStudentEmail(firstName, lastName, i + 1);
    if (!isStudentEmail(email))
      throw new Error(`Email nije u dopuštenoj domeni: ${email}`);
    const jmbag = await generateUniqueJmbag();

    const created = await prisma.student.create({
      data: {
        jmbag,
        firstName,
        lastName,
        email: email.toLowerCase(),
        passwordHash,
        enrolledYear,
        repeatingYear,
        module,
        // inicijalni statusi
        enrollmentStep: 0,
        enrollmentYearSelected: false,
        enrollmentCoursesSelected: false,
        enrollmentDocumentsSubmitted: false,
        enrollmentCompleted: false,
        totalEcts: 0,
        passedCount: 0,
        failedCount: 0,
        activeCount: 0,
      },
    });
    students.push(created);
  }

  // raspodjela koraka: 90 completed, 5 step2, 4 step1, 1 step0 (garantira barem jednog step0)
  const shuffled = [...students].sort(() => Math.random() - 0.5);
  const completedList = shuffled.slice(0, 90).map((s) => s.id);
  const step2List = shuffled.slice(90, 95).map((s) => s.id);
  const step1List = shuffled.slice(95, 99).map((s) => s.id);
  let step0List = shuffled.slice(99, 100).map((s) => s.id);

  const isCompleted = new Set(completedList);
  const isStep2 = new Set(step2List);
  const isStep1 = new Set(step1List);
  let isStep0 = new Set(step0List);

  // Sigurnosna provjera: ako nemamo step0, odredi jednog
  if (step0List.length === 0) {
    const candidate = students.find(
      (s) => !isCompleted.has(s.id) && !isStep2.has(s.id) && !isStep1.has(s.id)
    );
    if (candidate) {
      step0List = [candidate.id];
      isStep0 = new Set(step0List);
    } else {
      // fallback: prebaci jednog iz step1 u step0
      const sid = step1List.pop();
      isStep1.delete(sid);
      step0List = [sid];
      isStep0 = new Set(step0List);
    }
  }

  const allEnrollments = [];

  for (const student of students) {
    const passedSet = new Set();
    const failedBySem = {};
    const activeSet = new Set();

    // PASSED/FAILED povijest za prethodne godine
    for (let y = 1; y < student.enrolledYear; y++) {
      collectYearHistory(student, y, allEnrollments, passedSet, failedBySem);
    }
    if (student.repeatingYear) {
      collectYearHistory(
        student,
        student.enrolledYear,
        allEnrollments,
        passedSet,
        failedBySem
      );
    }

    // ACTIVE samo za completed ili step2
    if (isCompleted.has(student.id) || isStep2.has(student.id)) {
      const [currentOdd, currentEven] = yearSemesters[student.enrolledYear];
      const priorOdds = [1, 3, 5].filter((s) => s < currentOdd);
      const priorEvens = [2, 4, 6].filter((s) => s < currentEven);

      const retakeOdd = [
        ...priorOdds.flatMap((s) => failedBySem[s] || []),
        ...(student.repeatingYear ? failedBySem[currentOdd] || [] : []),
      ];
      const retakeEven = [
        ...priorEvens.flatMap((s) => failedBySem[s] || []),
        ...(student.repeatingYear ? failedBySem[currentEven] || [] : []),
      ];
      const newOdd = coursesBySem[currentOdd] || [];
      const newEven = coursesBySem[currentEven] || [];

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
  }

  // Upis svih upisa u bazu
  if (allEnrollments.length) {
    await prisma.studentCourse.createMany({ data: allEnrollments });
  }

  // ---- Compute per-student stats from allEnrollments and update students ----
  const statsByStudent = new Map(); // id -> {passedCount, failedCount, activeCount, totalEcts}
  for (const e of allEnrollments) {
    const s = statsByStudent.get(e.studentId) || {
      passedCount: 0,
      failedCount: 0,
      activeCount: 0,
      totalEcts: 0,
    };
    if (e.status === "PASSED") {
      s.passedCount += 1;
      s.totalEcts += courseECTS.get(e.courseId) || 0;
    } else if (e.status === "FAILED") {
      s.failedCount += 1;
    } else if (e.status === "ACTIVE") {
      s.activeCount += 1;
    }
    statsByStudent.set(e.studentId, s);
  }

  // postavi statuse na Student i stats
  for (const student of students) {
    const st = statsByStudent.get(student.id) || {
      passedCount: 0,
      failedCount: 0,
      activeCount: 0,
      totalEcts: 0,
    };

    if (isCompleted.has(student.id)) {
      await prisma.student.update({
        where: { id: student.id },
        data: {
          enrollmentStep: 3,
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: true,
          enrollmentCompleted: true,
          totalEcts: st.totalEcts,
          passedCount: st.passedCount,
          failedCount: st.failedCount,
          activeCount: st.activeCount,
        },
      });
    } else if (isStep2.has(student.id)) {
      await prisma.student.update({
        where: { id: student.id },
        data: {
          enrollmentStep: 2,
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: true,
          enrollmentDocumentsSubmitted: false,
          enrollmentCompleted: false,
          totalEcts: st.totalEcts,
          passedCount: st.passedCount,
          failedCount: st.failedCount,
          activeCount: st.activeCount,
        },
      });
    } else if (isStep1.has(student.id)) {
      await prisma.student.update({
        where: { id: student.id },
        data: {
          enrollmentStep: 1,
          enrollmentYearSelected: true,
          enrollmentCoursesSelected: false,
          enrollmentDocumentsSubmitted: false,
          enrollmentCompleted: false,
          totalEcts: st.totalEcts,
          passedCount: st.passedCount,
          failedCount: st.failedCount,
          activeCount: st.activeCount,
        },
      });
    } else if (isStep0.has(student.id)) {
      // ostaje na koraku 0, ali se stats ažuriraju
      await prisma.student.update({
        where: { id: student.id },
        data: {
          totalEcts: st.totalEcts,
          passedCount: st.passedCount,
          failedCount: st.failedCount,
          activeCount: st.activeCount,
        },
      });
    }
  }

  // LOG ZA TESTIRANJE: jedan completed i jedan step0 + sample course capacities
  const completedStudentId = completedList[0];
  const step0StudentId = step0List[0];
  const completedStudent = students.find((s) => s.id === completedStudentId);
  const step0Student = students.find((s) => s.id === step0StudentId);

  const sampleCaps = (
    await prisma.course.findMany({ take: 5, orderBy: { id: "asc" } })
  ).map((c) => ({ id: c.id, name: c.name, capacity: c.capacity }));
  console.log("Sample course capacities:", sampleCaps);

  console.log(
    "Seed završen: 36 kolegija + 100 studenata (90 completed, 5 step2, 4 step1, 1 step0) + upisi (PASSED/FAILED/ACTIVE)."
  );

  if (completedStudent) {
    console.log("TEST LOGIN (COMPLETED):", {
      id: completedStudent.id,
      email: completedStudent.email,
      password: plainPassword,
      enrolledYear: completedStudent.enrolledYear,
      module: completedStudent.module,
      status: "completed",
      stats: statsByStudent.get(completedStudent.id) || {},
    });
  }
  if (step0Student) {
    console.log("TEST LOGIN (STEP 0 — no steps):", {
      id: step0Student.id,
      email: step0Student.email,
      password: plainPassword,
      enrolledYear: step0Student.enrolledYear,
      module: step0Student.module,
      status: "step0",
      stats: statsByStudent.get(step0Student.id) || {},
    });
  } else {
    console.log(
      "Upozorenje: nije detektiran step0 student (ne bi se smjelo dogoditi)."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
