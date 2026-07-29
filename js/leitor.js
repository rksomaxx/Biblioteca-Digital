// 1. Captura os parâmetros da URL
const urlParams = new URLSearchParams(window.location.search);
const pdfNome = urlParams.get('pdf') || 'fragmentos.pdf';
const titulo = urlParams.get('titulo') || pdfNome.replace('.pdf', '').replace(/-/g, ' ');

const urlPDF = `../livros/${pdfNome}`;

// 2. Elementos do DOM
const viewer = document.getElementById('viewer');
const tituloLivro = document.getElementById('tituloLivro');
const paginaAtualInput = document.getElementById('paginaAtualInput');
const paginaInfo = document.getElementById('paginaInfo');
const progressBar = document.getElementById('progressBar');

// Estado do Leitor
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.3;

// Define o título no cabeçalho imediatamente
if (tituloLivro) {
    tituloLivro.textContent = decodeURIComponent(titulo);
}

// Configura o Worker do PDF.js caso necessário
if (typeof pdfjsLib !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

/**
 * Renderiza a página solicitada no Canvas
 */
function renderPage(num) {
    pageRendering = true;

    pdfDoc.getPage(num).then((page) => {
        if (viewer) viewer.innerHTML = '';

        // Pega as dimensões originais da página do PDF
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Calcula a altura máxima disponível na tela
        const maxDisplayHeight = window.innerHeight - 180;
        
        // Ajusta a escala dinamicamente para a página caber 100% na tela
        const autoScale = maxDisplayHeight / unscaledViewport.height;
        const finalScale = Math.min(autoScale, 1.5); // Limita o zoom máximo para não ficar gigante em monitores enormes

        const viewport = page.getViewport({ scale: finalScale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 
            ? [outputScale, 0, 0, outputScale, 0, 0] 
            : null;

        if (viewer) viewer.appendChild(canvas);

        const renderContext = {
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
        };

        const renderTask = page.render(renderContext);

        renderTask.promise.then(() => {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });

    if (paginaAtualInput) paginaAtualInput.value = num;
    atualizarProgresso(num);
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

function paginaAnterior() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
}

function proximaPagina() {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
}

function atualizarProgresso(num) {
    if (!pdfDoc || !progressBar) return;
    const porcentagem = (num / pdfDoc.numPages) * 100;
    progressBar.style.width = `${porcentagem}%`;
}

// ================= CARREGAMENTO DO DOCUMENTO =================

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.getDocument(urlPDF).promise.then((pdfDoc_) => {
        pdfDoc = pdfDoc_;
        if (paginaInfo) paginaInfo.textContent = `/ ${pdfDoc.numPages}`;
        if (paginaAtualInput) paginaAtualInput.max = pdfDoc.numPages;

        renderPage(pageNum);
    }).catch((err) => {
        if (tituloLivro) tituloLivro.textContent = "Erro ao carregar o livro";
        console.error("Erro ao carregar PDF:", err);
    });
} else {
    console.error("Biblioteca PDF.js não foi carregada no HTML.");
}

// ================= EVENTOS E CONTROLES =================

const btnAnt = document.getElementById('paginaAnterior');
if (btnAnt) btnAnt.addEventListener('click', paginaAnterior);

const btnProx = document.getElementById('proximaPagina');
if (btnProx) btnProx.addEventListener('click', proximaPagina);

const btnPrimeira = document.getElementById('primeiraPagina');
if (btnPrimeira) {
    btnPrimeira.addEventListener('click', () => {
        pageNum = 1;
        queueRenderPage(pageNum);
    });
}

const btnUltima = document.getElementById('ultimaPagina');
if (btnUltima) {
    btnUltima.addEventListener('click', () => {
        if (!pdfDoc) return;
        pageNum = pdfDoc.numPages;
        queueRenderPage(pageNum);
    });
}

if (paginaAtualInput) {
    paginaAtualInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (pdfDoc && val >= 1 && val <= pdfDoc.numPages) {
            pageNum = val;
            queueRenderPage(pageNum);
        } else {
            e.target.value = pageNum;
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'Space') {
        proximaPagina();
    } else if (e.key === 'ArrowLeft') {
        paginaAnterior();
    }
});

const btnModo = document.getElementById('btnModo');
if (btnModo) {
    btnModo.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        btnModo.textContent = document.body.classList.contains('light-mode') ? '☀️' : '🌙';
    });
}

const btnTelaCheia = document.getElementById('btnTelaCheia');
if (btnTelaCheia) {
    btnTelaCheia.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });
}
// ================= NAVEGAÇÃO POR GESTO (SWIPE / TOUCH) =================

let touchStartX = 0;
let touchEndX = 0;

// Captura a posição inicial do toque
document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, false);

// Captura a posição final e verifica a direção do deslize
document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    tratarGestoGeral();
}, false);

function tratarGestoGeral() {
    const limiteMinimo = 50; // Distância mínima (em pixels) para considerar um deslize
    const diferencaX = touchEndX - touchStartX;

    // Deslizou da direita para a esquerda -> Próxima Página
    if (diferencaX < -limiteMinimo) {
        proximaPagina();
    }
    
    // Deslizou da esquerda para a direita -> Página Anterior
    if (diferencaX > limiteMinimo) {
        paginaAnterior();
    }
}