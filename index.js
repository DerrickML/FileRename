const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const archiver = require('archiver');
const uuid = require('uuid'); // to generate unique folders

const app = express();
const port = 3000;

app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function scheduleDeletion(dirPath, delay) {
    setTimeout(() => {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    }, delay);
}

app.post('/upload', upload.fields([{ name: 'csv' }, { name: 'pdfs', maxCount: 64 }]), (req, res) => {
    const csvFile = req.files.csv[0].buffer.toString('utf-8');
    const pdfFiles = req.files.pdfs;
    
    const orgNames = [];
    Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            results.data.forEach(row => orgNames.push('-' + row.organization));
        }
    });

    const uniqueFolder = uuid.v4();
    const tempDir = path.join(__dirname, 'uploads', uniqueFolder);
    fs.mkdirSync(tempDir);

    const output = fs.createWriteStream(path.join(tempDir, 'renamed_pdfs.zip'));
    const archive = archiver('zip');
    output.on('close', () => {
        return res.json({
            message: "All files have been successfully renamed!",
            downloadLink: `/uploads/${uniqueFolder}/renamed_pdfs.zip`
        });
        scheduleDeletion(tempDir, 60 * 1000);
    });

    archive.pipe(output);
    pdfFiles.forEach((pdfFile, idx) => {
        const newName = pdfFile.originalname.replace(` ${idx + 1}.pdf`, ` ${orgNames[idx]}.pdf`);
        const newPath = path.join(tempDir, newName);
        fs.writeFileSync(newPath, pdfFile.buffer);
        archive.append(fs.createReadStream(newPath), { name: newName });
    });

    archive.finalize();
});

app.get('/uploads/:folder/renamed_pdfs.zip', (req, res, next) => {
    const folder = req.params.folder;
    const zipPath = path.join(__dirname, 'uploads', folder, 'renamed_pdfs.zip');
    
    if (fs.existsSync(zipPath)) {
        scheduleDeletion(path.join(__dirname, 'uploads', folder), 60 * 1000);
    } 
    next();
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
