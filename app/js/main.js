// ─── INIT ────────────────────────────────────────────────────────────────────
const { loadPDF } = App.pdfLoader;
const { clearFile, showError } = App.ui;
const { doSplit } = App.splitter;
const { switchTab } = App.tabs;
const { selectAll, selectNone, invertSelection } = App.thumbnails;

// ─── DRAG & DROP ─────────────────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        showError('Please drop a valid PDF file.');
    }
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadPDF(file);
});

// ─── BUTTONS ─────────────────────────────────────────────────────────────────
document.getElementById('splitBtn').addEventListener('click', doSplit);
document.getElementById('clearBtn').addEventListener('click', clearFile);
document.getElementById('startOverBtn').addEventListener('click', clearFile);

// ─── TABS ─────────────────────────────────────────────────────────────────────
const tabNames = ['range', 'custom', 'all', 'visual'];
document.querySelectorAll('.tab').forEach((tab, i) => {
    tab.addEventListener('click', () => switchTab(tabNames[i]));
});

// ─── VISUAL SELECTION ACTIONS ────────────────────────────────────────────────
document.getElementById('selectAllBtn').addEventListener('click', selectAll);
document.getElementById('selectNoneBtn').addEventListener('click', selectNone);
document.getElementById('invertBtn').addEventListener('click', invertSelection);
