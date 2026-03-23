(function () {
    'use strict';

    var state = {
        pdfBytes: null,
        fileName: ''
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameLabel = document.getElementById('fileNameLabel');
    var btnChangeFile = document.getElementById('btnChangeFile');
    var metaTitle = document.getElementById('metaTitle');
    var metaAuthor = document.getElementById('metaAuthor');
    var metaSubject = document.getElementById('metaSubject');
    var metaKeywords = document.getElementById('metaKeywords');
    var metaCreator = document.getElementById('metaCreator');
    var roProducer = document.getElementById('roProducer');
    var roCreated = document.getElementById('roCreated');
    var roModified = document.getElementById('roModified');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var btnSave = document.getElementById('btnSave');
    var results = document.getElementById('results');
    var downloadLink = document.getElementById('downloadLink');
    var btnAgain = document.getElementById('btnAgain');

    // ── File pick / drop ──────────────────────────────────────────────────────
    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    btnChangeFile.addEventListener('click', startOver);

    function handleFile(file) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showError('Please select a valid PDF file.');
            return;
        }
        hideError();
        var reader = new FileReader();
        reader.onload = function (e) {
            state.pdfBytes = new Uint8Array(e.target.result);
            state.fileName = file.name;
            PDFLib.PDFDocument.load(state.pdfBytes).then(function (doc) {
                // Populate editable fields
                metaTitle.value = safeStr(doc.getTitle());
                metaAuthor.value = safeStr(doc.getAuthor());
                metaSubject.value = safeStr(doc.getSubject());
                metaCreator.value = safeStr(doc.getCreator());

                var kw = doc.getKeywords();
                metaKeywords.value = kw ? (Array.isArray(kw) ? kw.join(', ') : kw) : '';

                // Populate read-only fields
                roProducer.textContent = safeStr(doc.getProducer()) || '—';
                roCreated.textContent = formatDate(doc.getCreationDate());
                roModified.textContent = formatDate(doc.getModificationDate());

                fileNameLabel.textContent = state.fileName;
                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
            }).catch(function (err) {
                showError('Could not read PDF. ' + err.message);
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function safeStr(val) {
        if (val === null || val === undefined) return '';
        return String(val);
    }

    function formatDate(d) {
        if (!d) return '—';
        try {
            return d.toLocaleString();
        } catch (e) {
            return String(d);
        }
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    btnSave.addEventListener('click', function () {
        if (!state.pdfBytes) return;
        btnSave.disabled = true;
        progressWrap.style.display = 'block';
        progressBar.style.width = '30%';
        progressLabel.style.display = 'block';

        PDFLib.PDFDocument.load(state.pdfBytes).then(function (doc) {
            var title = metaTitle.value.trim();
            if (title) doc.setTitle(title); else doc.setTitle('');

            var author = metaAuthor.value.trim();
            if (author) doc.setAuthor(author); else doc.setAuthor('');

            var subject = metaSubject.value.trim();
            if (subject) doc.setSubject(subject); else doc.setSubject('');

            var kwRaw = metaKeywords.value;
            var kwArr = kwRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            doc.setKeywords(kwArr);

            var creator = metaCreator.value.trim();
            if (creator) doc.setCreator(creator); else doc.setCreator('');

            progressBar.style.width = '70%';
            return doc.save();
        }).then(function (saved) {
            var blob = new Blob([saved], { type: 'application/pdf' });
            var url = URL.createObjectURL(blob);
            var outName = state.fileName.replace(/\.pdf$/i, '') + '_metadata.pdf';
            downloadLink.href = url;
            downloadLink.download = outName;
            progressBar.style.width = '100%';
            setTimeout(function () {
                optionsPanel.style.display = 'none';
                progressWrap.style.display = 'none';
                progressLabel.style.display = 'none';
                results.style.display = 'block';
                btnSave.disabled = false;
            }, 300);
        }).catch(function (err) {
            showError('Error saving PDF: ' + err.message);
            btnSave.disabled = false;
            progressWrap.style.display = 'none';
            progressLabel.style.display = 'none';
        });
    });

    btnAgain.addEventListener('click', startOver);

    function startOver() {
        state.pdfBytes = null;
        state.fileName = '';
        fileInput.value = '';
        metaTitle.value = metaAuthor.value = metaSubject.value = metaKeywords.value = metaCreator.value = '';
        roProducer.textContent = roCreated.textContent = roModified.textContent = '—';
        dropZone.style.display = 'block';
        optionsPanel.style.display = 'none';
        results.style.display = 'none';
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
        btnSave.disabled = false;
        hideError();
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
    function hideError() {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }

})();
