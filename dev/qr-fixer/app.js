(() => {
  "use strict";

  // ISO/IEC 18004 アライメントパターン中心座標テーブル (Version 1 - 40)
  const ALIGNMENT_LOCATIONS = [
    [], // dummy 0
    [], // 1
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ];

  const STORAGE_KEY = "qr_manual_fixer_state_v1";

  // DOM Elements
  const versionSelect = document.getElementById("version-select");
  const btnVerMinus = document.getElementById("btn-ver-minus");
  const btnVerPlus = document.getElementById("btn-ver-plus");
  const zoomRange = document.getElementById("zoom-range");
  const zoomValue = document.getElementById("zoom-value");
  const chkCrosshair = document.getElementById("chk-crosshair");
  const chkHighlightFixed = document.getElementById("chk-highlight-fixed");
  const chkLockFixed = document.getElementById("chk-lock-fixed");

  const gridInfo = document.getElementById("grid-info");
  const cursorPos = document.getElementById("cursor-pos");
  const qrGrid = document.getElementById("qr-grid");
  const refImage = document.getElementById("ref-image");

  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  const btnClear = document.getElementById("btn-clear");

  const decodeStatus = document.getElementById("decode-status");
  const decodeStatusText = document.getElementById("decode-status-text");
  const decodeResultArea = document.getElementById("decode-result-area");
  const decodeOutput = document.getElementById("decode-output");
  const btnCopyResult = document.getElementById("btn-copy-result");
  const linkOpenResult = document.getElementById("link-open-result");

  const previewCanvas = document.getElementById("preview-canvas");
  const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
  const btnDownloadPng = document.getElementById("btn-download-png");

  // Reference image controls
  const refFileInput = document.getElementById("ref-file-input");
  const btnRefReset = document.getElementById("btn-ref-reset");
  const chkRefOnTop = document.getElementById("chk-ref-on-top");
  const refControls = document.getElementById("ref-controls");
  const refOpacity = document.getElementById("ref-opacity");
  const refOpacityVal = document.getElementById("ref-opacity-val");
  const refScale = document.getElementById("ref-scale");
  const refScaleVal = document.getElementById("ref-scale-val");
  const refRotate = document.getElementById("ref-rotate");
  const refRotateVal = document.getElementById("ref-rotate-val");
  const refOffsetX = document.getElementById("ref-offset-x");
  const refOffsetXVal = document.getElementById("ref-offset-x-val");
  const refOffsetY = document.getElementById("ref-offset-y");
  const refOffsetYVal = document.getElementById("ref-offset-y-val");
  const btnRefCenter = document.getElementById("btn-ref-center");

  // Application State
  let version = 1;
  let size = 21;
  let gridData = new Uint8Array(size * size); // 0: white, 1: black
  let fixedMask = new Uint8Array(size * size); // 0: editable, 1: fixed
  let cellElements = [];

  let undoStack = [];
  let redoStack = [];
  let currentStroke = null; // { paintValue: 0|1, changes: Map<idx, {prev, next}> }
  let isDrawing = false;

  let crosshairCells = [];
  let lastHoverRow = -1;
  let lastHoverCol = -1;
  let decodeTimer = null;

  // Initialize Version Dropdown
  function initVersionSelect() {
    for (let v = 1; v <= 40; v++) {
      const s = 17 + 4 * v;
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = `Ver ${v} (${s}x${s})`;
      versionSelect.appendChild(opt);
    }
  }

  // Build Fixed Patterns for a given QR version
  function computeFixedPatterns(ver) {
    const n = 17 + 4 * ver;
    const fixed = new Uint8Array(n * n);
    const values = new Uint8Array(n * n);

    const setFixed = (r, c, val) => {
      if (r < 0 || r >= n || c < 0 || c >= n) return;
      const idx = r * n + c;
      fixed[idx] = 1;
      values[idx] = val;
    };

    // 1. Finder patterns (7x7) + Separator (1px white around)
    const drawFinderWithSeparator = (top, left, sepRow, sepCol) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBlack =
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setFixed(top + r, left + c, isBlack ? 1 : 0);
        }
      }
      // Separator
      for (let i = 0; i < 8; i++) {
        setFixed(sepRow, left === 0 ? i : n - 8 + i, 0);
        setFixed(top === 0 ? i : n - 8 + i, sepCol, 0);
      }
    };

    // Top-left
    drawFinderWithSeparator(0, 0, 7, 7);
    // Top-right
    drawFinderWithSeparator(0, n - 7, 7, n - 8);
    // Bottom-left
    drawFinderWithSeparator(n - 7, 0, n - 8, 7);

    // 2. Timing patterns (row 6, col 6)
    for (let i = 8; i < n - 8; i++) {
      const bit = i % 2 === 0 ? 1 : 0;
      setFixed(6, i, bit);
      setFixed(i, 6, bit);
    }

    // 3. Alignment patterns (Version >= 2)
    const coords = ALIGNMENT_LOCATIONS[ver] || [];
    for (let i = 0; i < coords.length; i++) {
      for (let j = 0; j < coords.length; j++) {
        const cy = coords[i];
        const cx = coords[j];
        // Skip if overlapping with finder patterns
        if (
          (cy <= 7 && cx <= 7) ||
          (cy <= 7 && cx >= n - 8) ||
          (cy >= n - 8 && cx <= 7)
        ) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack =
              Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setFixed(cy + dr, cx + dc, isBlack ? 1 : 0);
          }
        }
      }
    }

    // 4. Dark module
    setFixed(n - 8, 8, 1);

    return { fixed, values };
  }

  // Create or rebuild the grid DOM
  function buildGrid(preserveExisting = false) {
    const oldSize = size;
    const oldData = gridData;
    const oldFixed = fixedMask;

    size = 17 + 4 * version;
    const { fixed, values } = computeFixedPatterns(version);
    fixedMask = fixed;
    gridData = new Uint8Array(size * size);

    if (preserveExisting && oldData) {
      const copyN = Math.min(oldSize, size);
      for (let r = 0; r < copyN; r++) {
        for (let c = 0; c < copyN; c++) {
          const oldIdx = r * oldSize + c;
          const newIdx = r * size + c;
          if (!oldFixed[oldIdx] && !fixedMask[newIdx]) {
            gridData[newIdx] = oldData[oldIdx];
          }
        }
      }
    }

    // Apply fixed pattern values
    for (let i = 0; i < gridData.length; i++) {
      if (fixedMask[i]) {
        gridData[i] = values[i];
      }
    }

    // Update UI headers
    versionSelect.value = String(version);
    btnVerMinus.disabled = version <= 1;
    btnVerPlus.disabled = version >= 40;
    gridInfo.textContent = `Version ${version} (${size} x ${size})`;

    // Rebuild DOM cells
    qrGrid.innerHTML = "";
    qrGrid.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
    qrGrid.style.gridTemplateRows = `repeat(${size}, var(--cell-size))`;

    const frag = document.createDocumentFragment();
    cellElements = new Array(size * size);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const cell = document.createElement("div");
        cell.className = "cell";
        if (gridData[idx] === 1) cell.classList.add("black");
        if (fixedMask[idx] === 1) cell.classList.add("fixed");
        if ((c + 1) % 5 === 0 && c !== size - 1) cell.classList.add("guide-right");
        if ((r + 1) % 5 === 0 && r !== size - 1) cell.classList.add("guide-bottom");

        cell.dataset.idx = String(idx);
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        cellElements[idx] = cell;
        frag.appendChild(cell);
      }
    }

    qrGrid.appendChild(frag);
    crosshairCells = [];
    lastHoverRow = -1;
    lastHoverCol = -1;

    updateGridClasses();
    updateHistoryButtons();
    scheduleDecodeAndPreview();
    saveState();
  }

  function updateGridClasses() {
    qrGrid.classList.toggle("highlight-fixed", chkHighlightFixed.checked);
    qrGrid.classList.toggle("lock-fixed", chkLockFixed.checked);
  }

  function setCell(idx, val) {
    if (gridData[idx] === val) return;
    gridData[idx] = val;
    cellElements[idx].classList.toggle("black", val === 1);
  }

  // Crosshair highlight
  function clearCrosshair() {
    for (let i = 0; i < crosshairCells.length; i++) {
      crosshairCells[i].classList.remove("crosshair");
    }
    crosshairCells = [];
  }

  function updateCrosshair(row, col) {
    if (row === lastHoverRow && col === lastHoverCol) return;
    lastHoverRow = row;
    lastHoverCol = col;

    if (row < 0 || col < 0) {
      cursorPos.textContent = "R: -, C: -";
      clearCrosshair();
      return;
    }

    cursorPos.textContent = `R: ${row + 1}, C: ${col + 1}`;

    clearCrosshair();
    if (!chkCrosshair.checked) return;

    for (let c = 0; c < size; c++) {
      const el = cellElements[row * size + c];
      el.classList.add("crosshair");
      crosshairCells.push(el);
    }
    for (let r = 0; r < size; r++) {
      if (r === row) continue;
      const el = cellElements[r * size + col];
      el.classList.add("crosshair");
      crosshairCells.push(el);
    }
  }

  // Pointer drawing logic
  function canEditCell(idx) {
    if (chkLockFixed.checked && fixedMask[idx] === 1) {
      return false;
    }
    return true;
  }

  function applyCellInStroke(idx) {
    if (!currentStroke || !canEditCell(idx)) return;
    const targetVal = currentStroke.paintValue;
    const prevVal = gridData[idx];
    if (prevVal === targetVal) return;

    if (!currentStroke.changes.has(idx)) {
      currentStroke.changes.set(idx, { prev: prevVal, next: targetVal });
    } else {
      currentStroke.changes.get(idx).next = targetVal;
    }
    setCell(idx, targetVal);
    scheduleDecodeAndPreview();
  }

  qrGrid.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || e.button !== 0) return;

    const idx = Number(cell.dataset.idx);
    if (!canEditCell(idx)) return;

    e.preventDefault();
    qrGrid.setPointerCapture(e.pointerId);

    const paintValue = gridData[idx] === 1 ? 0 : 1;
    isDrawing = true;
    currentStroke = {
      paintValue,
      changes: new Map()
    };

    applyCellInStroke(idx);
  });

  qrGrid.addEventListener("pointermove", (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cell = target ? target.closest(".cell") : null;
    if (cell && qrGrid.contains(cell)) {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      updateCrosshair(r, c);
      if (isDrawing) {
        applyCellInStroke(Number(cell.dataset.idx));
      }
    }
  });

  function finishStroke() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke && currentStroke.changes.size > 0) {
      const action = Array.from(currentStroke.changes.entries()).map(([idx, diff]) => ({
        idx,
        prev: diff.prev,
        next: diff.next
      }));
      undoStack.push(action);
      if (undoStack.length > 200) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
      saveState();
    }
    currentStroke = null;
  }

  qrGrid.addEventListener("pointerup", finishStroke);
  qrGrid.addEventListener("pointercancel", finishStroke);
  qrGrid.addEventListener("pointerleave", () => {
    if (!isDrawing) {
      updateCrosshair(-1, -1);
    }
  });

  // Undo / Redo
  function updateHistoryButtons() {
    btnUndo.disabled = undoStack.length === 0;
    btnRedo.disabled = redoStack.length === 0;
  }

  function undo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    for (let i = 0; i < action.length; i++) {
      setCell(action[i].idx, action[i].prev);
    }
    redoStack.push(action);
    updateHistoryButtons();
    scheduleDecodeAndPreview();
    saveState();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    for (let i = 0; i < action.length; i++) {
      setCell(action[i].idx, action[i].next);
    }
    undoStack.push(action);
    updateHistoryButtons();
    scheduleDecodeAndPreview();
    saveState();
  }

  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (
      (e.key.toLowerCase() === "z" && e.shiftKey) ||
      e.key.toLowerCase() === "y"
    ) {
      e.preventDefault();
      redo();
    }
  });

  // Clear editable cells
  btnClear.addEventListener("click", () => {
    const changes = [];
    for (let i = 0; i < gridData.length; i++) {
      if (!fixedMask[i] && gridData[i] !== 0) {
        changes.push({ idx: i, prev: gridData[i], next: 0 });
        setCell(i, 0);
      }
    }
    if (changes.length > 0) {
      undoStack.push(changes);
      redoStack = [];
      updateHistoryButtons();
      scheduleDecodeAndPreview();
      saveState();
    }
  });

  // Version & Zoom controls
  function changeVersion(newVer) {
    const clamped = Math.max(1, Math.min(40, newVer));
    if (clamped === version) return;
    version = clamped;
    undoStack = [];
    redoStack = [];
    buildGrid(true);
  }

  versionSelect.addEventListener("change", () => {
    changeVersion(Number(versionSelect.value));
  });
  btnVerMinus.addEventListener("click", () => changeVersion(version - 1));
  btnVerPlus.addEventListener("click", () => changeVersion(version + 1));

  zoomRange.addEventListener("input", () => {
    const px = zoomRange.value;
    document.documentElement.style.setProperty("--cell-size", `${px}px`);
    zoomValue.textContent = `${px}px`;
  });

  chkCrosshair.addEventListener("change", () => {
    if (!chkCrosshair.checked) clearCrosshair();
  });
  chkHighlightFixed.addEventListener("change", updateGridClasses);
  chkLockFixed.addEventListener("change", updateGridClasses);

  // Preview & QR Decode
  function scheduleDecodeAndPreview() {
    if (decodeTimer) clearTimeout(decodeTimer);
    decodeTimer = setTimeout(renderPreviewAndDecode, 30);
  }

  function renderPreviewAndDecode() {
    const quietZone = 4;
    const totalModules = size + quietZone * 2;
    const scale = Math.max(4, Math.floor(320 / totalModules));
    const canvasSize = totalModules * scale;

    previewCanvas.width = canvasSize;
    previewCanvas.height = canvasSize;

    previewCtx.fillStyle = "#ffffff";
    previewCtx.fillRect(0, 0, canvasSize, canvasSize);

    previewCtx.fillStyle = "#000000";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (gridData[r * size + c] === 1) {
          previewCtx.fillRect(
            (c + quietZone) * scale,
            (r + quietZone) * scale,
            scale,
            scale
          );
        }
      }
    }

    // Attempt decode with jsQR
    if (typeof window.jsQR === "function") {
      const imageData = previewCtx.getImageData(0, 0, canvasSize, canvasSize);
      const result = window.jsQR(imageData.data, canvasSize, canvasSize, {
        inversionAttempts: "dontInvert"
      });

      if (result && result.data) {
        decodeStatus.className = "status-box status-success";
        decodeStatusText.textContent = "読み取り成功";
        decodeResultArea.classList.remove("hidden");
        decodeOutput.value = result.data;

        if (/^https?:\/\/\S+$/i.test(result.data)) {
          linkOpenResult.href = result.data;
          linkOpenResult.classList.remove("hidden");
        } else {
          linkOpenResult.classList.add("hidden");
        }
        return;
      }
    }

    decodeStatus.className = "status-box status-pending";
    decodeStatusText.textContent = "未検出";
    decodeResultArea.classList.add("hidden");
  }

  btnCopyResult.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(decodeOutput.value);
      const orig = btnCopyResult.textContent;
      btnCopyResult.textContent = "コピー完了";
      setTimeout(() => {
        btnCopyResult.textContent = orig;
      }, 1200);
    } catch {
      decodeOutput.select();
      document.execCommand("copy");
    }
  });

  btnDownloadPng.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `qr-v${version}-${size}x${size}.png`;
    link.href = previewCanvas.toDataURL("image/png");
    link.click();
  });

  // Reference Overlay Image
  function updateRefTransform() {
    const opacity = Number(refOpacity.value) / 100;
    const sc = Number(refScale.value) / 100;
    const rot = Number(refRotate.value);
    const ox = Number(refOffsetX.value);
    const oy = Number(refOffsetY.value);

    refOpacityVal.textContent = `${refOpacity.value}%`;
    refScaleVal.textContent = `${refScale.value}%`;
    refRotateVal.textContent = `${rot}°`;
    refOffsetXVal.textContent = `${ox}px`;
    refOffsetYVal.textContent = `${oy}px`;

    refImage.style.opacity = String(opacity);
    refImage.style.transform = `translate(${ox}px, ${oy}px) rotate(${rot}deg) scale(${sc})`;
  }

  function loadRefImageFromBlob(blob) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      refImage.src = ev.target.result;
      refImage.classList.remove("hidden");
      qrGrid.classList.add("has-ref");
      refControls.classList.remove("disabled");
      btnRefReset.classList.remove("hidden");
      updateRefTransform();
    };
    reader.readAsDataURL(blob);
  }

  refFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) loadRefImageFromBlob(file);
    refFileInput.value = "";
  });

  document.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const blob = items[i].getAsFile();
        if (blob) loadRefImageFromBlob(blob);
        break;
      }
    }
  });

  btnRefReset.addEventListener("click", () => {
    refImage.src = "";
    refImage.classList.add("hidden");
    qrGrid.classList.remove("has-ref");
    refControls.classList.add("disabled");
    btnRefReset.classList.add("hidden");
  });

  chkRefOnTop.addEventListener("change", () => {
    refImage.classList.toggle("on-top", chkRefOnTop.checked);
  });

  [refOpacity, refScale, refRotate, refOffsetX, refOffsetY].forEach((el) => {
    el.addEventListener("input", updateRefTransform);
  });

  btnRefCenter.addEventListener("click", () => {
    refOpacity.value = "45";
    refScale.value = "100";
    refRotate.value = "0";
    refOffsetX.value = "0";
    refOffsetY.value = "0";
    updateRefTransform();
  });

  // LocalStorage Persistence
  function saveState() {
    try {
      const payload = {
        version,
        grid: Array.from(gridData)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.version === "number" &&
        parsed.version >= 1 &&
        parsed.version <= 40 &&
        Array.isArray(parsed.grid)
      ) {
        const n = 17 + 4 * parsed.version;
        if (parsed.grid.length === n * n) {
          version = parsed.version;
          buildGrid(false);
          for (let i = 0; i < gridData.length; i++) {
            if (!fixedMask[i]) {
              setCell(i, parsed.grid[i] ? 1 : 0);
            }
          }
          scheduleDecodeAndPreview();
          return true;
        }
      }
    } catch {
      // Ignore corrupt storage
    }
    return false;
  }

  // Boot
  initVersionSelect();
  if (!loadState()) {
    buildGrid(false);
  }
})();
