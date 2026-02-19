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
            activationOverlay.style.display = 'flex';
        }
    });

    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
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

        if (themeSelect.value === 'theme1') {
            renderTheme1();
        } else if (themeSelect.value === 'themePrecision') {
            renderThemePrecision();
        } else {
            renderThemeCustom();
        }
    }

    function renderTheme1() {
        const scale = canvas.width / 1000;
        const barHeight = 160 * scale;
        const barMargin = 15 * scale;
        const barWidth = canvas.width - (barMargin * 2);
        const barX = barMargin;
        const barY = canvas.height - barHeight - barMargin;

        // 1. Draw Rounded Black Bar
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        roundRect(ctx, barX, barY, barWidth, barHeight, 15 * scale);
        ctx.fill();

        // 2. Draw Map Snippet (Left side inside bar)
        const mapPadding = 8 * scale;
        const mapSize = barHeight - (mapPadding * 2);
        const mapX = barX + mapPadding;
        const mapY = barY + mapPadding;

        ctx.save();
        // Clip map to rounded rect inside bar
        roundRect(ctx, mapX, mapY, mapSize, mapSize, 8 * scale);
        ctx.clip();

        if (staticMapImg.complete && staticMapImg.naturalHeight !== 0) {
            ctx.drawImage(staticMapImg, mapX, mapY, mapSize, mapSize);

            // Google Logo (Bottom Left of Map)
            ctx.fillStyle = 'white';
            ctx.font = `bold ${12 * scale}px Arial`;
            ctx.shadowBlur = 4 * scale;
            ctx.shadowColor = 'black';
            ctx.fillText("Google", mapX + 8 * scale, mapY + mapSize - 8 * scale);

            // "GPS Map Camera" (Bottom Right of Map)
            ctx.font = `500 ${10 * scale}px Arial`;
            ctx.textAlign = 'right';
            ctx.fillText("GPS Map Camera", mapX + mapSize - 8 * scale, mapY + mapSize - 8 * scale);
            ctx.textAlign = 'left';

            // Red Pin (Center)
            const pinSize = 24 * scale;
            const centerX = mapX + mapSize / 2;
            const centerY = mapY + mapSize / 2;

            ctx.fillStyle = '#ea4335';
            ctx.shadowBlur = 2 * scale;
            ctx.beginPath();
            ctx.arc(centerX, centerY - pinSize / 2, pinSize / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(centerX - pinSize / 4, centerY - pinSize / 2);
            ctx.lineTo(centerX + pinSize / 4, centerY - pinSize / 2);
            ctx.lineTo(centerX, centerY);
            ctx.fill();

            // White dot in pin
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(centerX, centerY - pinSize / 2, pinSize / 8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 3. Draw Text Content
        const textX = mapX + mapSize + 20 * scale;
        const flagW = 45 * scale;
        const textMaxWidth = barX + barWidth - textX - flagW - 25 * scale;

        ctx.fillStyle = 'white';
        ctx.shadowBlur = 0;

        // Line 1: Title (Kecamatan...) - Bold and Larger
        const titleFontSize = 28 * scale;
        ctx.font = `bold ${titleFontSize}px Arial`;
        const titleText = locationTitle.value || "Kecamatan Borobudur, Jawa Tengah, Indonesia";
        ctx.fillText(titleText, textX, barY + 45 * scale);

        // Line 2 & 3: Address - Medium size
        const addrFontSize = 16 * scale;
        ctx.font = `${addrFontSize}px Arial`;
        const address = addressInput.value || "Jl. Daranindra No.1, Dusun VII, Borobudur...";

        let currY = barY + 45 * scale + 25 * scale;
        const words = address.split(' ');
        let line = '';
        let lineIdx = 0;
        for (let n = 0; n < words.length; n++) {
            let test = line + words[n] + ' ';
            if (ctx.measureText(test).width > textMaxWidth && lineIdx < 1) {
                ctx.fillText(line.trim(), textX, currY);
                line = words[n] + ' ';
                currY += addrFontSize * 1.3;
                lineIdx++;
            } else { line = test; }
        }
        ctx.fillText(line.trim(), textX, currY);
        currY += addrFontSize * 1.3;

        // Line 4: Lat/Long
        ctx.fillText(`Lat ${latInput.value}° Long ${lngInput.value}°`, textX, currY);
        currY += addrFontSize * 1.3;

        // Line 5: Date Time
        ctx.font = `italic ${addrFontSize}px Arial`;
        ctx.fillText(`${dateInput.value} ${timeInput.value} GMT +07:00`, textX, currY);

        // 4. Draw Flag (Right side)
        const flagH = 30 * scale;
        const flagX = barX + barWidth - flagW - 20 * scale;
        const flagY = barY + 25 * scale;

        ctx.fillStyle = '#ff0000';
        ctx.fillRect(flagX, flagY, flagW, flagH / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(flagX, flagY + flagH / 2, flagW, flagH / 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1 * scale;
        ctx.strokeRect(flagX, flagY, flagW, flagH);

        ctx.restore();
    }

    function renderTheme2() {
        const scale = canvas.width / 1000;
        const padding = 30 * scale;

        // --- TOP RIGHT: KEMSOS LOGO & TEXT BUNDLE ---
        if (institutionLogo.complete && institutionLogo.naturalHeight !== 0) {
            const logoW = 120 * scale;
            const logoH = logoW * (institutionLogo.height / institutionLogo.width);
            const logoX = canvas.width - logoW - padding - 30 * scale; // Center of the bundle
            const logoY = padding;

            ctx.save();
            // Logo
            ctx.drawImage(institutionLogo, logoX, logoY, logoW, logoH);

            // Text Bundle (Kementrian Sosial...)
            ctx.fillStyle = 'black';
            ctx.font = `bold ${16 * scale}px Arial`;
            ctx.textAlign = 'center';
            const textX = logoX + logoW / 2;
            ctx.fillText("KEMENTERIAN SOSIAL", textX, logoY + logoH + 25 * scale);
            ctx.fillText("REPUBLIK INDONESIA", textX, logoY + logoH + 42 * scale);

            // Thin white border around the bundle for visibility if needed, 
            // but in Image 1 it's just on a white wall.
            ctx.restore();
        }

        // --- BOTTOM LEFT: WHITE BOX BADGE & DETAILS ---
        let currentY = canvas.height - 300 * scale;
        const startX = padding;

        // 1. Precise Yellow/White Badge [P2K2 ✓] 10:28
        const badgeLabel = `[${locationTitle.value || "P2K2 ✓"}]`;
        const timeStr = timeInput.value;

        ctx.font = `bold ${36 * scale}px Arial`;
        const labelW = ctx.measureText(badgeLabel).width;
        const timeW = ctx.measureText(` ${timeStr}`).width;
        const badgePaddingX = 20 * scale;
        const badgeW = labelW + timeW + (badgePaddingX * 2);
        const badgeH = 70 * scale;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        roundRect(ctx, startX, currentY, badgeW, badgeH, 12 * scale);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();

        ctx.fillStyle = '#eab308'; // Bold Yellow
        ctx.fillText(badgeLabel, startX + badgePaddingX, currentY + 48 * scale);
        ctx.fillStyle = '#1e293b'; // Slate Dark
        ctx.fillText(timeStr, startX + badgePaddingX + labelW, currentY + 48 * scale);
        ctx.restore();

        currentY += 95 * scale;

        // Details with Soft Shadows
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.shadowBlur = 6 * scale;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowOffsetX = 2 * scale;
        ctx.shadowOffsetY = 2 * scale;
        ctx.textAlign = 'left';

        // 2. Day, Date
        ctx.font = `bold ${24 * scale}px Arial`;
        ctx.fillText(dateInput.value, startX, currentY);
        currentY += 40 * scale;

        // 3. Address (Wrapped)
        ctx.font = `500 ${20 * scale}px Arial`;
        const address = addressInput.value || "Jl. Daranindra No.1, Dusun VII, Kompleks Kantor...";
        const words = address.split(' ');
        let line = '';
        let lineCount = 0;
        const maxW = 550 * scale;
        for (let n = 0; n < words.length; n++) {
            let test = line + words[n] + ' ';
            if (ctx.measureText(test).width > maxW && lineCount < 2) {
                ctx.fillText(line.trim(), startX, currentY);
                line = words[n] + ' ';
                currentY += 28 * scale;
                lineCount++;
            } else { line = test; }
        }
        ctx.fillText(line.trim(), startX, currentY);
        currentY += 40 * scale;

        // 4. Coordinates
        ctx.fillText(`${latInput.value}°S, ${lngInput.value}°E`, startX, currentY);
        currentY += 45 * scale;

        // 5. Disclaimer with Icon
        ctx.font = `italic ${16 * scale}px Arial`;
        ctx.fillText("✓ Timemark menjamin keaslian waktu", startX, currentY);
        ctx.restore();

        // --- SIDE SERIAL TEXT (Vertical Right) ---
        ctx.save();
        ctx.translate(canvas.width - padding + 5 * scale, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `${16 * scale}px Arial`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 3 * scale;
        ctx.shadowColor = 'black';
        ctx.textAlign = 'center';
        ctx.fillText(`© ${serialNumber.value} Timemark Verified`, 0, 0);
        ctx.restore();

        // --- BOTTOM RIGHT: BRANDING & FLAG ---
        // Flag
        const fW = 50 * scale, fH = 32 * scale;
        const fX = canvas.width - fW - padding;
        const fY = canvas.height - 200 * scale;
        ctx.fillStyle = '#ff0000'; ctx.fillRect(fX, fY, fW, fH / 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(fX, fY + fH / 2, fW, fH / 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.strokeRect(fX, fY, fW, fH);

        // Timemark Yellow Branding
        ctx.save();
        ctx.textAlign = 'right';
        ctx.shadowBlur = 6 * scale;
        ctx.shadowColor = 'black';

        ctx.fillStyle = '#eab308'; // Brand Yellow
        ctx.font = `bold ${38 * scale}px Arial`;
        ctx.fillText("Timemark", canvas.width - padding, canvas.height - 60 * scale);

        ctx.fillStyle = 'white';
        ctx.font = `${16 * scale}px Arial`;
        ctx.fillText("Foto 100% akurat", canvas.width - padding, canvas.height - 35 * scale);
        ctx.restore();
    }

    function renderThemePrecision() {
        const scale = canvas.width / 1000;
        const padding = 25 * scale;

        // --- BOTTOM LEFT: MAP ---
        const mapSize = 250 * scale;
        const mapX = padding;
        const mapY = canvas.height - mapSize - padding;

        ctx.save();
        // Drawing a subtle border/container for the map
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2 * scale;
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);

        // Clip to square
        ctx.beginPath();
        ctx.rect(mapX, mapY, mapSize, mapSize);
        ctx.clip();

        if (staticMapImg.complete && staticMapImg.naturalHeight !== 0) {
            // Draw the image scaled down for "Retina" sharp detail
            ctx.drawImage(staticMapImg, mapX, mapY, mapSize, mapSize);

            // --- GOOGLE LOGO (Bottom Left of Map) ---
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = `bold ${11 * scale}px Arial`;
            // Simple Google colors or just white as in reference
            ctx.fillText("Google", mapX + 6 * scale, mapY + mapSize - 6 * scale);
            ctx.restore();

            // --- RED PIN (Center) ---
            const pinW = 26 * scale;
            const pinH = 38 * scale;
            const centerX = mapX + mapSize / 2;
            const centerY = mapY + mapSize / 2;

            // Draw a more realistic Google-style pin
            ctx.save();
            ctx.translate(centerX, centerY);

            // Pin Shadow
            ctx.beginPath();
            ctx.ellipse(0, 0, 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
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
            ctx.fillStyle = '#7a1b1b'; // Darker red inner
            ctx.fill();

            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(mapX, mapY, mapSize, mapSize);
        }
        ctx.restore();

        // --- BOTTOM RIGHT: TEXT ---
        ctx.save();
        ctx.textAlign = 'right';
        ctx.fillStyle = 'white';
        // Add shadow for readability as seen in reference
        ctx.shadowBlur = 4 * scale;
        ctx.shadowColor = 'black';
        ctx.shadowOffsetX = 1 * scale;
        ctx.shadowOffsetY = 1 * scale;

        const textX = canvas.width - padding;
        let currentTextY = canvas.height - padding - 15 * scale; // Start from bottom

        // Parse address to lines (reverse order for bottom-up drawing)
        const address = addressInput.value || "";
        const addrParts = address.split(',').map(p => p.trim()).filter(p => p !== "");

        // In the image: 
        // 1. Date Time
        // 2. Lat Long
        // 3. Street
        // 4. Kecamatan
        // 5. Kabupaten
        // 6. Province

        const lines = [];

        // Date & Time Formatting (9 Feb 2026 12.10.38)
        const now = new Date();
        const monthsNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        const formattedDate = `${now.getDate()} ${monthsNames[now.getMonth()]} ${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')}.${now.getSeconds().toString().padStart(2, '0')}`;

        // Lat Long Formatting (7,6012S 110,2008E)
        const lat = parseFloat(latInput.value) || 0;
        const lng = parseFloat(lngInput.value) || 0;
        const latSign = lat >= 0 ? "N" : "S";
        const lngSign = lng >= 0 ? "E" : "W";
        const formattedCoords = `${Math.abs(lat).toFixed(4).replace('.', ',')}${latSign} ${Math.abs(lng).toFixed(4).replace('.', ',')}${lngSign}`;

        // Build total list of lines
        lines.push(formattedDate);
        lines.push(formattedCoords);

        // Handle address parts
        // Assuming standard OSM format: [Street/House], [Village], [Subdistrict], [Regency], [Province], [Postcode], [Country]
        // We want Street, Subdistrict, Regency, Province
        if (addrParts.length >= 4) {
            lines.push(addrParts[0]); // Street
            lines.push(addrParts[2] || ""); // Subdistrict
            lines.push(addrParts[3] || ""); // Regency
            lines.push(addrParts[4] || ""); // Province
        } else {
            // Fallback for few parts
            addrParts.forEach(p => lines.push(p));
        }

        // Draw lines from bottom up
        const fontSize = 35 * scale;
        ctx.font = `${fontSize}px Arial`;
        const lineSpacing = 1.2;

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
        const padding = 20 * scale;

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

        ctx.font = `${fontSize * 0.7}px Arial`;
        const dateText = `${dateInput.value} ${timeInput.value}`;
        const dateMetrics = ctx.measureText(dateText);

        const addrText = addressInput.value || "Alamat...";
        const addrMetrics = ctx.measureText(addrText);

        const contentWidth = Math.max(titleMetrics.width, dateMetrics.width, addrMetrics.width);
        const lineHeight = fontSize * 1.4;

        const latLngText = 'Lat: ' + latInput.value + ' Long: ' + lngInput.value;
        const latLngMetrics = ctx.measureText(latLngText);
        const finalContentWidth = Math.max(contentWidth, latLngMetrics.width);

        const totalHeight = (lineHeight * 4) + (padding); // Height for Title, Date, Address, LatLng

        // Map Size (if enabled)
        const mapSize = showMap ? (totalHeight + padding) : 0;
        const totalBoxWidth = finalContentWidth + (padding * 3) + mapSize;
        const totalBoxHeight = Math.max(totalHeight, mapSize) + padding;

        // 2. Position Box
        // Center of box based on percentage
        let boxX = (canvas.width * posX) - (totalBoxWidth / 2);
        let boxY = (canvas.height * posY) - (totalBoxHeight / 2);

        // Constrain to canvas
        if (boxX < 0) boxX = 0;
        if (boxX + totalBoxWidth > canvas.width) boxX = canvas.width - totalBoxWidth;
        if (boxY < 0) boxY = 0;
        if (boxY + totalBoxHeight > canvas.height) boxY = canvas.height - totalBoxHeight;

        // 3. Draw Background
        ctx.fillStyle = `rgba(${hexToRgb(bgColor).r}, ${hexToRgb(bgColor).g}, ${hexToRgb(bgColor).b}, ${bgAlpha})`;
        roundRect(ctx, boxX, boxY, totalBoxWidth, totalBoxHeight, 15 * scale);
        ctx.fill();

        // 4. Draw Map (Optional)
        let textStartX = boxX + padding;
        if (showMap) {
            const mapDrawSize = totalBoxHeight - (padding * 2);
            const mapDrawX = boxX + padding;
            const mapDrawY = boxY + padding;

            ctx.save();
            roundRect(ctx, mapDrawX, mapDrawY, mapDrawSize, mapDrawSize, 8 * scale);
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

        let currentTextY = boxY + padding + fontSize;

        // Title
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillText(titleText, textStartX, currentTextY);
        currentTextY += lineHeight;

        // Date Time
        ctx.font = `${fontSize * 0.7}px Arial`;
        ctx.fillText(dateText, textStartX, currentTextY);
        currentTextY += lineHeight;

        // Address (Simple truncate/wrap)
        ctx.fillText(addrText.substring(0, 50) + (addrText.length > 50 ? "..." : ""), textStartX, currentTextY);
        currentTextY += lineHeight;

        currentTextY += lineHeight;
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
            activationOverlay.style.display = 'flex';
            this.blur(); // Remove focus
            return false;
        }
    });

    themeSelect.addEventListener('change', () => {
        // Just in case change happens (e.g. keyboard nav)
        const isActivated = localStorage.getItem('watermark_activated') === 'true';
        if (!isActivated) {
            themeSelect.value = 'theme1'; // Reset to default (or previous)
            activationOverlay.style.display = 'flex';
            return;
        }

        theme2Inputs.style.display = themeSelect.value === 'theme2' ? 'block' : 'none';
        customThemeInputs.style.display = themeSelect.value === 'themeCustom' ? 'block' : 'none';

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
