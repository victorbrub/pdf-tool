/**
 * remove-password.js
 *
 * Loads an encrypted PDF with the user-supplied password via pdf-lib,
 * then re-saves it without encryption.
 *
 * Supports standard RC4-40, RC4-128, and AES-128 encrypted PDFs.
 * AES-256 (PDF 2.0) may not be supported by pdf-lib and will show a clear error.
 */

(function () {
    'use strict';

    /* ── State ── */
    var state = {
        pdfBytes: null,
        fileName: ''
    };

    /* ── DOM ── */
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameEl = document.getElementById('fileName');
    var passInput = document.getElementById('passInput');
    var togglePass = document.getElementById('togglePass');
    var removeBtn = document.getElementById('removeBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultsEl = document.getElementById('results');
    var resultFiles = document.getElementById('resultFiles');
    var removeAgain = document.getElementById('removeAgainBtn');

    /* ── Helpers ── */
    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
    function clearError() {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }
    function setProgress(pct, label) {
        progressBar.style.width = pct + '%';
        progressLabel.textContent = label || '';
        progressWrap.style.display = pct >= 0 ? 'block' : 'none';
    }
    function resetButtons() {
        removeBtn.disabled = false;
        startOverBtn.disabled = false;
        progressWrap.style.display = 'none';
        progressBar.style.width = '0%';
        progressLabel.textContent = '';
    }

    /* ── Show/hide password ── */
    togglePass.addEventListener('click', function () {
        passInput.type = passInput.type === 'password' ? 'text' : 'password';
    });

    /* ── File handling ── */
    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        var f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') { fileInput.value = ''; handleFile(f); }
        else showError('Please drop a PDF file.');
    });

    function handleFile(file) {
        clearError();
        if (!file || file.type !== 'application/pdf') { showError('Only PDF files are supported.'); return; }
        state.fileName = file.name.replace(/\.pdf$/i, '');
        var reader = new FileReader();
        reader.onload = function (e) {
            state.pdfBytes = new Uint8Array(e.target.result);
            fileNameEl.textContent = state.fileName + '.pdf';
            dropZone.style.display = 'none';
            optionsPanel.style.display = 'block';
            resultsEl.style.display = 'none';
            passInput.value = '';
            passInput.focus();
        };
        reader.readAsArrayBuffer(file);
    }

    /* ── Remove password ── */
    removeBtn.addEventListener('click', function () {
        clearError();
        var password = passInput.value;
        /* Allow empty string — some PDFs have an empty owner password */

        removeBtn.disabled = true;
        startOverBtn.disabled = true;
        setProgress(20, 'Loading encrypted PDF…');

        PDFLib.PDFDocument.load(state.pdfBytes, { password: password })
            .then(function (doc) {
                setProgress(70, 'Removing encryption…');
                return doc.save();
            })
            .then(function (saved) {
                setProgress(100, '');
                showResults(saved);
            })
            .catch(function (err) {
                var msg = err.message || String(err);
                if (/password|encrypt|decrypt|incorrect/i.test(msg)) {
                    showError('Incorrect password, or this PDF uses a newer encryption standard (AES-256) not yet supported by this tool.');
                } else {
                    showError('Could not process PDF: ' + msg);
                }
                resetButtons();
            });
    });

    /* Allow pressing Enter in the password field */
    passInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') removeBtn.click();
    });

    /* ── Results ── */
    function showResults(bytes) {
        resetButtons();
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '_unlocked.pdf';
        a.className = 'btn-primary';
        a.style.cssText = 'display:inline-flex;align-items:center;gap:0.4rem;text-decoration:none;';
        a.textContent = '⬇️ Download unlocked PDF';
        resultFiles.innerHTML = '';
        resultFiles.appendChild(a);
        optionsPanel.style.display = 'none';
        resultsEl.style.display = 'block';
    }

    /* ── Start over ── */
    function startOver() {
        state.pdfBytes = null;
        state.fileName = '';
        fileInput.value = '';
        passInput.value = '';
        passInput.type = 'password';
        clearError();
        resetButtons();
        resultsEl.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
    }
    startOverBtn.addEventListener('click', startOver);
    removeAgain.addEventListener('click', startOver);

})();
