document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  
  const resizeWidth = document.getElementById('resize-width');
  const resizeHeight = document.getElementById('resize-height');
  const lockAspect = document.getElementById('lock-aspect');
  const outputFormat = document.getElementById('output-format');
  const outputQuality = document.getElementById('output-quality');
  
  const totalCountEl = document.getElementById('total-count');
  const selectedCountEl = document.getElementById('selected-count');
  
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDeselectAll = document.getElementById('btn-deselect-all');
  const btnResizeDownload = document.getElementById('btn-resize-download');
  
  const galleryEmpty = document.getElementById('gallery-empty');
  const galleryLoading = document.getElementById('gallery-loading');
  const galleryGrid = document.getElementById('gallery-grid');
  
  const progressModal = document.getElementById('progress-modal');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressPercentage = document.getElementById('progress-percentage');
  const processingLog = document.getElementById('processing-log');

  // Filter DOM Elements
  const filterBar = document.getElementById('filter-bar');
  const filterText = document.getElementById('filter-text');
  const filterResolution = document.getElementById('filter-resolution');
  const filterMinW = document.getElementById('filter-min-w');
  const filterMinH = document.getElementById('filter-min-h');

  // App State
  let imagesList = [];
  let selectedIndices = new Set();
  let queryKeyword = '';

  // Helper to filter search results based on UI controls
  function getFilteredImages() {
    if (imagesList.length === 0) return [];
    
    const textQuery = filterText.value.toLowerCase().trim();
    const resolutionPreset = filterResolution.value;
    const minW = parseInt(filterMinW.value) || 0;
    const minH = parseInt(filterMinH.value) || 0;

    return imagesList.map((img, idx) => ({ data: img, originalIndex: idx }))
      .filter(({ data }) => {
        // Text search filter (title or image source domain)
        if (textQuery) {
          const titleMatch = data.title.toLowerCase().includes(textQuery);
          const domainMatch = data.image.toLowerCase().includes(textQuery);
          if (!titleMatch && !domainMatch) return false;
        }

        // Resolution preset filter
        if (resolutionPreset === '4k' && (data.width < 3840 && data.height < 2160)) return false;
        if (resolutionPreset === 'fullhd' && (data.width < 1920 && data.height < 1080)) return false;
        if (resolutionPreset === 'hd' && (data.width < 1280 && data.height < 720)) return false;
        if (resolutionPreset === 'medium' && (data.width < 800 && data.height < 600)) return false;
        if (resolutionPreset === 'small' && (data.width >= 800 || data.height >= 800)) return false;

        // Custom min width & height filters
        if (minW > 0 && data.width < minW) return false;
        if (minH > 0 && data.height < minH) return false;

        return true;
      });
  }

  // Handle Search Submission
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    queryKeyword = query;
    // Reset selection and gallery
    imagesList = [];
    selectedIndices.clear();
    updateUIStats();
    
    // Toggle loading UI
    galleryEmpty.classList.add('hidden');
    galleryGrid.classList.add('hidden');
    galleryLoading.classList.remove('hidden');
    
    // Disable inputs
    searchButton.disabled = true;
    searchInput.disabled = true;

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Đã có lỗi xảy ra khi tìm kiếm ảnh.');
      }
      
      const data = await response.json();
      imagesList = data.results || [];
      
      renderGallery();
    } catch (err) {
      console.error(err);
      showGalleryError(err.message);
    } finally {
      searchButton.disabled = false;
      searchInput.disabled = false;
    }
  });

  // Render Gallery Grid
  function renderGallery(resetFilters = true) {
    galleryLoading.classList.add('hidden');
    
    if (imagesList.length === 0) {
      filterBar.classList.add('hidden');
      galleryEmpty.classList.remove('hidden');
      galleryEmpty.querySelector('p').textContent = 'Không tìm thấy hình ảnh nào phù hợp. Hãy thử từ khóa khác.';
      galleryGrid.classList.add('hidden');
      
      btnSelectAll.disabled = true;
      btnDeselectAll.disabled = true;
      btnResizeDownload.disabled = true;
      return;
    }

    if (resetFilters) {
      filterText.value = '';
      filterResolution.value = 'all';
      filterMinW.value = '';
      filterMinH.value = '';
    }

    const visibleImages = getFilteredImages();
    galleryGrid.innerHTML = '';

    if (visibleImages.length === 0) {
      filterBar.classList.remove('hidden');
      galleryGrid.classList.add('hidden');
      galleryEmpty.classList.remove('hidden');
      galleryEmpty.querySelector('p').textContent = 'Không có hình ảnh nào thỏa mãn bộ lọc hiện tại.';
      
      btnSelectAll.disabled = true;
      btnDeselectAll.disabled = true;
      return;
    }

    galleryEmpty.classList.add('hidden');
    filterBar.classList.remove('hidden');
    galleryGrid.classList.remove('hidden');

    visibleImages.forEach(({ data: img, originalIndex: idx }) => {
      const card = document.createElement('div');
      card.className = `image-card ${selectedIndices.has(idx) ? 'selected' : ''}`;
      card.dataset.index = idx;

      // Extract hostname for display
      let domain = '';
      try {
        domain = new URL(img.image).hostname.replace('www.', '');
      } catch (e) {
        domain = 'Nguồn ảnh';
      }

      // Checkbox SVG icon
      const checkIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      `;

      card.innerHTML = `
        <img src="${img.thumbnail}" alt="${img.title || 'Image'}" loading="lazy">
        <div class="card-overlay"></div>
        <div class="card-checkbox">${checkIcon}</div>
        <div class="card-info">
          <span class="info-badge source" title="${img.title}">${domain}</span>
          <span class="info-badge dimensions">${img.width}x${img.height}</span>
        </div>
      `;

      // Card click toggles checkbox selection
      card.addEventListener('click', () => {
        toggleImageSelection(idx, card);
      });

      galleryGrid.appendChild(card);
    });

    totalCountEl.textContent = imagesList.length;
    btnSelectAll.disabled = false;
    btnDeselectAll.disabled = false;
    updateUIStats();
  }

  // Handle Gallery error state
  function showGalleryError(message) {
    filterBar.classList.add('hidden');
    galleryLoading.classList.add('hidden');
    galleryGrid.classList.add('hidden');
    galleryEmpty.classList.remove('hidden');
    galleryEmpty.querySelector('p').textContent = message || 'Có lỗi xảy ra. Hãy tải lại trang hoặc thử lại.';
  }

  // Toggle selection for a single card
  function toggleImageSelection(index, cardElement) {
    if (selectedIndices.has(index)) {
      selectedIndices.delete(index);
      cardElement.classList.remove('selected');
    } else {
      selectedIndices.add(index);
      cardElement.classList.add('selected');
    }
    updateUIStats();
  }

  // Update Statistics and button states
  function updateUIStats() {
    selectedCountEl.textContent = selectedIndices.size;
    btnResizeDownload.disabled = selectedIndices.size === 0;
  }

  // Select All button action (only selects currently visible images)
  btnSelectAll.addEventListener('click', () => {
    const visibleImages = getFilteredImages();
    visibleImages.forEach(({ originalIndex }) => {
      selectedIndices.add(originalIndex);
    });
    renderGallery(false);
  });

  // Deselect All button action (only deselects currently visible images)
  btnDeselectAll.addEventListener('click', () => {
    const visibleImages = getFilteredImages();
    visibleImages.forEach(({ originalIndex }) => {
      selectedIndices.delete(originalIndex);
    });
    renderGallery(false);
  });

  // Filter Event Listeners
  filterText.addEventListener('input', () => renderGallery(false));
  filterResolution.addEventListener('change', () => renderGallery(false));
  filterMinW.addEventListener('input', () => renderGallery(false));
  filterMinH.addEventListener('input', () => renderGallery(false));

  // Input listeners for Width / Height to handle aspect ratio lock preview
  // Wait, we don't need real-time preview modifications on the input since different images
  // have different aspect ratios. But we can adjust one input if there's at least one selected image.
  // We will let the user enter target box dimensions, and apply ratio-preserving fit during the download.

  // Resize & Download Logic
  btnResizeDownload.addEventListener('click', async () => {
    if (selectedIndices.size === 0) return;

    // Show modal
    progressModal.classList.remove('hidden');
    processingLog.innerHTML = '';
    updateProgress(0, selectedIndices.size);

    const zip = new JSZip();
    const targetW = parseInt(resizeWidth.value) || 1080;
    const targetH = parseInt(resizeHeight.value) || 1080;
    const keepAspect = lockAspect.checked;
    const format = outputFormat.value;
    const quality = parseFloat(outputQuality.value) || 0.9;
    
    // File extension mapping
    let ext = 'jpg';
    if (format === 'image/png') ext = 'png';
    else if (format === 'image/webp') ext = 'webp';

    const selectedArray = Array.from(selectedIndices);
    let successCount = 0;

    logMessage('Bắt đầu tải và xử lý hình ảnh...', 'info');

    for (let i = 0; i < selectedArray.length; i++) {
      const idx = selectedArray[i];
      const imgData = imagesList[idx];
      const countLabel = `[${i + 1}/${selectedArray.length}]`;
      
      logMessage(`${countLabel} Đang tải: ${imgData.title.substring(0, 40)}...`, 'info');

      try {
        // Step 1: Fetch through our server's CORS proxy
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(imgData.image)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) {
          throw new Error(`Proxy trả về lỗi HTTP ${res.status}`);
        }
        
        const blob = await res.blob();
        
        // Step 2: Load into HTML Image
        const imgObj = await loadImage(blob);

        // Step 3: Compute Resized Dimensions
        let w = targetW;
        let h = targetH;
        
        if (keepAspect) {
          const originalRatio = imgObj.naturalWidth / imgObj.naturalHeight;
          const targetRatio = targetW / targetH;
          
          if (originalRatio > targetRatio) {
            // Image is wider than target ratio
            w = targetW;
            h = Math.round(targetW / originalRatio);
          } else {
            // Image is taller than target ratio
            h = targetH;
            w = Math.round(targetH * originalRatio);
          }
        }

        // Step 4: Resize via Canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        // Apply high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.drawImage(imgObj, 0, 0, w, h);

        // Step 5: Convert Canvas to Blob
        const resizedBlob = await getCanvasBlob(canvas, format, quality);

        // Step 6: Add to ZIP
        const fileName = `${queryKeyword.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${i + 1}_${w}x${h}.${ext}`;
        zip.file(fileName, resizedBlob);

        successCount++;
        logMessage(`${countLabel} Thành công (${w}x${h})`, 'success');
      } catch (err) {
        console.error(err);
        logMessage(`${countLabel} Thất bại: ${err.message}`, 'error');
      }

      updateProgress(i + 1, selectedArray.length);
    }

    if (successCount === 0) {
      logMessage('Không có hình ảnh nào được xử lý thành công.', 'error');
      setTimeout(() => {
        progressModal.classList.add('hidden');
        alert('Tải ảnh thất bại. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại với các ảnh khác.');
      }, 2000);
      return;
    }

    // Step 7: Generate ZIP and download
    logMessage('Đang nén file ZIP...', 'info');
    try {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${queryKeyword.replace(/\s+/g, '_')}_resized_images.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logMessage('Đã tải xuống file ZIP thành công!', 'success');
    } catch (err) {
      logMessage(`Lỗi khi tạo file nén: ${err.message}`, 'error');
    }

    // Hide modal after delay
    setTimeout(() => {
      progressModal.classList.add('hidden');
    }, 2500);
  });

  // Utility: Load file blob into an image object
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Lỗi load file ảnh vào bộ nhớ trình duyệt'));
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  // Utility: Convert Canvas to Blob
  function getCanvasBlob(canvas, format, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, format, quality);
    });
  }

  // Utility: Update progress bar in modal
  function updateProgress(current, total) {
    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${current} / ${total} ảnh`;
    progressPercentage.textContent = `${percentage}%`;
  }

  // Utility: Add log message in progress modal
  function logMessage(text, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `
      <span>[${time}] ${text}</span>
    `;
    processingLog.appendChild(entry);
    processingLog.scrollTop = processingLog.scrollHeight;
  }
});
