 const fs = require('fs');
    const path = require('path');
    const multer = require('multer');
    const prisma = require('../prisma');
    const { UPLOAD_ROOT, ALLOWED_DOC_TYPES } = require('../config');
    
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const studentId = String(req.params.id || 'unknown');
    const dir = path.join(UPLOAD_ROOT, studentId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const type = String(req.params.type);
    const stamp = Date.now();
    cb(null, `${type}-${stamp}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Dozvoljeni su samo PDF dokumenti'));
    }
    cb(null, true);
  },
});

async function ensureStudentAndType(req, res) {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: 'Neispravan studentId' });
    return null;
  }
  const type = String(req.params.type || '');
  if (!ALLOWED_DOC_TYPES.has(type)) {
    res.status(400).json({ error: 'Nepodržan tip dokumenta' });
    return null;
  }
  const exists = await prisma.student.findUnique({ where: { id: studentId } });
  if (!exists) {
    res.status(404).json({ error: 'Student nije pronađen' });
    return null;
  }
  return { studentId, type };
}

module.exports = { upload, ensureStudentAndType };