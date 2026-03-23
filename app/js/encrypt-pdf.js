/**
 * encrypt-pdf.js
 *
 * Renders every page via pdfjs → builds a new password-protected PDF via jsPDF.
 * jsPDF supports AES encryption via the `encryption` constructor option.
 *
 * Trade-off: the output is image-based (text is not selectable).
 * This is clearly noted in the HTML.
 */

(function () {
    'use strict';

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

    /* ── State ── */
    var state = {
        pdfDoc: null,
        fileName: '',
        pageCount: 0
    };

    /* ── DOM refs ── */
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var userPassEl = document.getElementById('userPassInput');
    var ownerPassEl = document.getElementById('ownerPassInput');
    var toggleUser = document.getElementById('toggleUserPass');
    var toggleOwner = document.getElementById('toggleOwnerPass');
    var permPrint = document.getElementById('permPrint');
    var permCopy = document.getElementById('permCopy');
    var encryptBtn = document.getElementById('encryptBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultsEl = document.getElementById('results');
    var resultFiles = document.getElementById('resultFiles');
    var encryptAgain = document.getElementById('encryptAgainBtn');

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

    /* ── Show/hide password toggles ── */
    toggleUser.addEventListener('click', function () {
        userPassEl.type = userPassEl.type === 'password' ? 'text' : 'password';
    });
    toggleOwner.addEventListener('click', function () {
        ownerPassEl.type = ownerPassEl.type === 'password' ? 'text' : 'password';
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
        var file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            fileInput.value = '';
            handleFile(file);
        } else {
            showError('Please drop a PDF file.');
        }
    });

    function handleFile(file) {
        clearError();
        if (!file || file.type !== 'application/pdf') {
            showError('Only PDF files are supported.');
            return;
        }
        state.fileName = file.name.replace(/\.pdf$/i, '');
        var reader = new FileReader();
        reader.onload = function (e) {
            loadPdf(new Uint8Array(e.target.result));
        };
        reader.readAsArrayBuffer(file);
    }

    function loadPdf(bytes) {
        pdfjsLib.getDocument({ data: bytes }).promise
            .then(function (doc) {
                state.pdfDoc = doc;
                state.pageCount = doc.numPages;
                fileNameEl.textContent = state.fileName + '.pdf';
                pageCountEl.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
                resultsEl.style.display = 'none';
            })
            .catch(function (err) {
                showError('Could not read PDF: ' + err.message);
            });
    }

    /* ── Encrypt ── */
    encryptBtn.addEventListener('click', function () {
        clearError();
        var userPass = userPassEl.value.trim();
        var ownerPass = ownerPassEl.value.trim() || userPass;

        if (!userPass) {
            showError('Please enter a password to open the PDF.');
            userPassEl.focus();
            return;
        }

        encryptBtn.disabled = true;
        startOverBtn.disabled = true;
        setProgress(5, 'Starting…');

        runEncrypt(userPass, ownerPass);
    });

    function buildPermissions(userPass) {
        /* jsPDF userPermissions accepts any combination of:
           'print', 'modify', 'copy', 'annot-forms'          */
        var perms = [];
        if (permPrint.checked) perms.push('print');
        if (permCopy.checked) perms.push('copy');
        return perms;
    }

    function runEncrypt(userPass, ownerPass) {
        var n = state.pageCount;
        var doc = null;        // jsPDF instance, created after first page info
        var RENDER_SCALE = 1.5; // canvas render quality
        var PT_SCALE = 1;   // native point dimensions

        function processPage(pageNum) {
            if (pageNum > n) {
                /* All pages added — save as blob and trigger download */
                setProgress(95, 'Saving encrypted PDF…');
                var blob = doc.output('blob');
                setProgress(100, '');
                showResults(blob);
                return;
            }

            var pct = Math.round(5 + ((pageNum - 1) / n) * 85);
            setProgress(pct, 'Encrypting page ' + pageNum + ' / ' + n + '…');

            state.pdfDoc.getPage(pageNum)
                .then(function (page) {
                    /* Point-based viewport (1 unit = 1 pt) */
                    var ptVp = page.getViewport({ scale: PT_SCALE });
                    var ptW = ptVp.width;
                    var ptH = ptVp.height;

                    /* High-quality canvas for rendering */
                    var renderVp = page.getViewport({ scale: RENDER_SCALE });
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(renderVp.width);
                    canvas.height = Math.round(renderVp.height);
                    var ctx = canvas.getContext('2d');

                    return page.render({ canvasContext: ctx, viewport: renderVp }).promise
                        .then(function () {
                            var imgData = canvas.toDataURL('image/jpeg', 0.9);
                            canvas.width = 0;
                            canvas.height = 0;

                            var isLandscape = ptW > ptH;

                            if (pageNum === 1) {
                                /* Create jsPDF on first page so we know the format */
                                var jsPDF = window.jspdf.jsPDF;
                                doc = new jsPDF({
                                    unit: 'pt',
                                    format: [ptW, ptH],
                                    orientation: isLandscape ? 'landscape' : 'portrait',
                                    encryption: {
                                        userPassword: userPass,
                                        ownerPassword: ownerPass,
                                        userPermissions: buildPermissions()
                                    }
                                });
                            } else {
                                doc.addPage([ptW, ptH], isLandscape ? 'landscape' : 'portrait');
                            }

                            doc.addImage(imgData, 'JPEG', 0, 0, ptW, ptH);
                            processPage(pageNum + 1);
                        });
                })
                .catch(function (err) {
                    showError('Page render error: ' + err.message);
                    resetButtons();
                });
        }

        processPage(1);
    }

    /* ── Show results ── */
    function showResults(blob) {
        resetButtons();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '_encrypted.pdf';
        a.className = 'btn-primary';
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '0.4rem';
        a.style.textDecoration = 'none';
        a.textContent = '⬇️ Download encrypted PDF';

        resultFiles.innerHTML = '';
        resultFiles.appendChild(a);

        optionsPanel.style.display = 'none';
        resultsEl.style.display = 'block';
        progressWrap.style.display = 'none';
    }

    /* ── Start over ── */
    function resetButtons() {
        encryptBtn.disabled = false;
        startOverBtn.disabled = false;
        progressWrap.style.display = 'none';
        progressBar.style.width = '0%';
        progressLabel.textContent = '';
    }

    startOverBtn.addEventListener('click', startOver);
    encryptAgain.addEventListener('click', startOver);

    function startOver() {
        state.pdfDoc = null;
        state.fileName = '';
        state.pageCount = 0;
        fileInput.value = '';
        userPassEl.value = '';
        ownerPassEl.value = '';
        userPassEl.type = 'password';
        ownerPassEl.type = 'password';
        permPrint.checked = true;
        permCopy.checked = false;
        clearError();
        resetButtons();
        resultsEl.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
    }

})();
