const express = require('express');
const { upload, ensureStudentAndType } = require('../middlware/upload');
const PDFDocument = require('pdfkit');
const prisma = require('../prisma');
const { ALLOWED_DOC_TYPES } = require('../config');

const router = express.Router();

// GET /documents/templates/:type
router.get('/documents/templates/:type', async (req, res) => {
  const type = String(req.params.type || '');
  if (!ALLOWED_DOC_TYPES.has(type)) {
    return res.status(400).json({ error: 'Nepodržan tip dokumenta' });
  }
  try {
    const filename =
      type === 'uplatnica' ? 'uplatnica.pdf' :
      type === 'upisniObrazac' ? 'upisni_obrazac.pdf' :
      'potvrda_uplatnice.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);
    doc.fontSize(20).text(`Mock PDF: ${filename}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Ovaj PDF je generiran kao zamjena za stvarni dokument.`, { align: 'center' });
    doc.moveDown();
    const now = new Date().toLocaleString('hr-HR');
    doc.text(`Generirano: ${now}`, { align: 'center' });
    doc.end();
  } catch (err) {
    console.error('Greška pri generiranju PDF-a:', err);
    res.status(500).json({ error: 'Greška pri generiranju PDF-a' });
  }
});

// POST /students/:id/documents/:type
router.post('/students/:id/documents/:type', async (req, res, next) => {
  try {
    const ctx = await ensureStudentAndType(req, res);
    if (!ctx) return;

    upload.single('file')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        const msg = err?.message || 'Greška pri uploadu';
        return res.status(400).json({ error: msg });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Nedostaje datoteka (file)' });
      }

      const { studentId, type } = ctx;
      const { filename, path: filePath, mimetype, size } = req.file;

      const record = await prisma.studentDocument.create({
        data: {
          studentId,
          type,
          filename,
          path: filePath,
          mime: mimetype,
          size,
          accepted: false,
        },
      });

      res.status(201).json({
        message: 'Dokument uspješno uploadan',
        document: {
          id: record.id,
          type: record.type,
          filename: record.filename,
          size: record.size,
          mime: record.mime,
          accepted: record.accepted,
          uploadedAt: record.uploadedAt,
          url: `/uploads/${studentId}/${filename}`,
        },
      });
    });
  } catch (err) {
    next(err);
  }
});

// GET /students/:id/documents
router.get('/students/:id/documents', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.status(400).json({ error: 'Neispravan studentId' });
  }
  try {
    const exists = await prisma.student.findUnique({ where: { id: studentId } });
    if (!exists) return res.status(404).json({ error: 'Student nije pronađen' });

    const docs = await prisma.studentDocument.findMany({
      where: { studentId },
      orderBy: [{ uploadedAt: 'desc' }],
    });

    res.json({
      studentId,
      documents: docs.map(d => ({
        id: d.id, type: d.type, filename: d.filename, size: d.size,
        mime: d.mime, accepted: d.accepted, uploadedAt: d.uploadedAt,
        url: `/uploads/${studentId}/${d.filename}`,
      })),
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju dokumenata:', err);
    res.status(500).json({ error: 'Interna greška servera' });
  }
});

module.exports = router;