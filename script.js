let player;
let currentVideoId = "";
let table; // Variabile per l'istanza di DataTables

const plyrConfig = { 
    invertTime: false, 
    displayDuration: true, 
    controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'] 
};

// Inizializza il player
player = new Plyr('#player', plyrConfig);

async function init() {
    const params = new URLSearchParams(window.location.search);
    const jsonUrl = params.get('src');

    if (!jsonUrl) {
        alert("Errore: Parametro ?src=mancante");
        return;
    }

    try {
        const response = await fetch(jsonUrl);
        const data = await response.json();
        renderTable(data);
    } catch (err) {
        console.error("Errore caricamento dati:", err);
    }
}

function renderTable(data) {
    const tbody = $('#video-table-body');
    tbody.empty();

    data.forEach((item, index) => {
        const row = `
            <tr data-url="${item.url}" data-time="${item.time}">
                <td>${item.indice || index + 1}</td>
                <td>${item.commento}</td>
                <td>${item.time}</td>
                <td><button class="btn-play">▶</button></td>
            </tr>`;
        tbody.append(row);
    });

    // Inizializza DataTables dopo aver caricato i dati
    table = $('#videoTable').DataTable({
        responsive: true,
        pageLength: 25,
        language: {
            search: "Filtra:",
            lengthMenu: "Mostra _MENU_ righe",
            info: "Mostrando _START_ a _END_ di _TOTAL_ annotazioni"
        }
    });

    // Gestione click sul pulsante Play (usando delega per funzionare con i filtri)
    $('#videoTable tbody').on('click', '.btn-play', function () {
        const tr = $(this).closest('tr');
        const url = tr.data('url');
        const time = parseInt(tr.data('time'));
        
        playVideo(url, time, tr);
    });
}

function extractInfo(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
        return { id: (match && match[2].length === 11) ? match[2] : null, provider: 'youtube' };
    }
    if (url.includes('vimeo.com')) {
        const match = url.match(/(?:vimeo\.com\/)(\d+)/);
        return { id: (match && match[1]) ? match[1] : null, provider: 'vimeo' };
    }
    return null;
}

function playVideo(url, time, rowElement) {
    const info = extractInfo(url);
    if (!info) return;

    // Evidenzia riga
    table.rows().nodes().to$().removeClass('active-row');
    rowElement.addClass('active-row');

    if (info.id === currentVideoId) {
        player.currentTime = time;
        player.play();
    } else {
        currentVideoId = info.id;
        loadNewSource(info.provider, info.id, time);
    }
}

function loadNewSource(provider, id, time) {
    player.destroy();
    document.getElementById('player-container').innerHTML = `<div id="player" data-plyr-provider="${provider}" data-plyr-embed-id="${id}"></div>`;
    player = new Plyr('#player', plyrConfig);
    player.on('ready', () => {
        setTimeout(() => {
            player.currentTime = time;
            player.play().catch(() => { player.muted = true; player.play(); });
        }, 1200);
    });
}

$(document).ready(init);