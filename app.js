/**
 * Chemical Scanner — Standalone Frontend Application
 *
 * Replaces google.script.run calls with fetch() to the GAS backend API.
 * Camera works directly because we're no longer inside a GAS iframe.
 */

class OCRScannerApp {
  constructor() {
    this.currentScreen = 'loading';
    this.isProcessing = false;
    this.flashEnabled = false;
    this.chemicalInfo = {};
    this.lastPreviewUrl = null;
    this.orientationTimeout = null;
    this.resizeTimeout = null;

    this.isVideoMode = false;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingTimer = null;
    this.recordingStartTime = null;
    this.maxRecordingDuration = 5000;
    this.recordedVideoBlob = null;
    this.actualRecordingDuration = null;
    this.recordingOrientation = null;
    this.captureOrientation = null;
    this.scanFrameInfo = null;
    this.currentRotation = 0;
    this.autoRotationApplied = 0;
    this.frameRotation = 0;
    this.recordingMimeType = null;

    this.isMobile = this.detectMobile();
    this.isIOS = this.detectIOS();
    this.isAndroid = this.detectAndroid();
    this.isSafari = this.detectSafari();

    if (this.isMobile) {
      this.initializeViewportHeight();
    }

    this.initializeElements();
    this.bindEvents();
    this.setCameraButtonsEnabled(false);
    this.createShutterSound();
    this.setPhotoMode();
    this.logDeviceInfo();
    this.initializeApp();
  }

  /* ─── Device detection ─── */

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  detectIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }
  detectAndroid() {
    return /Android/.test(navigator.userAgent);
  }
  detectSafari() {
    return /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  }

  getSupportedVideoFormat() {
    const formats = [
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const format of formats) {
      if (MediaRecorder.isTypeSupported(format)) return format;
    }
    return null;
  }

  logDeviceInfo() {
    console.log('=== Device Information ===');
    console.log(`User Agent: ${navigator.userAgent}`);
    console.log(`Mobile: ${this.isMobile}, iOS: ${this.isIOS}, Android: ${this.isAndroid}, Safari: ${this.isSafari}`);
    console.log(`Screen: ${window.screen.width}x${window.screen.height}`);
    console.log(`Window: ${window.innerWidth}x${window.innerHeight}`);
    console.log('=== Video Support ===');
    ['video/mp4', 'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .forEach(f => console.log(`${f}: ${MediaRecorder.isTypeSupported ? (MediaRecorder.isTypeSupported(f) ? 'Y' : 'N') : '?'}`));
    console.log(`Selected: ${this.getSupportedVideoFormat() || 'NONE'}`);
    console.log('========================');
  }

  initializeViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  /* ─── Element references ─── */

  initializeElements() {
    this.globalSpinner = document.getElementById('global-spinner');
    this.screens = {
      loading:      document.getElementById('loading-screen'),
      camera:       document.getElementById('camera-screen'),
      imagePreview: document.getElementById('image-preview-screen'),
      processing:   document.getElementById('processing-screen'),
      textReview:   document.getElementById('text-review-screen'),
      dataReview:   document.getElementById('data-review-screen'),
      success:      document.getElementById('success-screen'),
      error:        document.getElementById('error-screen')
    };
    const e = id => document.getElementById(id);
    this.elements = {
      video:           e('camera-video'),
      canvas:          e('camera-canvas'),
      shutterSound:    e('shutter-sound'),
      captureBtn:      e('capture-btn'),
      captureIcon:     e('capture-icon'),
      flashBtn:        e('flash-btn'),
      modeToggleBtn:   e('mode-toggle-btn'),
      modeToggleIcon:  e('mode-toggle-icon'),
      recordingTimer:  e('recording-timer'),
      timerText:       e('timer-text'),
      capturedPreview: e('captured-preview'),
      previewImage:    e('preview-image'),
      previewVideo:    e('preview-video'),
      previewTitle:    e('preview-title'),
      previewInstructionsText: e('preview-instructions-text'),
      retakeText:      e('retake-text'),
      retakePhotoBtn:  e('retake-photo-btn'),
      rotateBtn:       e('rotate-btn'),
      processOcrBtn:   e('process-ocr-btn'),
      extractedText:   e('extracted-text'),
      retakeBtn:       e('retake-btn'),
      processTextBtn:  e('process-text-btn'),
      scanBtn:         e('scan-btn'),
      backBtn:         e('back-btn'),
      submitBtn:       e('submit-btn'),
      newScanBtn:      e('new-scan-btn'),
      retryBtn:        e('retry-btn'),
      homeBtn:         e('home-btn'),
      errorTitle:      e('error-title'),
      errorMessage:    e('error-message'),
      toastContainer:  e('toast-container'),
      statsModal:      e('stats-modal'),
      closeModal:      document.querySelector('.close-modal'),
      statsBtn:        e('stats-btn'),
      statTotal:       e('stat-total'),
      statLast:        e('stat-last'),
      apiStatus:       e('api-status'),
      chemicalName:                    e('chemical-name'),
      concentration:                   e('concentration'),
      containerSize:                   e('container-size'),
      approximateQuantity:             e('approximate-quantity'),
      orderDate:                       e('order-date'),
      flinnChemicalFamily:             e('flinn-chemical-family'),
      hazardLabels:                    e('hazard-labels'),
      hazardClassificationPrimary:     e('hazard-classification-primary'),
      hazardClassificationSecondary:   e('hazard-classification-secondary'),
      storageRoomNumber:               e('storage-room-number'),
      cabinetNumber:                   e('cabinet-number'),
      shelfNumber:                     e('shelf-number'),
      plannedDisposalYear:             e('planned-disposal-year'),
      notes:                           e('notes'),
      userNotes:                       e('user-notes'),
      markedForRemoval:                e('marked-for-removal'),
      processedText:                   e('processed-text')
    };
  }

  setCameraButtonsEnabled(enabled) {
    [this.elements.captureBtn, this.elements.flashBtn, this.elements.modeToggleBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.6';
      btn.style.pointerEvents = enabled ? 'auto' : 'none';
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
      btn.classList.toggle('disabled', !enabled);
    });
  }

  /* ─── Event binding ─── */

  bindEvents() {
    const events = [
      [this.elements.scanBtn,        'click', () => this.initCamera()],
      [this.elements.captureBtn,     'click', () => this.handleCapture()],
      [this.elements.flashBtn,       'click', () => this.toggleFlash()],
      [this.elements.modeToggleBtn,  'click', () => this.toggleMode()],
      [this.elements.retakeBtn,      'click', () => this.initCamera()],
      [this.elements.retakePhotoBtn, 'click', () => this.initCamera()],
      [this.elements.rotateBtn,      'click', () => this.rotatePreview()],
      [this.elements.processOcrBtn,  'click', () => this.handleOCRProcessing()],
      [this.elements.processTextBtn, 'click', () => this.processText()],
      [this.elements.backBtn,        'click', () => this.showScreen('textReview')],
      [this.elements.submitBtn,      'click', () => this.submitData()],
      [this.elements.newScanBtn,     'click', () => this.initCamera()],
      [this.elements.retryBtn,       'click', () => this.initCamera()],
      [this.elements.homeBtn,        'click', () => this.initCamera()],
      [this.elements.statsBtn,       'click', () => this.showStatsModal()],
      [this.elements.closeModal,     'click', () => this.hideStatsModal()]
    ];
    events.forEach(([el, ev, fn]) => { if (el) el.addEventListener(ev, fn); });

    this.bindCameraButtonEvents();

    if (this.elements.statsModal) {
      this.elements.statsModal.addEventListener('click', e => {
        if (e.target === this.elements.statsModal) this.hideStatsModal();
      });
    }

    window.addEventListener('orientationchange', () => {
      clearTimeout(this.orientationTimeout);
      this.orientationTimeout = setTimeout(() => this.handleOrientationChange(), 500);
    });
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.handleResize(), 300);
    });

    if (this.elements.video) {
      this.elements.video.addEventListener('touchstart', e => this.handleVideoTouch(e), { passive: true });
      this.elements.video.addEventListener('click', e => this.handleVideoTouch(e));
    }
    const overlay = document.querySelector('.camera-overlay');
    if (overlay) {
      overlay.addEventListener('touchstart', e => this.handleCameraOverlayTouch(e), { passive: true });
      overlay.addEventListener('click', e => this.handleCameraOverlayTouch(e));
    }
  }

  bindCameraButtonEvents() {
    const btns = [
      { element: this.elements.captureBtn,    handler: () => this.handleCapture() },
      { element: this.elements.flashBtn,      handler: () => this.toggleFlash() },
      { element: this.elements.modeToggleBtn, handler: () => this.toggleMode() }
    ];
    btns.forEach(({ element, handler }) => {
      if (!element) return;
      let touchHandled = false, isPressed = false;

      element.addEventListener('touchstart', e => {
        if (e.cancelable) e.preventDefault();
        touchHandled = true; isPressed = true;
        element.classList.add('pressed');
        setTimeout(() => { if (isPressed && !this.isProcessing) { try { handler(); } catch (err) { this.showError('Action Error', err.message); } } }, 50);
      }, { passive: false });

      element.addEventListener('touchend', e => {
        if (e.cancelable) e.preventDefault();
        isPressed = false; element.classList.remove('pressed');
        setTimeout(() => { touchHandled = false; }, 300);
      }, { passive: false });

      element.addEventListener('mousedown', () => { if (!touchHandled) { isPressed = true; element.classList.add('pressed'); } });
      element.addEventListener('mouseup', () => { if (!touchHandled) { isPressed = false; element.classList.remove('pressed'); } });
      element.addEventListener('click', e => {
        if (!touchHandled && !this.isProcessing) {
          if (e.cancelable) e.preventDefault();
          try { handler(); } catch (err) { this.showError('Action Error', err.message); }
        }
        setTimeout(() => { touchHandled = false; }, 100);
      });
    });
  }

  /* ─── Initialization ─── */

  async initializeApp() {
    this.showScreen('loading');
  }

  /* ─── GAS Backend fetch helper ─── */

  async callBackend(payload) {
    const url = APP_CONFIG.GAS_BACKEND_URL;
    if (!url || url === 'YOUR_GAS_WEBAPP_URL_HERE') {
      throw new Error('Backend URL not configured. Open js/config.js and set GAS_BACKEND_URL.');
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },   // avoid CORS preflight
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    return res.json();
  }

  /* ─── Camera ─── */

  async initCamera() {
    this.showScreen('camera');
    this.setCameraButtonsEnabled(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Make sure you are using HTTPS and a modern browser.');
      }

      this.cleanupCapture();
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.elements.video.srcObject) this.elements.video.srcObject = null;

      let stream, lastError = null;
      const constraints = [
        { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, focusMode: 'auto', whiteBalanceMode: 'auto', exposureMode: 'auto' } },
        { video: { facingMode: 'environment', width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 } } },
        { video: { facingMode: 'environment' } },
        { video: true }
      ];
      for (const c of constraints) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch (err) { lastError = err; continue; }
      }
      if (!stream) throw new Error('Could not open camera stream. ' + (lastError ? `${lastError.name}: ${lastError.message}` : ''));

      this.stream = stream;
      this.elements.video.srcObject = stream;

      const track = stream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        try {
          const caps = track.getCapabilities(), settings = {};
          if (caps.focusMode && caps.focusMode.includes('continuous')) settings.focusMode = 'continuous';
          if (caps.exposureMode && caps.exposureMode.includes('continuous')) settings.exposureMode = 'continuous';
          if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) settings.whiteBalanceMode = 'continuous';
          if (Object.keys(settings).length) await track.applyConstraints({ advanced: [settings] });
        } catch (_) { /* ignore */ }
      }

      await new Promise(resolve => this.elements.video.addEventListener('loadeddata', resolve, { once: true }));
      this.setCameraButtonsEnabled(true);

    } catch (error) {
      console.error('Camera init error:', error.name, error.message);
      let msg = 'Cannot access camera: ' + error.message;
      if (error.name === 'NotAllowedError') {
        msg = 'Camera permission denied.\n\niPhone: Settings > Safari > Camera > Allow\nAndroid Chrome: Tap lock icon > Permissions > Camera > Allow\nThen reload.';
      }
      this.showError('Camera Error', msg);
    }
  }

  /* ─── Photo capture ─── */

  async capturePhoto() {
    if (this.isProcessing) return;
    if (!this.elements.video || this.elements.video.readyState !== 4 || !this.stream) {
      this.showError('Camera Error', 'Camera not ready. Please try again.');
      return;
    }
    this.isProcessing = true;
    this.setCameraButtonsEnabled(false);

    try {
      this.captureOrientation = {
        angle: screen.orientation ? screen.orientation.angle : window.orientation || 0,
        type: screen.orientation ? screen.orientation.type : 'unknown',
        isPortrait: window.innerHeight > window.innerWidth,
        deviceWidth: window.innerWidth,
        deviceHeight: window.innerHeight,
        timestamp: Date.now()
      };

      const video = this.elements.video;
      const canvas = this.elements.canvas;
      const ctx = canvas.getContext('2d');
      const videoWidth = video.videoWidth || 1920;
      const videoHeight = video.videoHeight || 1080;

      const scanFrame = document.querySelector('.scan-frame');
      const videoRect = video.getBoundingClientRect();
      const frameRect = scanFrame.getBoundingClientRect();
      const relX = (frameRect.left - videoRect.left) / videoRect.width;
      const relY = (frameRect.top - videoRect.top) / videoRect.height;
      const relW = frameRect.width / videoRect.width;
      const relH = frameRect.height / videoRect.height;
      const cropX = Math.max(0, relX * videoWidth);
      const cropY = Math.max(0, relY * videoHeight);
      const cropW = Math.min(videoWidth - cropX, relW * videoWidth);
      const cropH = Math.min(videoHeight - cropY, relH * videoHeight);

      let rot = 0;
      if (this.isMobile && this.captureOrientation.angle !== undefined) {
        switch (this.captureOrientation.angle) {
          case 90:  rot = -90; break;
          case -90: case 270: rot = 90; break;
          case 180: rot = 180; break;
        }
      }

      if (Math.abs(rot) === 90 || Math.abs(rot) === 270) { canvas.width = cropH; canvas.height = cropW; }
      else { canvas.width = cropW; canvas.height = cropH; }

      ctx.save();
      if (rot !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (Math.abs(rot) === 90 || Math.abs(rot) === 270) {
          ctx.drawImage(video, cropX, cropY, cropW, cropH, -cropH / 2, -cropW / 2, cropH, cropW);
        } else {
          ctx.drawImage(video, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
        }
      } else {
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      }
      ctx.restore();

      this.playShutterSound();
      this.showCaptureFlash();

      canvas.toBlob(blob => {
        this.capturedImage = blob;
        this.showImagePreview(blob);
      }, 'image/jpeg', 0.9);

    } catch (error) {
      this.isProcessing = false;
      this.setCameraButtonsEnabled(true);
      this.showError('Capture Error', 'Failed to capture photo: ' + error.message);
    }
  }

  showImagePreview(blob) {
    this.isProcessing = false;
    this.setCameraButtonsEnabled(true);
    this.currentRotation = 0;
    this.autoRotationApplied = 0;

    this.elements.previewTitle.textContent = 'Preview Image';
    this.elements.previewInstructionsText.textContent = 'Review your captured image. Is the text clear and readable?';
    this.elements.retakeText.textContent = 'Retake';
    this.elements.previewImage.style.display = 'block';
    this.elements.previewVideo.style.display = 'none';

    if (this.lastPreviewUrl) URL.revokeObjectURL(this.lastPreviewUrl);
    this.lastPreviewUrl = URL.createObjectURL(blob);
    this.elements.previewImage.src = this.lastPreviewUrl;
    this.showScreen('imagePreview');
  }

  /* ─── OCR Processing ─── */

  async handleOCRProcessing() {
    try {
      const oriented = await this.createRotatedMediaForOCR();
      if (this.recordedVideoBlob) {
        this.capturedImage = oriented;
        this.processVideoForOCR(oriented);
      } else if (this.capturedImage) {
        this.capturedImage = oriented;
        this.processImageWithOCR(oriented);
      } else {
        this.showError('Processing Error', 'No media to process');
      }
    } catch (err) {
      this.showError('Orientation Error', 'Failed to apply orientation: ' + err.message);
    }
  }

  async processImageWithOCR(blob) {
    this.isProcessing = true;
    this.showScreen('processing');

    try {
      this.capturedImage = blob;
      if (this.lastPreviewUrl) URL.revokeObjectURL(this.lastPreviewUrl);
      this.lastPreviewUrl = URL.createObjectURL(blob);
      this.elements.capturedPreview.src = this.lastPreviewUrl;

      const base64 = await this.blobToBase64(blob);
      const res = await this.callBackend({ action: 'ocr', image: base64 });

      this.isProcessing = false;
      this.setCameraButtonsEnabled(true);

      if (res.success) {
        this.chemicalInfo = res.data || {};
        this.elements.extractedText.value = res.text || res.json || '';
        this.showScreen('textReview');
      } else {
        this.showError('OCR Error', res.message || 'Failed to extract text from image');
      }
    } catch (err) {
      this.isProcessing = false;
      this.setCameraButtonsEnabled(true);
      this.showError('OCR Error', 'Failed to process image: ' + err.message);
    }
  }

  async processVideoForOCR(videoBlob) {
    this.isProcessing = true;
    this.showScreen('processing');

    try {
      if (!this.recordedVideoBlob) this.recordedVideoBlob = videoBlob;

      const frames = await this.extractFramesFromVideo(videoBlob, 3);
      if (!frames.length) throw new Error('No frames could be extracted');

      const frameImages = [];
      for (let i = 0; i < Math.min(frames.length, 3); i++) {
        frameImages.push(await this.blobToBase64(frames[i]));
      }

      if (this.lastPreviewUrl) URL.revokeObjectURL(this.lastPreviewUrl);
      this.lastPreviewUrl = URL.createObjectURL(frames[0]);
      this.elements.capturedPreview.src = this.lastPreviewUrl;

      const res = await this.callBackend({ action: 'ocrVideo', frames: frameImages });

      this.isProcessing = false;
      this.setCameraButtonsEnabled(true);

      if (res.success) {
        this.chemicalInfo = res.data || {};
        this.elements.extractedText.value = res.text || res.json || '';
        this.showScreen('textReview');
      } else {
        this.showError('Video Processing Error', res.message || 'Failed to process video');
      }
    } catch (err) {
      this.isProcessing = false;
      this.setCameraButtonsEnabled(true);
      this.showError('Video Processing Error', err.message);
    }
  }

  /* ─── Text → Data ─── */

  processText() {
    const txt = this.elements.extractedText.value.trim();
    if (!txt) { this.showError('Input Error', 'Please enter or edit the extracted text'); return; }

    if (this.chemicalInfo && Object.keys(this.chemicalInfo).length > 0) {
      this.populateDataForm(this.chemicalInfo, txt);
      this.showScreen('dataReview');
      return;
    }

    // Fallback parsing
    const fallback = this.parseChemicalInfoFallback(txt);
    this.chemicalInfo = fallback;
    this.populateDataForm(fallback, txt);
    this.showScreen('dataReview');
  }

  parseChemicalInfoFallback(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return {
      chemical_name: lines.find(line => line.length > 5 && /[A-Z]/.test(line)) || '',
      concentration: '', container_size: '', approximate_quantity: '',
      order_date: '', flinn_chemical_family: '', hazard_labels: '',
      hazard_classification_primary: '', hazard_classification_secondary: '',
      storage_room_number: '', cabinet_number: '', shelf_number: '',
      planned_disposal_year: '', notes: '', user_notes: '', marked_for_removal: false
    };
  }

  populateDataForm(info, rawText) {
    this.clearFieldErrors();
    const currentYear = new Date().getFullYear();
    const disposalYear = info.planned_disposal_year ? parseInt(info.planned_disposal_year) : null;

    if (this.elements.chemicalName)         this.elements.chemicalName.value = info.chemical_name || '';
    if (this.elements.concentration)        this.elements.concentration.value = info.concentration || '';
    if (this.elements.containerSize)        this.elements.containerSize.value = info.container_size || '';
    if (this.elements.approximateQuantity)  this.elements.approximateQuantity.value = info.approximate_quantity || info.container_size || '';
    if (this.elements.orderDate)            this.elements.orderDate.value = info.order_date || '';
    if (this.elements.flinnChemicalFamily)  this.elements.flinnChemicalFamily.value = info.flinn_chemical_family || '';
    if (this.elements.hazardLabels)         this.elements.hazardLabels.value = info.hazard_labels || '';
    if (this.elements.hazardClassificationPrimary)   this.elements.hazardClassificationPrimary.value = info.hazard_classification_primary || '';
    if (this.elements.hazardClassificationSecondary) this.elements.hazardClassificationSecondary.value = info.hazard_classification_secondary || '';
    if (this.elements.storageRoomNumber)    this.elements.storageRoomNumber.value = info.storage_room_number || '';
    if (this.elements.cabinetNumber)        this.elements.cabinetNumber.value = info.cabinet_number || '';
    if (this.elements.shelfNumber)          this.elements.shelfNumber.value = info.shelf_number || '';
    if (this.elements.plannedDisposalYear)  this.elements.plannedDisposalYear.value = info.planned_disposal_year || '';
    if (this.elements.notes)                this.elements.notes.value = info.notes || '';
    if (this.elements.userNotes)            this.elements.userNotes.value = info.user_notes || '';
    if (this.elements.markedForRemoval)     this.elements.markedForRemoval.checked = info.marked_for_removal === true || info.marked_for_removal === 'true' || (disposalYear && disposalYear <= currentYear);
    if (this.elements.processedText)        this.elements.processedText.value = rawText || '';

    this.validateAndHighlightEmptyFields();
  }

  validateAndHighlightEmptyFields() {
    const data = this._collectFormData();
    const emptyFields = this.getEmptyFields(data);
    if (emptyFields.length) this.highlightEmptyFields(emptyFields);
  }

  /* ─── Submit ─── */

  async submitData() {
    this.clearFieldErrors();
    const data = this._collectFormData();
    const emptyFields = this.getEmptyFields(data);
    if (emptyFields.length) this.highlightEmptyFields(emptyFields);

    if (!data.chemicalName || !data.chemicalName.trim()) {
      this.showError('Validation Error', 'Chemical Name is required to submit the data.');
      return;
    }

    this.showSpinner(true);

    try {
      const isVideo = this.recordedVideoBlob !== null;
      const orientedBlob = await this.createOrientedMediaForSaving();
      let mediaBase64 = '';
      if (orientedBlob) mediaBase64 = await this.blobToBase64(orientedBlob);

      const extractedData = {
        chemical_name: data.chemicalName,
        concentration: data.concentration,
        container_size: data.containerSize,
        approximate_quantity: data.approximateQuantity,
        order_date: data.orderDate,
        flinn_chemical_family: data.flinnChemicalFamily,
        hazard_labels: data.hazardLabels,
        hazard_classification_primary: data.hazardClassificationPrimary,
        hazard_classification_secondary: data.hazardClassificationSecondary,
        storage_room_number: data.storageRoomNumber,
        cabinet_number: data.cabinetNumber,
        shelf_number: data.shelfNumber,
        planned_disposal_year: data.plannedDisposalYear,
        notes: data.notes,
        user_notes: data.userNotes,
        marked_for_removal: data.markedForRemoval
      };

      const action = isVideo ? 'saveVideo' : 'save';
      const res = await this.callBackend({ action, media: mediaBase64, data: extractedData });

      this.showSpinner(false);
      if (res.success) {
        this.showScreen('success');
        this.cleanupCapture();
      } else {
        this.showError('Save Error', res.message || 'Failed to save data');
      }
    } catch (err) {
      this.showSpinner(false);
      this.showError('Save Error', 'Failed to save data: ' + err.message);
    }
  }

  _collectFormData() {
    return {
      chemicalName:                    (this.elements.chemicalName ? this.elements.chemicalName.value.trim() : ''),
      concentration:                   (this.elements.concentration ? this.elements.concentration.value.trim() : ''),
      containerSize:                   (this.elements.containerSize ? this.elements.containerSize.value.trim() : ''),
      approximateQuantity:             (this.elements.approximateQuantity ? this.elements.approximateQuantity.value.trim() : ''),
      orderDate:                       (this.elements.orderDate ? this.elements.orderDate.value.trim() : ''),
      flinnChemicalFamily:             (this.elements.flinnChemicalFamily ? this.elements.flinnChemicalFamily.value.trim() : ''),
      hazardLabels:                    (this.elements.hazardLabels ? this.elements.hazardLabels.value.trim() : ''),
      hazardClassificationPrimary:     (this.elements.hazardClassificationPrimary ? this.elements.hazardClassificationPrimary.value.trim() : ''),
      hazardClassificationSecondary:   (this.elements.hazardClassificationSecondary ? this.elements.hazardClassificationSecondary.value.trim() : ''),
      storageRoomNumber:               (this.elements.storageRoomNumber ? this.elements.storageRoomNumber.value.trim() : ''),
      cabinetNumber:                   (this.elements.cabinetNumber ? this.elements.cabinetNumber.value.trim() : ''),
      shelfNumber:                     (this.elements.shelfNumber ? this.elements.shelfNumber.value.trim() : ''),
      plannedDisposalYear:             (this.elements.plannedDisposalYear ? this.elements.plannedDisposalYear.value.trim() : ''),
      notes:                           (this.elements.notes ? this.elements.notes.value.trim() : ''),
      userNotes:                       (this.elements.userNotes ? this.elements.userNotes.value.trim() : ''),
      markedForRemoval:                (this.elements.markedForRemoval ? this.elements.markedForRemoval.checked : false),
      rawText:                         (this.elements.processedText ? this.elements.processedText.value.trim() : '')
    };
  }

  /* ─── Field Validation ─── */

  getEmptyFields(data) {
    const fields = {
      'Chemical Name': data.chemicalName, 'Concentration': data.concentration,
      'Container Size': data.containerSize, 'Approximate Quantity': data.approximateQuantity,
      'Order Date': data.orderDate, 'Flinn Chemical Family': data.flinnChemicalFamily,
      'Hazard Labels': data.hazardLabels, 'Hazard Classification (Primary)': data.hazardClassificationPrimary,
      'Hazard Classification (Secondary)': data.hazardClassificationSecondary,
      'Storage Room #': data.storageRoomNumber, 'Cabinet #': data.cabinetNumber,
      'Shelf #': data.shelfNumber, 'Planned Disposal Year': data.plannedDisposalYear,
      'Notes': data.notes, 'User Notes': data.userNotes
    };
    return Object.entries(fields).filter(([, v]) => !v || !v.trim()).map(([k]) => k);
  }

  highlightEmptyFields(names) {
    const map = {
      'Chemical Name': this.elements.chemicalName, 'Concentration': this.elements.concentration,
      'Container Size': this.elements.containerSize, 'Approximate Quantity': this.elements.approximateQuantity,
      'Order Date': this.elements.orderDate, 'Flinn Chemical Family': this.elements.flinnChemicalFamily,
      'Hazard Labels': this.elements.hazardLabels, 'Hazard Classification (Primary)': this.elements.hazardClassificationPrimary,
      'Hazard Classification (Secondary)': this.elements.hazardClassificationSecondary,
      'Storage Room #': this.elements.storageRoomNumber, 'Cabinet #': this.elements.cabinetNumber,
      'Shelf #': this.elements.shelfNumber, 'Planned Disposal Year': this.elements.plannedDisposalYear,
      'Notes': this.elements.notes, 'User Notes': this.elements.userNotes,
      'Raw Text': this.elements.processedText
    };
    names.forEach(name => {
      const el = map[name];
      if (!el) return;
      const group = el.closest('.form-group') || el.closest('.text-input-container');
      if (!group) return;
      group.classList.add('has-error', 'error');
      el.classList.add('empty-field');
      const remove = () => { group.classList.remove('has-error', 'error'); el.classList.remove('empty-field'); el.removeEventListener('input', remove); el.removeEventListener('focus', remove); };
      el.addEventListener('input', remove);
      el.addEventListener('focus', remove);
    });
  }

  clearFieldErrors() {
    document.querySelectorAll('.form-group, .text-input-container').forEach(g => g.classList.remove('has-error', 'error'));
    document.querySelectorAll('input, textarea').forEach(i => i.classList.remove('empty-field'));
  }

  /* ─── Screen navigation ─── */

  showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    this.screens[name].classList.add('active');
    this.currentScreen = name;
    if (name === 'dataReview') setTimeout(() => this.validateAndHighlightEmptyFields(), 100);
  }

  showError(title, msg) {
    this.elements.errorTitle.textContent = title;
    this.elements.errorMessage.textContent = msg;
    this.showScreen('error');
  }

  showToast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = { info: 'info-circle', success: 'check-circle', warning: 'exclamation-triangle', error: 'times-circle' };
    t.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${message}</span>`;
    this.elements.toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => { if (t.parentNode) t.remove(); }, 500); }, 3000);
  }

  showSpinner(show) { this.globalSpinner.classList.toggle('hidden', !show); }
  showStatsModal()  { this.elements.statsModal.style.display = 'flex'; }
  hideStatsModal()  { this.elements.statsModal.style.display = 'none'; }

  /* ─── Helpers ─── */

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  cleanupCapture() {
    if (this.lastPreviewUrl) { URL.revokeObjectURL(this.lastPreviewUrl); this.lastPreviewUrl = null; }
    this.capturedImage = null;
    this.recordedVideoBlob = null;
    this.videoPath = null;
    this.extractedTextFromVideo = null;
    this.mediaPath = null;
    this.actualRecordingDuration = null;
    this.recordingOrientation = null;
    this.captureOrientation = null;
    this.scanFrameInfo = null;
    this.currentRotation = 0;
    this.autoRotationApplied = 0;
    this.frameRotation = 0;
  }

  cleanupCamera() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.elements.video && this.elements.video.srcObject) this.elements.video.srcObject = null;
    this.flashEnabled = false;
    if (this.elements.flashBtn) this.elements.flashBtn.classList.remove('active');
    this.isProcessing = false;
  }

  /* ─── Flash & Focus ─── */

  toggleFlash() {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (track && track.getCapabilities && track.getCapabilities().torch) {
      this.flashEnabled = !this.flashEnabled;
      track.applyConstraints({ advanced: [{ torch: this.flashEnabled }] }).catch(() => this.showToast('Flash not available', 'warning'));
      this.elements.flashBtn.classList.toggle('active', this.flashEnabled);
    } else {
      this.showToast('Flash not available on this device', 'warning');
    }
  }

  focusCamera() {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (track && track.getCapabilities && track.getCapabilities().focusMode) {
      track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] }).then(() => {
        setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 1000);
      }).catch(() => {});
    }
  }

  /* ─── Orientation helpers ─── */

  handleOrientationChange() {
    if (this.currentScreen === 'camera' && this.elements.video) {
      setTimeout(() => {
        if (this.elements.video) { this.elements.video.style.height = 'auto'; this.elements.video.offsetHeight; this.elements.video.style.height = '100%'; }
        const controls = document.querySelector('.camera-controls');
        if (controls) { controls.style.transform = 'translateZ(0)'; this.ensureButtonsInteractive(); }
      }, 100);
    }
    if (this.currentScreen === 'imagePreview') {
      setTimeout(() => {
        const pc = document.querySelector('.preview-image-container');
        if (pc) pc.style.transform = 'translateZ(0)';
        const ab = document.querySelector('.action-bar');
        if (ab) ab.style.transform = 'translateZ(0)';
      }, 150);
    }
  }
  ensureButtonsInteractive() {
    document.querySelectorAll('.camera-control-btn, .capture-button, .mode-btn').forEach(b => { b.style.pointerEvents = 'auto'; b.style.touchAction = 'manipulation'; });
  }
  handleResize() {
    if (this.currentScreen === 'camera' && this.elements.video) { this.elements.video.style.height = 'auto'; this.elements.video.offsetHeight; this.elements.video.style.height = '100%'; }
    if (this.isMobile) { const vh = window.innerHeight * 0.01; document.documentElement.style.setProperty('--vh', `${vh}px`); }
  }

  /* ─── Shutter sound ─── */

  createShutterSound() {
    if (!this.elements.shutterSound) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const sr = ac.sampleRate, dur = 0.1, fc = sr * dur;
      const buf = ac.createBuffer(1, fc, sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < fc; i++) { const t = i / sr; ch[i] = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 50); }
      const wav = this.audioBufferToWav(buf);
      this.elements.shutterSound.src = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      this.elements.shutterSound.volume = 0.3;
    } catch (_) { /* ignore */ }
  }

  audioBufferToWav(buffer) {
    const len = buffer.length, ab = new ArrayBuffer(44 + len * 2), v = new DataView(ab), cd = buffer.getChannelData(0);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * 2, true);
    let off = 44;
    for (let i = 0; i < len; i++) { v.setInt16(off, Math.max(-1, Math.min(1, cd[i])) * 0x7FFF, true); off += 2; }
    return ab;
  }

  playShutterSound() {
    if (!this.elements.shutterSound) return;
    try { this.elements.shutterSound.currentTime = 0; this.elements.shutterSound.play().catch(() => {}); } catch (_) {}
  }

  showCaptureFlash() {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:9999;pointer-events:none;opacity:0.8;animation:cameraFlash .1s ease-out;';
    if (!document.querySelector('#flash-style')) {
      const s = document.createElement('style');
      s.id = 'flash-style';
      s.textContent = '@keyframes cameraFlash{0%{opacity:.8}50%{opacity:.9}100%{opacity:0}}';
      document.head.appendChild(s);
    }
    document.body.appendChild(flash);
    setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 150);
  }

  /* ─── Mode switching ─── */

  setPhotoMode(toast = false) {
    if (this.isRecording) return;
    this.isVideoMode = false;
    this.elements.modeToggleBtn.classList.remove('video-mode');
    this.elements.captureBtn.classList.remove('video-mode', 'recording');
    if (this.elements.modeToggleIcon) this.elements.modeToggleIcon.className = 'fas fa-video';
    if (this.elements.captureIcon) this.elements.captureIcon.className = 'fas fa-camera';
    this.elements.captureBtn.title = 'Take Photo';
    this.elements.modeToggleBtn.title = 'Switch to Video Mode';
    if (toast) this.showToast('Switched to Photo Mode', 'info');
  }

  setVideoMode(toast = false) {
    if (this.isRecording) return;
    const fmt = this.getSupportedVideoFormat();
    if (!fmt) { this.showToast('Video not supported on this device', 'error'); this.setPhotoMode(); return; }
    this.isVideoMode = true;
    this.elements.modeToggleBtn.classList.add('video-mode');
    this.elements.captureBtn.classList.add('video-mode');
    if (this.elements.modeToggleIcon) this.elements.modeToggleIcon.className = 'fas fa-camera';
    if (this.elements.captureIcon) this.elements.captureIcon.className = 'fas fa-video';
    this.elements.captureBtn.title = 'Record Video';
    this.elements.modeToggleBtn.title = 'Switch to Photo Mode';
    if (toast) this.showToast(`Switched to Video Mode (${fmt.includes('mp4') ? 'MP4' : 'WebM'})`, 'info');
  }

  toggleMode() {
    if (this.isRecording) return;
    if (!this.isVideoMode) {
      if (!window.MediaRecorder) { this.showToast('Video not supported', 'error'); return; }
      if (!this.getSupportedVideoFormat()) { this.showToast('Video not supported on this device', 'error'); return; }
    }
    this.isVideoMode = !this.isVideoMode;
    this.isVideoMode ? this.setVideoMode(true) : this.setPhotoMode(true);
  }

  handleCapture() {
    this.isVideoMode ? (this.isRecording ? this.stopRecording() : this.startRecording()) : this.capturePhoto();
  }

  /* ─── Video Recording ─── */

  async startRecording() {
    if (this.isRecording || !this.stream) return;
    try {
      this.isRecording = true;
      this.recordedChunks = [];
      this.recordingStartTime = Date.now();

      const scanFrame = document.querySelector('.scan-frame');
      const vRect = this.elements.video.getBoundingClientRect();
      const fRect = scanFrame.getBoundingClientRect();
      this.scanFrameInfo = {
        relativeX: (fRect.left - vRect.left) / vRect.width,
        relativeY: (fRect.top - vRect.top) / vRect.height,
        relativeWidth: fRect.width / vRect.width,
        relativeHeight: fRect.height / vRect.height
      };
      this.recordingOrientation = {
        angle: screen.orientation ? screen.orientation.angle : window.orientation || 0,
        type: screen.orientation ? screen.orientation.type : 'unknown',
        isPortrait: window.innerHeight > window.innerWidth,
        deviceWidth: window.innerWidth, deviceHeight: window.innerHeight,
        videoWidth: this.elements.video.videoWidth, videoHeight: this.elements.video.videoHeight,
        timestamp: Date.now()
      };

      const mimeType = this.getSupportedVideoFormat();
      if (!mimeType) throw new Error('Video recording not supported on this device');
      const opts = { mimeType, videoBitsPerSecond: 2500000 };
      this.mediaRecorder = new MediaRecorder(this.stream, opts);
      this.recordingMimeType = opts.mimeType;

      this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
      this.mediaRecorder.onstop = () => { this.processRecordedVideo(new Blob(this.recordedChunks, { type: this.recordingMimeType })); };
      this.mediaRecorder.start();

      this.elements.captureBtn.classList.add('recording');
      this.elements.recordingTimer.style.display = 'flex';
      if (this.elements.captureIcon) this.elements.captureIcon.className = 'fas fa-stop';
      this.startRecordingTimer();
      setTimeout(() => { if (this.isRecording) this.stopRecording(); }, this.maxRecordingDuration + 1000);
    } catch (err) {
      this.isRecording = false;
      this.showError('Recording Error', err.message);
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.isRecording = false;
    if (this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
    this.elements.captureBtn.classList.remove('recording');
    this.elements.recordingTimer.style.display = 'none';
    if (this.elements.captureIcon) this.elements.captureIcon.className = 'fas fa-video';
    this.stopRecordingTimer();
  }

  startRecordingTimer() {
    this.recordingTimer = setInterval(() => { this.updateVisualCountdown(Date.now() - this.recordingStartTime); }, 100);
  }
  updateVisualCountdown(elapsed) {
    const rem = Math.ceil((this.maxRecordingDuration - elapsed) / 1000);
    if (rem > 0 && rem <= 5) this.elements.timerText.textContent = rem.toString();
    else if (rem <= 0) this.elements.timerText.textContent = '0';
    else { const s = Math.floor(elapsed / 1000), cs = Math.floor((elapsed % 1000) / 10); this.elements.timerText.textContent = `${s}:${cs.toString().padStart(2, '0')}`; }
  }
  stopRecordingTimer() { if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; } }

  async processRecordedVideo(blob) {
    this.recordedVideoBlob = blob;
    this.showVideoPreview(blob);
  }

  showVideoPreview(videoBlob) {
    this.isProcessing = false;
    this.setCameraButtonsEnabled(true);
    this.currentRotation = 0;
    this.autoRotationApplied = 0;

    this.elements.previewTitle.textContent = 'Preview Video';
    this.elements.previewInstructionsText.textContent = 'Review your recorded video. Is the content clear and readable?';
    this.elements.retakeText.textContent = 'Retake';
    this.elements.previewImage.style.display = 'none';
    this.elements.previewVideo.style.display = 'block';

    if (this.lastPreviewUrl) URL.revokeObjectURL(this.lastPreviewUrl);
    this.lastPreviewUrl = URL.createObjectURL(videoBlob);
    this.elements.previewVideo.src = this.lastPreviewUrl;
    this.elements.previewVideo.style.transform = 'none';
    this.elements.previewVideo.style.objectFit = 'contain';
    this.elements.previewVideo.style.width = '100%';
    this.elements.previewVideo.style.height = 'auto';
    this.elements.previewVideo.style.maxHeight = '70vh';

    this.elements.previewVideo.addEventListener('loadedmetadata', () => {
      const vw = this.elements.previewVideo.videoWidth, vh = this.elements.previewVideo.videoHeight;
      const isP = vh > vw, wasP = this.recordingOrientation && this.recordingOrientation.isPortrait;
      if (isP || wasP) { this.elements.previewVideo.style.maxWidth = '60vw'; this.elements.previewVideo.style.maxHeight = '80vh'; }
      else { this.elements.previewVideo.style.maxWidth = '90vw'; this.elements.previewVideo.style.maxHeight = '70vh'; }
      this.elements.previewVideo.style.width = 'auto';
      this.elements.previewVideo.style.height = 'auto';

      if (this.scanFrameInfo && this.scanFrameInfo.relativeWidth < 1 && this.scanFrameInfo.relativeHeight < 1) {
        const l = Math.max(0, this.scanFrameInfo.relativeX * 100);
        const t = Math.max(0, this.scanFrameInfo.relativeY * 100);
        const r = Math.min(100, l + this.scanFrameInfo.relativeWidth * 100);
        const b = Math.min(100, t + this.scanFrameInfo.relativeHeight * 100);
        this.elements.previewVideo.style.clipPath = `inset(${t}% ${100 - r}% ${100 - b}% ${l}%)`;
      } else {
        this.elements.previewVideo.style.clipPath = 'none';
      }
    }, { once: true });

    this.showScreen('imagePreview');
  }

  /* ─── Frame extraction ─── */

  async extractFramesFromVideo(videoBlob, maxFrames = 3) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frames = [];

      video.onloadedmetadata = () => {
        let duration = video.duration;
        if (this.actualRecordingDuration && Math.abs(this.actualRecordingDuration - duration) > 0.5) duration = Math.min(this.actualRecordingDuration, video.duration);
        duration = Math.max(0.5, Math.min(duration, 10));
        let frameCount = Math.min(maxFrames || 3, Math.ceil(duration));
        const interval = duration / frameCount;

        let sX = 0, sY = 0, sW = video.videoWidth, sH = video.videoHeight;
        if (this.scanFrameInfo && this.scanFrameInfo.relativeWidth < 1 && this.scanFrameInfo.relativeHeight < 1) {
          sX = Math.max(0, Math.floor(this.scanFrameInfo.relativeX * video.videoWidth));
          sY = Math.max(0, Math.floor(this.scanFrameInfo.relativeY * video.videoHeight));
          sW = Math.min(video.videoWidth - sX, Math.floor(this.scanFrameInfo.relativeWidth * video.videoWidth));
          sH = Math.min(video.videoHeight - sY, Math.floor(this.scanFrameInfo.relativeHeight * video.videoHeight));
        }
        sW = Math.max(100, sW); sH = Math.max(100, sH);

        let autoRot = 0;
        if (this.recordingOrientation && this.isMobile) {
          switch (this.recordingOrientation.angle) {
            case 90: autoRot = -90; break;
            case -90: case 270: autoRot = 90; break;
            case 180: autoRot = 180; break;
          }
        }
        const totalRot = autoRot + (this.frameRotation || 0);

        if (Math.abs(totalRot) === 90 || Math.abs(totalRot) === 270) { canvas.width = sH; canvas.height = sW; }
        else { canvas.width = sW; canvas.height = sH; }

        let cur = 0, extractionTimeout;
        const extract = () => {
          if (extractionTimeout) clearTimeout(extractionTimeout);
          if (cur >= frameCount) { resolve(frames); return; }
          const t = Math.min(cur * interval + 0.1, duration - 0.1);
          extractionTimeout = setTimeout(() => { cur++; extract(); }, 5000);
          video.currentTime = t;
        };
        video.onseeked = () => {
          try {
            if (extractionTimeout) clearTimeout(extractionTimeout);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (totalRot && totalRot !== 0) {
              ctx.save();
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((totalRot * Math.PI) / 180);
              if (Math.abs(totalRot) === 90 || Math.abs(totalRot) === 270) {
                ctx.drawImage(video, sX, sY, sW, sH, -sH / 2, -sW / 2, sH, sW);
              } else {
                ctx.drawImage(video, sX, sY, sW, sH, -sW / 2, -sH / 2, sW, sH);
              }
              ctx.restore();
            } else {
              ctx.drawImage(video, sX, sY, sW, sH, 0, 0, canvas.width, canvas.height);
            }
            canvas.toBlob(blob => { if (blob && blob.size > 0) frames.push(blob); cur++; setTimeout(extract, 100); }, 'image/jpeg', 0.8);
          } catch (_) { cur++; setTimeout(extract, 100); }
        };
        video.onerror = () => { if (extractionTimeout) clearTimeout(extractionTimeout); cur++; if (cur < frameCount) setTimeout(extract, 100); else resolve(frames); };
        extract();
      };
      video.onerror = () => reject(new Error('Failed to load video for frame extraction'));
      video.src = URL.createObjectURL(videoBlob);
      video.load();
      setTimeout(() => { if (!frames.length) reject(new Error('Frame extraction timed out')); }, 30000);
    });
  }

  /* ─── Rotation / Orientation ─── */

  rotatePreview() {
    const media = this.elements.previewImage.style.display !== 'none' ? this.elements.previewImage : this.elements.previewVideo;
    if (!media || media.style.display === 'none') return;
    const wasPlaying = media.tagName === 'VIDEO' && !media.paused;
    if (wasPlaying) media.pause();
    this.currentRotation = (this.currentRotation + 90) % 360;
    const total = this.autoRotationApplied + this.currentRotation;
    this.applyRotationTransform(media, total);
    if (wasPlaying) setTimeout(() => media.play().catch(() => {}), 300);
    this.showToast(`Rotated ${this.currentRotation}\u00B0`, 'info');
  }

  applyRotationTransform(el, rot) {
    el.style.transform = `rotate(${rot}deg)`;
    if (Math.abs(rot) === 90 || Math.abs(rot) === 270) { el.style.maxWidth = '80vh'; el.style.maxHeight = '90vw'; }
    else {
      if (el.tagName === 'VIDEO') {
        const p = el.videoHeight > el.videoWidth;
        el.style.maxWidth = p ? '60vw' : '90vw';
        el.style.maxHeight = p ? '80vh' : '70vh';
      } else { el.style.maxWidth = '100%'; el.style.maxHeight = '70vh'; }
    }
  }

  async createRotatedMediaForOCR() {
    const isVideo = this.recordedVideoBlob !== null;
    const total = this.autoRotationApplied + this.currentRotation;
    if (total === 0) return isVideo ? this.recordedVideoBlob : this.capturedImage;
    if (isVideo) { this.frameRotation = total; return this.recordedVideoBlob; }
    return this.createRotatedImage(this.capturedImage, total);
  }

  async createOrientedMediaForSaving() {
    const isVideo = this.recordedVideoBlob !== null;
    if (this.currentRotation === 0) return isVideo ? this.recordedVideoBlob : this.capturedImage;
    if (isVideo) { this.frameRotation = this.currentRotation; return this.recordedVideoBlob; }
    return this.createRotatedImage(this.capturedImage, this.currentRotation);
  }

  async createRotatedImage(imageBlob, rotation) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'), ctx = c.getContext('2d');
          const rad = (rotation * Math.PI) / 180;
          const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
          c.width = img.width * cos + img.height * sin;
          c.height = img.width * sin + img.height * cos;
          ctx.translate(c.width / 2, c.height / 2);
          ctx.rotate(rad);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          c.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to create rotated blob')), 'image/jpeg', 0.9);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Failed to load image for rotation'));
      img.src = URL.createObjectURL(imageBlob);
    });
  }

  /* ─── Touch handlers ─── */

  handleVideoTouch(e) { e.stopPropagation(); this.focusCamera(); }
  handleCameraOverlayTouch(e) {
    if (!e.target.closest('.camera-controls') && !e.target.closest('.camera-buttons')) { e.stopPropagation(); this.focusCamera(); }
  }
}

/* ─── Boot ─── */
let appInstance;
document.addEventListener('DOMContentLoaded', () => { appInstance = new OCRScannerApp(); });
