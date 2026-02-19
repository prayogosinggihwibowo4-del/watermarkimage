document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const themeSelect = document.getElementById('themeSelect');
    const theme2Inputs = document.getElementById('theme2Inputs');
    const badgeTextInput = document.getElementById('badgeText');
    const serialNumber = document.getElementById('serialNumber');
    const logoUrlInput = document.getElementById('logoUrl');

    // Custom Theme Elements
    const customThemeInputs = document.getElementById('customThemeInputs');
    const customTitle = document.getElementById('customTitle');
    const customTextColor = document.getElementById('customTextColor');
    const customBgColor = document.getElementById('customBgColor');
    const customBgOpacity = document.getElementById('customBgOpacity');
    const customPosY = document.getElementById('customPosY');
    const customPosX = document.getElementById('customPosX');
    const customFontSize = document.getElementById('customFontSize');
    const customShowMap = document.getElementById('customShowMap');
    const activationOverlay = document.getElementById('activationOverlay');

    // Create a temporary link for the sample image
    const sampleImageLink = document.createElement('a');
    sampleImageLink.href = "#";
    sampleImageLink.id = "useSampleImage";
    sampleImageLink.textContent = "Gunakan Foto Contoh";
    sampleImageLink.style.display = "block";
    sampleImageLink.style.textAlign = "center";
    sampleImageLink.style.marginTop = "10px";
    sampleImageLink.style.color = "var(--primary)";
    sampleImageLink.style.textDecoration = "underline";
    sampleImageLink.style.cursor = "pointer";

    // Insert after upload area
    document.querySelector('.upload-section').appendChild(sampleImageLink);

    const locationTitle = document.getElementById('locationTitle');
    const addressInput = document.getElementById('addressInput');
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const dateInput = document.getElementById('dateInput');
    const timeInput = document.getElementById('timeInput');
    const imageUpload = document.getElementById('imageUpload');
    const downloadBtn = document.getElementById('downloadBtn');
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    const emptyState = document.getElementById('emptyState');
    const mapTypeSelect = document.getElementById('mapTypeSelect');
    const mapZoomSelect = document.getElementById('mapZoomSelect');

    let currentImage = null;
    let map = null;
    let marker = null;
    let staticMapImg = new Image();
    staticMapImg.crossOrigin = "anonymous";

    let institutionLogo = new Image();
    // CrossOrigin needs to be handled carefully for Google Drive
    institutionLogo.crossOrigin = "anonymous";

    institutionLogo.onload = () => {
        console.log("Logo loaded successfully");
        renderWatermark();
    };

    institutionLogo.onerror = () => {
        console.warn("Logo failed to load with CORS, trying without...");
        // If it fails with anonymous, try without crossOrigin as a fallback
        // Note: This won't help if we need to draw it to canvas (tainted canvas),
        // but it's good for debugging.
        institutionLogo.src = ""; // Clear current attempt
    };
    institutionLogo.onerror = () => {
        console.error("Gagal memuat logo dari URL yang diberikan. Mencoba memuat tanpa CORS...");
        institutionLogo.crossOrigin = null;
    };

    // Initialize Map
    function initMap() {
        const initialLat = -7.601301;
        const initialLng = 110.201094;

        map = L.map('map').setView([initialLat, initialLng], 15);
        // Using CartoDB Voyager for a cleaner, more readable "Google-like" appearance
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

        updateLocationInputs(initialLat, initialLng);
        updateStaticMap(initialLat, initialLng);

        marker.on('dragend', (e) => {
            const pos = marker.getLatLng();
            updateLocationInputs(pos.lat, pos.lng);
            reverseGeocode(pos.lat, pos.lng);
            updateStaticMap(pos.lat, pos.lng);
        });

        map.on('click', (e) => {
            marker.setLatLng(e.latlng);
            updateLocationInputs(e.latlng.lat, e.latlng.lng);
            reverseGeocode(e.latlng.lat, e.latlng.lng);
            updateStaticMap(e.latlng.lat, e.latlng.lng);
        });
    }

    function updateStaticMap(lat, lng) {
        // --- 100% PARITY TILE STITCHING ---
        // Instead of external services, we stitch tiles from the same source
        // used in the interactive map (CartoDB/OSM).
        const zoom = parseInt(mapZoomSelect.value);
        const type = mapTypeSelect.value;
        const size = 300; // Final target size on canvas

        // Tile math
        const n = Math.pow(2, zoom);
        const xtile = (lng + 180) / 360 * n;
        const ytile = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;

        // Calculate offset for the center point within the center tile
        const center_x = Math.floor(xtile);
        const center_y = Math.floor(ytile);
        const offset_x = (xtile - center_x) * 256;
        const offset_y = (ytile - center_y) * 256;

        // Draw to a temporary canvas to stitch a 2x2 or 3x3 grid
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 768; // 3x3 tiles
        tempCanvas.height = 768;
        const tCtx = tempCanvas.getContext('2d');

        let loaded = 0;
        const tilesToLoad = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                tilesToLoad.push({ tx: center_x + dx, ty: center_y + dy, dx, dy });
            }
        }

        tilesToLoad.forEach(t => {
            const img = new Image();
            img.crossOrigin = "anonymous";

            let url;
            if (type === 'sat,skl') {
                // Keep Yandex for Satellite as Carto has no Satellite
                url = `https://static-maps.yandex.ru/1.x/?lang=id_ID&ll=${lng},${lat}&z=${zoom}&l=sat,skl&size=450,450`;
                // For Yandex we just take one big image and load it
                img.src = url;
                img.onload = () => {
                    staticMapImg.src = img.src;
                };
                return;
            } else {
                // Roadmap from Carto (matches interactive map)
                url = `https://basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${t.tx}/${t.ty}.png`;
            }

            img.onload = () => {
                tCtx.drawImage(img, (t.dx + 1) * 256, (t.dy + 1) * 256);
                loaded++;
                if (loaded === 9) {
                    // All tiles loaded into temp canvas, now extract the center
                    const finalCanvas = document.createElement('canvas');
                    finalCanvas.width = 450;
                    finalCanvas.height = 450;
                    const fCtx = finalCanvas.getContext('2d');

                    // The center coordinate (xtile, ytile) is at:
                    // x: 256 + offset_x, y: 256 + offset_y in the tempCanvas
                    // We want to crop 450x450 around that center
                    fCtx.drawImage(tempCanvas,
                        256 + offset_x - 225, 256 + offset_y - 225, 450, 450,
                        0, 0, 450, 450);

                    staticMapImg.src = finalCanvas.toDataURL();
                }
            };
            img.onerror = () => {
                loaded++; // Skip failed tiles
                if (loaded === 9) staticMapImg.src = tempCanvas.toDataURL();
            };
            img.src = url;
        });
    }

    function updateLocationInputs(lat, lng) {
        latInput.value = lat.toFixed(6);
        lngInput.value = lng.toFixed(6);
        renderWatermark();
    }

    async function reverseGeocode(lat, lng) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await response.json();
            if (data.display_name) {
                addressInput.value = data.display_name;
                if (!locationTitle.value) {
                    const parts = data.display_name.split(',');
                    locationTitle.value = parts[2] ? parts[2].trim() + ", " + parts[3].trim() : parts[0];
                }
                renderWatermark();
            }
        } catch (error) {
            console.error('Reverse geocoding failed:', error);
        }
    }

    function initDateTime() {
        const now = new Date();
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

        const dayName = days[now.getDay()];
        const dateStr = `${now.getDate().toString().padStart(2, '0')}/${months[now.getMonth()]}/${now.getFullYear()}`;

        dateInput.value = `${dayName}, ${dateStr}`;
        timeInput.value = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });

        renderWatermark();
    }

    const dropZone = document.getElementById('dropZone');

    dropZone.addEventListener('click', (e) => {
        const isActivated = localStorage.getItem('watermark_activated') === 'true';
        if (!isActivated) {
            e.preventDefault(); // Prevent file dialog
            if (activationOverlay) activationOverlay.style.display = 'flex';
        }
    });

    imageUpload.addEventListener('click', () => {
        imageUpload.value = null; // Reset value so "change" fires every time
    });

    function generateRandomSerial() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing O, 0, I, 1
        let result = 'TPC';
        for (let i = 0; i < 11; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        serialNumber.value = result;
    }

    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            generateRandomSerial(); // Generate new serial for new photo
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    currentImage = img;
                    emptyState.style.display = 'none';
                    canvas.style.display = 'block';
                    downloadBtn.disabled = false;
                    renderWatermark();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    function roundRect(ctx, x, y, width, height, radius) {
        if (width < 0 || height < 0) return;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function renderWatermark() {
        if (!currentImage) return;

        canvas.width = currentImage.width;
        canvas.height = currentImage.height;
        ctx.drawImage(currentImage, 0, 0);

        const theme = themeSelect.value;
        if (theme === 'theme1') {
            renderTheme1();
        } else if (theme === 'theme2') {
            renderTheme2();
        } else if (theme === 'themePrecision') {
            renderThemePrecision();
        } else if (theme === 'themeCustom') {
            renderThemeCustom();
        } else {
            renderTheme1(); // Default
        }
    }

    function renderTheme1() {
        const scale = canvas.width / 1000;
        const barHeight = 265 * scale; // Increased from 220
        const barMargin = 18 * scale;
        const barWidth = canvas.width - (barMargin * 2);
        const barX = barMargin;
        const barY = canvas.height - barHeight - barMargin;

        // --- 1. Rounded Semi-transparent Bar ---
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        roundRect(ctx, barX, barY, barWidth, barHeight, 25 * scale);
        ctx.fill();

        // --- 2. Map Snippet ---
        const mapPad = 14 * scale;
        const mapSize = barHeight - (mapPad * 2);
        const mapX = barX + mapPad;
        const mapY = barY + mapPad;

        ctx.save();
        roundRect(ctx, mapX, mapY, mapSize, mapSize, 15 * scale);
        ctx.clip();
        if (staticMapImg.complete && staticMapImg.naturalHeight !== 0) {
            ctx.drawImage(staticMapImg, mapX, mapY, mapSize, mapSize);

            // Google Overlay
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = `bold ${17 * scale}px Arial`;
            ctx.fillText("Google", mapX + 10 * scale, mapY + mapSize - 10 * scale);

            // Pin
            const pS = 38 * scale;
            const pX = mapX + mapSize / 2, pY = mapY + mapSize / 2;
            ctx.beginPath();
            ctx.arc(pX, pY - pS / 2, pS / 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ea4335'; ctx.fill();
            ctx.beginPath();
            ctx.moveTo(pX - pS / 4, pY - pS / 2);
            ctx.lineTo(pX + pS / 4, pY - pS / 2);
            ctx.lineTo(pX, pY); ctx.fill();
        }
        ctx.restore();

        // --- 3. Text content (Further Enlarged) ---
        const textX = mapX + mapSize + 30 * scale;
        const maxTextW = barX + barWidth - textX - 30 * scale;

        ctx.fillStyle = 'white';
        ctx.shadowBlur = 8 * scale;
        ctx.shadowColor = 'black';
        ctx.shadowOffsetX = 2.5 * scale;
        ctx.shadowOffsetY = 2.5 * scale;

        // Title: Kecamatan (Enlarged)
        const titleFS = 48 * scale; // Increased from 40
        ctx.font = `bold ${titleFS}px Arial`;
        const titleText = locationTitle.value || "Lokasi Penugasan";
        ctx.fillText(titleText, textX, barY + 80 * scale);

        // Address Lines
        const addrFS = 26 * scale; // Increased from 22
        ctx.font = `bold ${addrFS}px Arial`;
        const address = addressInput.value || "Silakan pilih lokasi...";

        let curY = barY + 80 * scale + 45 * scale;
        const words = address.split(' ');
        let line = '';
        let lineIdx = 0;
        for (let n = 0; n < words.length; n++) {
            let test = line + words[n] + ' ';
            if (ctx.measureText(test).width > maxTextW && lineIdx < 1) {
                ctx.fillText(line.trim(), textX, curY);
                line = words[n] + ' ';
                curY += addrFS * 1.35;
                lineIdx++;
            } else { line = test; }
        }
        ctx.fillText(line.trim(), textX, curY);

        // Lat/Lng (Smaller but bold)
        ctx.font = `bold ${addrFS * 0.85}px Arial`;
        ctx.fillText(`${latInput.value}°S, ${lngInput.value}°E`, textX, curY + 40 * scale);
        ctx.restore();
    }
    curY += addrFS * 1.3;

    // Lat/Long
    ctx.fillText(`Lat ${latInput.value}° Long ${lngInput.value}°`, textX, curY);
    curY += addrFS * 1.3;

    // DateTime (Italic)
    ctx.font = `italic ${addrFS}px Arial`;
    ctx.fillText(`${dateInput.value} ${timeInput.value} GMT +07:00`, textX, curY);

    ctx.restore();
}

    function renderTheme2() {
        const scale = canvas.width / 1000;
        const padding = 10 * scale;
        const fontBase = "Arial Narrow, Arial, sans-serif";

        // Enlarged width benchmark (~15% of width)
        const targetW = 150 * scale;

        // --- 1. Top Right Branding (Kemensos) ---
        if (institutionLogo.complete && institutionLogo.naturalHeight !== 0 && institutionLogo.src !== "") {
            const lW = 42 * scale;
            const lH = lW * (institutionLogo.height / institutionLogo.width);
            const bundleCenterX = canvas.width - padding - (lW / 2);
            const lX = bundleCenterX - (lW / 2);
            const lY = padding;

            ctx.save();
            ctx.drawImage(institutionLogo, lX, lY, lW, lH);

            ctx.fillStyle = 'black';
            ctx.font = `bold ${7 * scale}px ${fontBase}`;
            ctx.textAlign = 'center';
            ctx.fillText("KEMENTERIAN SOSIAL", bundleCenterX, lY + lH + 13 * scale);
            ctx.fillText("REPUBLIK INDONESIA", bundleCenterX, lY + lH + 23 * scale);
            ctx.restore();
        }

        // --- 2. Bottom Left Info Block ---
        let curY = canvas.height - 132 * scale;
        const startX = padding;

        // Badge [Label ✓] Time
        const bLabel = `[${locationTitle.value || "P2K2 ✓"}]`;
        const bTime = timeInput.value || "10:28";
        ctx.font = `bold ${16 * scale}px ${fontBase}`;
        const labW = ctx.measureText(bLabel).width;
        const timW = ctx.measureText(` ${bTime}`).width;
        const bPadX = 8 * scale;
        const bW = labW + timW + (bPadX * 2);
        const bH = 29 * scale;

        ctx.save();
        ctx.fillStyle = 'white';
        roundRect(ctx, startX, curY, bW, bH, 6 * scale);
        ctx.fill();

        ctx.fillStyle = '#FFD100'; // VIBRANT YELLOW
        ctx.fillText(bLabel, startX + bPadX, curY + 20 * scale);
        ctx.fillStyle = '#1e293b'; // DARK NAVY
        ctx.fillText(bTime, startX + bPadX + labW, curY + 20 * scale);
        ctx.restore();

        curY += 45 * scale;

        // --- Vertical Line Indicator ---
        ctx.save();
        ctx.lineWidth = 1.5 * scale;
        ctx.strokeStyle = '#FFD100';
        ctx.beginPath();
        ctx.moveTo(startX, curY - 5 * scale);
        ctx.lineTo(startX, curY + 66 * scale);
        ctx.stroke();
        ctx.restore();

        // --- Shadowed Text Block ---
        const textX = startX + 12 * scale;
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.shadowBlur = 5 * scale;
        ctx.shadowColor = 'black';
        ctx.shadowOffsetX = 1.5 * scale;
        ctx.shadowOffsetY = 1.5 * scale;
        ctx.textAlign = 'left';

        // 2a. Day, Date
        ctx.font = `bold ${13.5 * scale}px ${fontBase}`;
        ctx.fillText(dateInput.value, textX, curY);
        curY += 18 * scale;

        // 2b. Address (Wrapped)
        ctx.font = `bold ${12 * scale}px ${fontBase}`;
        const addr = addressInput.value || "Silakan pilih lokasi...";
        const wrds = addr.split(' ');
        let ln = '';
        let lnCt = 0;
        const maxW = targetW - 18 * scale;
        for (let n = 0; n < wrds.length; n++) {
            let tst = ln + wrds[n] + ' ';
            if (ctx.measureText(tst).width > maxW && lnCt < 2) {
                ctx.fillText(ln.trim(), textX, curY);
                ln = wrds[n] + ' ';
                curY += 14 * scale;
                lnCt++;
            } else { ln = tst; }
        }
        ctx.fillText(ln.trim(), textX, curY);
        curY += 18 * scale;

        // 2c. Lat/Lng (White)
        ctx.fillStyle = 'white';
        ctx.fillText(`${latInput.value}°S, ${lngInput.value}°E`, textX, curY);
        curY += 21 * scale;

        // 2d. Disclaimer (Split Color)
        ctx.font = `italic 600 ${10 * scale}px ${fontBase}`;
        ctx.textAlign = 'left';

        ctx.fillStyle = 'white';
        ctx.fillText("✓ ", textX, curY);
        let dOff = ctx.measureText("✓ ").width;

        ctx.fillStyle = '#FFD100'; // Vibrant Yellow
        ctx.fillText("Time", textX + dOff, curY);
        dOff += ctx.measureText("Time").width;

        ctx.fillStyle = 'white';
        ctx.fillText("mark menjamin keaslian waktu", textX + dOff, curY);
        ctx.restore();

        // --- 3. Right Sidebar (Split Color) ---
        ctx.save();
        ctx.translate(canvas.width - padding + 4 * scale, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `bold ${10 * scale}px ${fontBase}`;
        ctx.textAlign = 'center';

        const sPrefix = `© ${serialNumber.value} `;
        const sSuffix = "mark Verified";
        const wPrefix = ctx.measureText(sPrefix).width;
        const wTime = ctx.measureText("Time").width;
        const totalW = wPrefix + wTime + ctx.measureText(sSuffix).width;

        // Center the whole string
        let sOff = -totalW / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(sPrefix, sOff, 0);
        sOff += wPrefix;

        ctx.fillStyle = '#FFD100'; // Vibrant Yellow
        ctx.fillText("Time", sOff, 0);
        sOff += wTime;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(sSuffix, sOff, 0);
        ctx.restore();

        // --- 4. Bottom Right Branding (Time in Yellow, mark in White) ---
        ctx.save();
        ctx.textAlign = 'right';
        ctx.shadowBlur = 5 * scale;
        ctx.shadowColor = 'black';
        ctx.font = `bold ${18 * scale}px ${fontBase}`;

        const bTextMark = "mark";
        const bTextTime = "Time";
        const markW = ctx.measureText(bTextMark).width;

        // Draw "mark" in White
        ctx.fillStyle = 'white';
        ctx.fillText(bTextMark, canvas.width - padding, canvas.height - 30 * scale);

        // Draw "Time" in Vibrant Yellow to the left of "mark"
        ctx.fillStyle = '#FFD100';
        ctx.fillText(bTextTime, canvas.width - padding - markW, canvas.height - 30 * scale);

        ctx.fillStyle = 'white';
        ctx.font = `bold ${10 * scale}px ${fontBase}`;
        ctx.fillText("Foto 100% akurat", canvas.width - padding, canvas.height - 20 * scale);
        ctx.restore();
    }

    function renderThemePrecision() {
        const scale = canvas.width / 1000;
        const padding = 42 * scale; // Enlarged from 35

        // --- BOTTOM LEFT: MAP ---
        const mapSize = 420 * scale; // Enlarged from 350
        const mapX = padding;
        const mapY = canvas.height - mapSize - padding;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 4 * scale;
        ctx.shadowBlur = 10 * scale;
        ctx.shadowColor = 'black';
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);

        // Clip to square
        ctx.beginPath();
        ctx.rect(mapX, mapY, mapSize, mapSize);
        ctx.clip();

        if (staticMapImg.complete && staticMapImg.naturalHeight !== 0) {
            ctx.drawImage(staticMapImg, mapX, mapY, mapSize, mapSize);

            // --- GOOGLE LOGO ---
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `bold ${20 * scale}px Arial`;
            ctx.fillText("Google", mapX + 12 * scale, mapY + mapSize - 12 * scale);
            ctx.restore();

            // --- RED PIN ---
            const pinW = 42 * scale;
            const pinH = 60 * scale;
            const centerX = mapX + mapSize / 2;
            const centerY = mapY + mapSize / 2;

            ctx.save();
            ctx.translate(centerX, centerY);

            // Pin Shadow
            ctx.beginPath();
            ctx.ellipse(0, 0, 10 * scale, 5 * scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();

            // Pin body
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(-pinW / 2, -pinH / 2, -pinW / 2, -pinH, 0, -pinH);
            ctx.bezierCurveTo(pinW / 2, -pinH, pinW / 2, -pinH / 2, 0, 0);
            ctx.fillStyle = '#ea4335';
            ctx.fill();

            // Center hole
            ctx.beginPath();
            ctx.arc(0, -pinH * 0.7, pinW / 5, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();

            ctx.restore();
        }
        ctx.restore();

        // --- BOTTOM RIGHT: TEXT ---
        ctx.save();
        ctx.textAlign = 'right';
        ctx.fillStyle = 'white';
        ctx.shadowBlur = 12 * scale;
        ctx.shadowColor = 'black';
        ctx.shadowOffsetX = 3 * scale;
        ctx.shadowOffsetY = 3 * scale;

        const textX = canvas.width - padding;
        let currentTextY = canvas.height - padding - 25 * scale;

        const lines = [];
        const now = new Date();
        const monthsNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        const formattedDate = `${now.getDate()} ${monthsNames[now.getMonth()]} ${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')}.${now.getSeconds().toString().padStart(2, '0')}`;

        const lat = parseFloat(latInput.value) || 0;
        const lng = parseFloat(lngInput.value) || 0;
        const latSign = lat >= 0 ? "N" : "S";
        const lngSign = lng >= 0 ? "E" : "W";
        const formattedCoords = `${Math.abs(lat).toFixed(4).replace('.', ',')}${latSign} ${Math.abs(lng).toFixed(4).replace('.', ',')}${lngSign}`;

        lines.push(formattedDate);
        lines.push(formattedCoords);

        const address = addressInput.value || "";
        const addrParts = address.split(',').map(p => p.trim()).filter(p => p !== "");

        if (addrParts.length >= 4) {
            lines.push(addrParts[0]);
            lines.push(addrParts[2] || "");
            lines.push(addrParts[3] || "");
            lines.push(addrParts[4] || "");
        } else {
            addrParts.forEach(p => lines.push(p));
        }

        const fontSize = 66 * scale; // Increased from 55
        ctx.font = `bold ${fontSize}px Arial`;
        const lineSpacing = 1.35;

        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i]) {
                ctx.fillText(lines[i], textX, currentTextY);
                currentTextY -= (fontSize * lineSpacing);
            }
        }
        ctx.restore();
    }

    function renderThemeCustom() {
        const scale = canvas.width / 1000;
        const padding = 25 * scale; // Increased from 20

        // Custom Variables
        const titleText = customTitle.value || locationTitle.value || "Nama Lokasi";
        const textColor = customTextColor.value;
        const bgColor = customBgColor.value;
        const bgAlpha = customBgOpacity.value;
        const posX = parseInt(customPosX.value) / 100; // 0 to 1
        const posY = parseInt(customPosY.value) / 100; // 0 to 1
        const fontSize = parseInt(customFontSize.value) * scale;
        const showMap = customShowMap.value === 'yes';

        // 1. Calculate Content Size
        ctx.font = `bold ${fontSize}px Arial`;
        const titleMetrics = ctx.measureText(titleText);

        ctx.font = `bold ${fontSize * 0.75}px Arial`; // Increased factor and weight
        const dateText = `${dateInput.value} ${timeInput.value}`;
        const dateMetrics = ctx.measureText(dateText);

        const addrText = addressInput.value || "Alamat...";
        const addrMetrics = ctx.measureText(addrText);

        const contentWidth = Math.max(titleMetrics.width, dateMetrics.width, addrMetrics.width);
        const lineHeight = fontSize * 1.5; // Increased line height

        const latLngText = 'Lat: ' + latInput.value + ' Long: ' + lngInput.value;
        const latLngMetrics = ctx.measureText(latLngText);
        const finalContentWidth = Math.max(contentWidth, latLngMetrics.width);

        const totalHeight = (lineHeight * 4) + (padding);

        // Map Size (if enabled)
        const mapSize = showMap ? (totalHeight + padding) : 0;
        const totalBoxWidth = finalContentWidth + (padding * 3) + mapSize;
        const totalBoxHeight = Math.max(totalHeight, mapSize) + padding;

        // 2. Position Box
        let boxX = (canvas.width * posX) - (totalBoxWidth / 2);
        let boxY = (canvas.height * posY) - (totalBoxHeight / 2);

        // Constrain to canvas
        if (boxX < 0) boxX = 0;
        if (boxX + totalBoxWidth > canvas.width) boxX = canvas.width - totalBoxWidth;
        if (boxY < 0) boxY = 0;
        if (boxY + totalBoxHeight > canvas.height) boxY = canvas.height - totalBoxHeight;

        // 3. Draw Background
        ctx.save();
        ctx.fillStyle = `rgba(${hexToRgb(bgColor).r}, ${hexToRgb(bgColor).g}, ${hexToRgb(bgColor).b}, ${bgAlpha})`;
        ctx.shadowBlur = 10 * scale;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        roundRect(ctx, boxX, boxY, totalBoxWidth, totalBoxHeight, 20 * scale);
        ctx.fill();
        ctx.restore();

        // 4. Draw Map (Optional)
        let textStartX = boxX + padding;
        if (showMap) {
            const mapDrawSize = totalBoxHeight - (padding * 2);
            const mapDrawX = boxX + padding;
            const mapDrawY = boxY + padding;

            ctx.save();
            roundRect(ctx, mapDrawX, mapDrawY, mapDrawSize, mapDrawSize, 12 * scale);
            ctx.clip();
            if (staticMapImg.complete && staticMapImg.naturalHeight !== 0) {
                ctx.drawImage(staticMapImg, mapDrawX, mapDrawY, mapDrawSize, mapDrawSize);
            } else {
                ctx.fillStyle = '#333';
                ctx.fillRect(mapDrawX, mapDrawY, mapDrawSize, mapDrawSize);
            }
            ctx.restore();

            textStartX += mapDrawSize + padding;
        }

        // 5. Draw Text
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';

        // Strengthened Text Shadow
        ctx.shadowBlur = 4 * scale;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';

        let currentTextY = boxY + padding + fontSize;

        // Title
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillText(titleText, textStartX, currentTextY);
        currentTextY += lineHeight;

        // Date Time
        ctx.font = `bold ${fontSize * 0.75}px Arial`;
        ctx.fillText(dateText, textStartX, currentTextY);
        currentTextY += lineHeight;

        // Address (Wrapped)
        ctx.font = `bold ${fontSize * 0.7}px Arial`;
        ctx.fillText(addrText.substring(0, 60) + (addrText.length > 60 ? "..." : ""), textStartX, currentTextY);
        currentTextY += lineHeight;

        currentTextY += lineHeight * 0.9;
        ctx.fillText(latLngText, textStartX, currentTextY);
    }

    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    [logoUrlInput, locationTitle, addressInput, dateInput, timeInput, serialNumber].forEach(el => {
        el.addEventListener('input', () => {
            if (el === logoUrlInput) institutionLogo.src = logoUrlInput.value;
            renderWatermark();
        });
    });

// Theme Select Logic with Locking
themeSelect.addEventListener('mousedown', (e) => {
    const isActivated = localStorage.getItem('watermark_activated') === 'true';
    if (!isActivated) {
        e.preventDefault(); // Stop dropdown from opening
        if (activationOverlay) activationOverlay.style.display = 'flex';
        themeSelect.blur(); // Remove focus
        return false;
    }
});

themeSelect.addEventListener('change', () => {
    // Just in case change happens (e.g. keyboard nav)
    const isActivated = localStorage.getItem('watermark_activated') === 'true';
    if (!isActivated) {
        themeSelect.value = 'theme1'; // Reset to default (or previous)
        if (activationOverlay) activationOverlay.style.display = 'flex';
        return;
    }

    theme2Inputs.style.display = themeSelect.value === 'theme2' ? 'block' : 'none';
    customThemeInputs.style.display = themeSelect.value === 'themeCustom' ? 'block' : 'none';

    if (themeSelect.value === 'theme2') {
        generateRandomSerial(); // Ensure fresh serial when switching to Theme 2
    }

    // Refresh map if switching to/from Theme Precision
    if (marker) {
        const pos = marker.getLatLng();
        updateStaticMap(pos.lat, pos.lng);
    }

    renderWatermark();
});

[customTitle, customTextColor, customBgColor, customBgOpacity, customPosY, customPosX, customFontSize, customShowMap].forEach(el => {
    el.addEventListener('input', renderWatermark);
});

mapTypeSelect.addEventListener('change', () => {
    if (marker) {
        const pos = marker.getLatLng();
        updateStaticMap(pos.lat, pos.lng);
    }
});

mapZoomSelect.addEventListener('change', () => {
    if (marker) {
        const pos = marker.getLatLng();
        updateStaticMap(pos.lat, pos.lng);
    }
});

mapZoomSelect.addEventListener('input', () => {
    // Just update preview text if needed, but let change handle network
});

institutionLogo.src = logoUrlInput.value;
institutionLogo.onload = renderWatermark;

downloadBtn.addEventListener('click', () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.download = `GPS_Watermark_${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
});

initMap();
initDateTime();

// --- ACTIVATION SYSTEM ---
const activationOverlay = document.getElementById('activationOverlay');
const activationCodeInput = document.getElementById('activationCodeInput');
const activateSubmitBtn = document.getElementById('activateSubmitBtn');
const displayDeviceID = document.getElementById('displayDeviceID');
const waLink = document.getElementById('waLink');
const closeOverlayBtn = document.getElementById('closeOverlayBtn');

if (closeOverlayBtn) {
    closeOverlayBtn.addEventListener('click', () => {
        activationOverlay.style.display = 'none';
    });
}

// 1. Generate/Get persistent Device ID
let deviceID = localStorage.getItem('watermark_device_id');
if (!deviceID) {
    deviceID = Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem('watermark_device_id', deviceID);
}
displayDeviceID.textContent = deviceID;

// 2. Prepare WhatsApp Link
const waNumber = "6285743103666";
const waMessage = `Halo, saya ingin beli kode aktivasi GPS Watermark Pro.%0ADevice ID: ${deviceID}`;
waLink.href = `https://wa.me/${waNumber}?text=${waMessage}`;

// 3. Check if activated
function checkActivation() {
    const isActivated = localStorage.getItem('watermark_activated') === 'true';
    const storedID = localStorage.getItem('watermark_device_id');

    // Simple verification (Code is derived from Device ID + Salt)
    if (isActivated) {
        activationOverlay.style.display = 'none';
    } else {
        activationOverlay.style.display = 'flex';
    }
}

// 4. Submit Activation Code
activateSubmitBtn.addEventListener('click', () => {
    const inputCode = activationCodeInput.value.trim().toUpperCase();

    // Logical verification: b64 of (DeviceID + "30k") first 8 chars
    // Example: if ID is "ABC", key might be btoa("ABC30k").sub(0,8)
    const expectedCode = btoa(deviceID + "30k").substring(0, 8).toUpperCase();

    if (inputCode === expectedCode) {
        localStorage.setItem('watermark_activated', 'true');
        alert('Aplikasi BERHASIL diaktifkan!');
        activationOverlay.style.display = 'none';
    } else {
        alert('Kode Aktivasi SALAH! Silakan cek kembali atau hubungi WhatsApp.');
    }
});

// checkActivation(); // Removed initial check

// Add listener for Sample Image
sampleImageLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadSampleImage();
});

function loadSampleImage() {
    // Create a gradient placeholder
    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 800;
    placeholderCanvas.height = 600;
    const pCtx = placeholderCanvas.getContext('2d');

    // Gradient background
    const grd = pCtx.createLinearGradient(0, 0, 800, 600);
    grd.addColorStop(0, "#8ec5fc");
    grd.addColorStop(1, "#e0c3fc");
    pCtx.fillStyle = grd;
    pCtx.fillRect(0, 0, 800, 600);

    // Text
    pCtx.fillStyle = "rgba(255,255,255,0.5)";
    pCtx.font = "bold 60px Arial";
    pCtx.textAlign = "center";
    pCtx.textBaseline = "middle";
    pCtx.fillText("CONTOH FOTO", 400, 300);

    const img = new Image();
    img.onload = () => {
        // Set dummy data for preview
        latInput.value = "-7.601301";
        lngInput.value = "110.201094";
        addressInput.value = "Candi Borobudur, Magelang, Jawa Tengah";
        locationTitle.value = "Wisata Borobudur";
        generateRandomSerial(); // Also randomize for sample

        currentImage = img;
        emptyState.style.display = 'none';
        canvas.style.display = 'block';
        downloadBtn.disabled = false; // Allow download of sample? Maybe okay.
        renderWatermark();
    };
    img.src = placeholderCanvas.toDataURL();
}

// Auto load sample on start
loadSampleImage();
});
