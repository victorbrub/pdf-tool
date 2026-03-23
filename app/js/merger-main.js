async function loadPdfFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());

    // use pdfjs for page count + first-page thumbnail
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    return { name: file.name, pageCount, pdfBytes: bytes, thumbnail: canvas };
}

async function addFiles(fileList) {
    hideMergerError();
    for (const file of Array.from(fileList)) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            const name = file.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            showMergerError('"' + file.name + '" is not a PDF file.');
            continue;
        }
        try {
            const entry = await loadPdfFile(file);
            mergerState.add(entry);
            renderFileList(); // update after each file so the user sees progress
        } catch (e) {
            showMergerError('Could not read "' + file.name + '". It may be password-protected or corrupted.');
        }
    }
}

async function mergePdfs() {
    const mergeBtn = document.getElementById('mergeBtn');
    const lang = localStorage.getItem('lang') || 'en';
    const t = translations[lang] || translations['en'];

    mergeBtn.disabled = true;
    const originalText = mergeBtn.textContent;
    mergeBtn.textContent = '⏳ ' + (t['merger.merging'] || 'Merging…');
    hideMergerError();

    try {
        const { PDFDocument } = PDFLib;
        const merged = await PDFDocument.create();

        for (const file of mergerState.files) {
            const srcDoc = await PDFDocument.load(file.pdfBytes);
            const indices = srcDoc.getPageIndices();
            const copied = await merged.copyPages(srcDoc, indices);
            copied.forEach(p => merged.addPage(p));
        }

        const mergedBytes = await merged.save();
        const blob = new Blob([mergedBytes], { type: 'application/pdf' });
        showMergerResults('merged.pdf', blob);
    } catch (e) {
        showMergerError((t['merger.merge_failed'] || 'Merge failed: ') + e.message);
        mergeBtn.disabled = mergerState.files.length < 2;
        mergeBtn.textContent = originalText;
    }
}

function resetMerger() {
    mergerState.clear();
    document.getElementById('mergerResults').classList.remove('visible');
    hideMergerError();
    renderFileList();
}

function init() {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

    const dropZone = document.getElementById('mergerDropZone');
    const fileInput = document.getElementById('fileInput');
    const addMoreInput = document.getElementById('addMoreInput');

    fileInput.addEventListener('change', e => {
        if (e.target.files.length) addFiles(e.target.files);
        e.target.value = '';
    });

    addMoreInput.addEventListener('change', e => {
        if (e.target.files.length) addFiles(e.target.files);
        e.target.value = '';
    });

    // drag-and-drop onto the initial drop zone
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    document.getElementById('mergeBtn').addEventListener('click', mergePdfs);
    document.getElementById('startOverBtn').addEventListener('click', resetMerger);
    document.getElementById('mergeAgainBtn').addEventListener('click', resetMerger);
}

document.addEventListener('DOMContentLoaded', init);
