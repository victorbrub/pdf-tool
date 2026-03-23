(function () {
    'use strict';

    var state = {
        pdfBytes: null,
        fileName: '',
        pageCount: 0,
        fields: []   // [{name, type, options, el}]
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameLabel = document.getElementById('fileNameLabel');
    var filePagesLabel = document.getElementById('filePagesLabel');
    var btnChangeFile = document.getElementById('btnChangeFile');
    var noFormNotice = document.getElementById('noFormNotice');
    var fieldCountBadge = document.getElementById('fieldCountBadge');
    var fieldCountText = document.getElementById('fieldCountText');
    var formFieldsList = document.getElementById('formFieldsList');
    var flattenSection = document.getElementById('flattenSection');
    var flattenCheck = document.getElementById('flattenCheck');
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
            state.fields = [];

            PDFLib.PDFDocument.load(state.pdfBytes, { ignoreEncryption: true }).then(function (doc) {
                state.pageCount = doc.getPageCount();

                var form = doc.getForm();
                var fields = form.getFields();

                fileNameLabel.textContent = state.fileName;
                filePagesLabel.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');

                buildFieldUI(fields);

                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
            }).catch(function (err) {
                showError('Could not read PDF. ' + err.message);
            });
        };
        reader.readAsArrayBuffer(file);
    }

    // ── Build field UI ────────────────────────────────────────────────────────
    function buildFieldUI(fields) {
        formFieldsList.innerHTML = '';
        state.fields = [];

        if (!fields || fields.length === 0) {
            noFormNotice.style.display = 'flex';
            fieldCountBadge.style.display = 'none';
            flattenSection.style.display = 'none';
            btnSave.disabled = true;
            return;
        }

        noFormNotice.style.display = 'none';
        fieldCountBadge.style.display = 'flex';
        flattenSection.style.display = 'block';
        btnSave.disabled = false;
        fieldCountText.textContent = fields.length + ' field' + (fields.length !== 1 ? 's' : '') + ' found';

        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            var name = field.getName();
            var typeName = detectType(field);
            var item = createFieldItem(field, name, typeName);
            formFieldsList.appendChild(item.el);
            state.fields.push({ name: name, type: typeName, input: item.input });
        }
    }

    function detectType(field) {
        if (field instanceof PDFLib.PDFTextField) return 'TextField';
        if (field instanceof PDFLib.PDFCheckBox) return 'CheckBox';
        if (field instanceof PDFLib.PDFRadioGroup) return 'RadioGroup';
        if (field instanceof PDFLib.PDFDropdown) return 'Dropdown';
        if (field instanceof PDFLib.PDFOptionList) return 'OptionList';
        return 'Unknown';
    }

    function createFieldItem(field, name, typeName) {
        var wrapper = document.createElement('div');
        wrapper.className = 'form-field-item';

        var header = document.createElement('div');
        header.className = 'form-field-header';

        var nameEl = document.createElement('span');
        nameEl.className = 'form-field-name';
        nameEl.textContent = name;
        nameEl.title = name;

        var typeEl = document.createElement('span');
        typeEl.className = 'form-field-type';
        typeEl.textContent = typeName;

        header.appendChild(nameEl);
        header.appendChild(typeEl);
        wrapper.appendChild(header);

        var inputEl = null;

        if (typeName === 'TextField') {
            var isMultiline = false;
            try { isMultiline = field.isMultiline(); } catch (e) { }
            if (isMultiline) {
                inputEl = document.createElement('textarea');
                inputEl.className = 'field-text-input';
                inputEl.rows = 3;
            } else {
                inputEl = document.createElement('input');
                inputEl.type = 'text';
                inputEl.className = 'field-text-input';
            }
            try { inputEl.value = field.getText() || ''; } catch (e) { inputEl.value = ''; }
            wrapper.appendChild(inputEl);

        } else if (typeName === 'CheckBox') {
            var label = document.createElement('label');
            label.className = 'field-checkbox-wrap';
            inputEl = document.createElement('input');
            inputEl.type = 'checkbox';
            try { inputEl.checked = field.isChecked(); } catch (e) { }
            var labelText = document.createTextNode('Checked');
            label.appendChild(inputEl);
            label.appendChild(labelText);
            wrapper.appendChild(label);

        } else if (typeName === 'RadioGroup') {
            var groupDiv = document.createElement('div');
            groupDiv.className = 'field-radio-group';
            var options = [];
            try { options = field.getOptions(); } catch (e) { }
            var selectedOpt = null;
            try { selectedOpt = field.getSelected(); } catch (e) { }
            var radioInputs = [];
            for (var j = 0; j < options.length; j++) {
                var opt = options[j];
                var rLabel = document.createElement('label');
                rLabel.className = 'field-radio-item';
                var rInput = document.createElement('input');
                rInput.type = 'radio';
                rInput.name = 'radio_' + name.replace(/\W/g, '_') + '_' + Date.now();
                rInput.value = opt;
                if (selectedOpt === opt) rInput.checked = true;
                radioInputs.push(rInput);
                rLabel.appendChild(rInput);
                rLabel.appendChild(document.createTextNode(opt));
                groupDiv.appendChild(rLabel);
            }
            inputEl = { type: 'RadioGroup', inputs: radioInputs };
            wrapper.appendChild(groupDiv);

        } else if (typeName === 'Dropdown' || typeName === 'OptionList') {
            var sel = document.createElement('select');
            sel.className = 'field-select';
            if (typeName === 'OptionList') sel.multiple = true;
            var opts = [];
            try { opts = field.getOptions(); } catch (e) { }
            var selectedVal = [];
            try {
                var sv = field.getSelected();
                selectedVal = Array.isArray(sv) ? sv : (sv ? [sv] : []);
            } catch (e) { }
            for (var k = 0; k < opts.length; k++) {
                var o = document.createElement('option');
                o.value = opts[k];
                o.textContent = opts[k];
                if (selectedVal.indexOf(opts[k]) !== -1) o.selected = true;
                sel.appendChild(o);
            }
            inputEl = sel;
            wrapper.appendChild(sel);

        } else {
            var unknown = document.createElement('span');
            unknown.style.cssText = 'font-size:0.8rem;color:#475569;';
            unknown.textContent = '(unsupported field type)';
            wrapper.appendChild(unknown);
            inputEl = null;
        }

        return { el: wrapper, input: inputEl };
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    btnSave.addEventListener('click', function () {
        if (!state.pdfBytes) return;
        btnSave.disabled = true;
        progressWrap.style.display = 'block';
        progressBar.style.width = '0%';
        progressLabel.style.display = 'block';

        PDFLib.PDFDocument.load(state.pdfBytes, { ignoreEncryption: true }).then(function (doc) {
            var form = doc.getForm();
            progressBar.style.width = '30%';

            for (var i = 0; i < state.fields.length; i++) {
                var f = state.fields[i];
                if (!f.input) continue;
                try {
                    if (f.type === 'TextField') {
                        form.getTextField(f.name).setText(f.input.value || '');
                    } else if (f.type === 'CheckBox') {
                        var cb = f.input.type === 'checkbox' ? f.input : f.input.querySelector('input[type=checkbox]');
                        if (cb) {
                            if (cb.checked) form.getCheckBox(f.name).check();
                            else form.getCheckBox(f.name).uncheck();
                        }
                    } else if (f.type === 'RadioGroup') {
                        var selected = null;
                        for (var j = 0; j < f.input.inputs.length; j++) {
                            if (f.input.inputs[j].checked) { selected = f.input.inputs[j].value; break; }
                        }
                        if (selected !== null) form.getRadioGroup(f.name).select(selected);
                    } else if (f.type === 'Dropdown') {
                        var selEl = f.input;
                        if (selEl.value) form.getDropdown(f.name).select(selEl.value);
                    } else if (f.type === 'OptionList') {
                        var ol = form.getOptionList(f.name);
                        var selVals = [];
                        var optEls = f.input.options;
                        for (var m = 0; m < optEls.length; m++) {
                            if (optEls[m].selected) selVals.push(optEls[m].value);
                        }
                        if (selVals.length) ol.select(selVals);
                    }
                } catch (e) {
                    // skip fields that can't be filled (e.g. read-only or type mismatch)
                }
            }

            progressBar.style.width = '70%';

            if (flattenCheck.checked) {
                try { form.flatten(); } catch (e) { }
            }

            return doc.save();
        }).then(function (saved) {
            var blob = new Blob([saved], { type: 'application/pdf' });
            var url = URL.createObjectURL(blob);
            var outName = state.fileName.replace(/\.pdf$/i, '') + '_filled.pdf';
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
        state.pageCount = 0;
        state.fields = [];
        fileInput.value = '';
        formFieldsList.innerHTML = '';
        noFormNotice.style.display = 'none';
        fieldCountBadge.style.display = 'none';
        flattenSection.style.display = 'none';
        flattenCheck.checked = false;
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
