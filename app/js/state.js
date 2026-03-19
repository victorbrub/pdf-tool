// Shared mutable application state
const App = window.App = window.App || {};

App.state = {
    pdfDoc: null,       // pdf-lib PDFDocument
    pdfJsDoc: null,     // pdf.js document (for thumbnails)
    totalPages: 0,
    currentTab: 'range',
    selectedPages: new Set(),
    generatedFiles: [], // [{ name, bytes }]
};
