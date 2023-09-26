const express = require('express')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const Papa = require('papaparse')
const archiver = require('archiver')
const uuid = require('uuid')


function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file, index) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}


const app = express()
const port = 3000

app.use(express.static('public'))

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

app.post(
  '/upload',
  upload.fields([{ name: 'csv' }, { name: 'pdfs' }]),
  (req, res) => {
    // Check if uploaded files are present
    if (!req.files.csv || !req.files.csv[0] || !req.files.pdfs) {
      return res
        .status(400)
        .json({ message: 'Please upload both CSV and PDF files.' })
    }

    const csvFile = req.files.csv[0].buffer.toString('utf-8')
    const pdfFiles = req.files.pdfs

    // Validate file types
    if (req.files.csv[0].mimetype !== 'text/csv') {
      return res
        .status(400)
        .json({ message: 'Please upload a valid CSV file.' })
    }
    for (let pdfFile of req.files.pdfs) {
      if (!pdfFile.mimetype.startsWith('application/pdf')) {
        return res
          .status(400)
          .json({ message: 'Please upload only PDF files.' })
      }
    }

    const orgNames = [];
    Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            results.data.forEach(row => orgNames.push(row.organization));
        }
    });

    const uniqueFolder = uuid.v4()

    // Schedule the deletion of the folder after 1 hour
    setTimeout(() => {
        deleteFolderRecursive(tempDir);
    }, 60000); // 1 hour in milliseconds

    const tempDir = path.join(__dirname, 'uploads', uniqueFolder)
    fs.mkdirSync(tempDir)

    const output = fs.createWriteStream(path.join(tempDir, 'renamed_pdfs.zip'))
    const archive = archiver('zip')
    output.on('close', () => {
      return res.json({
        message: 'All files have been successfully renamed!',
        downloadLink: `/uploads/${uniqueFolder}/renamed_pdfs.zip`
      })
    })

    archive.pipe(output)
    pdfFiles.forEach((pdfFile, idx) => {
        const newName = pdfFile.originalname.replace(`${idx + 1}.pdf`, `${orgNames[idx]}.pdf`);

      const newPath = path.join(tempDir, newName)
      fs.writeFileSync(newPath, pdfFile.buffer)
      archive.append(fs.createReadStream(newPath), { name: newName })
    })

    archive.finalize()
  }
)

app.get('/uploads/:folder/renamed_pdfs.zip', (req, res) => {
  const folder = req.params.folder
  const zipPath = path.join(__dirname, 'uploads', folder, 'renamed_pdfs.zip')

  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=renamed_pdfs.zip'
    )
    const fileStream = fs.createReadStream(zipPath)
    fileStream.pipe(res)
  } else {
    res.status(404).send('File not found')
  }
})

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})
