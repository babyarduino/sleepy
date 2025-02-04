const fileInput = document.querySelector("#file-input");
const previewContainer = document.querySelector(".preview-container");
const uploadBox = document.querySelector(".upload-box");
const browseText = uploadBox.querySelector("p");
const browseImage = uploadBox.querySelector("img");

// Define resolutions (unchanged)
const RESOLUTIONS = [500, 112, 56, 28];
// Keep track of all files
let allFiles = [];

// Handle file selection
fileInput.addEventListener("change", (e) => {
  const newFiles = Array.from(e.target.files);
  
  // Add new files to existing collection
  allFiles = [...allFiles, ...newFiles];
  
  // Clear only the download button if it exists
  const existingButton = previewContainer.querySelector('.download-all-btn');
  if (existingButton) {
    existingButton.remove();
  }

  // Hide browse elements if files are selected
  browseText.style.display = allFiles.length ? "none" : "block";
  browseImage.style.display = allFiles.length ? "none" : "block";

  if (allFiles.length > 0) {
    // Add/Update download all button
    const downloadAllBtn = document.createElement("button");
    downloadAllBtn.textContent = `Download All (${allFiles.length} files in ${RESOLUTIONS.join(', ')}px)`;
    downloadAllBtn.classList.add("download-all-btn");
    downloadAllBtn.addEventListener("click", () => downloadAllAsZip(allFiles));
    previewContainer.appendChild(downloadAllBtn);
  }

  // Only show previews for new files
  newFiles.forEach(file => {
    showPreview(file);
  });
});

// Show preview of uploaded file
function showPreview(file) {
  if (!file.type.startsWith('image/')) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const imgContainer = document.createElement("div");
    imgContainer.classList.add("image-container");

    const thumbnailWrapper = document.createElement("div");
    thumbnailWrapper.classList.add("thumbnail-wrapper");

    const img = document.createElement("img");
    img.src = e.target.result;
    img.classList.add("thumbnail");
    img.dataset.originalName = file.name;

    const fileName = document.createElement("p");
    fileName.classList.add("file-name");
    fileName.title = file.name;
    const truncatedName = file.name.length > 15 
      ? file.name.substring(0, 12) + '...' 
      : file.name;
    fileName.textContent = truncatedName;

    // Add remove button
    const removeBtn = document.createElement("button");
    removeBtn.classList.add("remove-btn");
    removeBtn.innerHTML = "×";
    removeBtn.title = "Remove image";
    removeBtn.onclick = (e) => {
      e.stopPropagation(); // Prevent upload box click
      allFiles = allFiles.filter(f => f !== file);
      imgContainer.remove();
      
      // Update or remove download button
      const downloadBtn = previewContainer.querySelector('.download-all-btn');
      if (allFiles.length > 0) {
        downloadBtn.textContent = `Download All (${allFiles.length} files in ${RESOLUTIONS.join(', ')})`;
      } else {
        downloadBtn?.remove();
        browseText.style.display = "block";
        browseImage.style.display = "block";
      }
    };

    imgContainer.appendChild(removeBtn);
    thumbnailWrapper.appendChild(img);
    imgContainer.appendChild(thumbnailWrapper);
    imgContainer.appendChild(fileName);
    previewContainer.appendChild(imgContainer);
  };
  reader.readAsDataURL(file);
}

// Function to download all images as a ZIP file
async function downloadAllAsZip(files, includeOriginal = false) {
  const zip = new JSZip();
  const loadingText = document.createElement("div");
  loadingText.classList.add("loading-text");
  previewContainer.appendChild(loadingText);

  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      const filename = file.name.replace(/\.[^/.]+$/, "");
      loadingText.textContent = `Processing ${filename}...`;

      // Create a folder for the current image based on the filename
      const fileFolder = zip.folder(filename);

      if (file.type === 'image/gif') {
        // Handle GIF resizing
        await resizeGif(file, filename, fileFolder);
      } else {
        // Handle static images (PNG/JPG)
        await processStaticImage(file, filename, fileFolder);
      }
    }

    loadingText.textContent = 'Creating ZIP file...';
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "resized-images.zip";
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    loadingText.textContent = 'Download complete!';
  } catch (error) {
    console.error("Error processing images:", error);
    loadingText.textContent = `Error: ${error.message}`;
  } finally {
    setTimeout(() => loadingText.remove(), 2000);
  }
}

// Process static images (PNG/JPG)
async function processStaticImage(file, filename, fileFolder) {
  const img = new Image();
  await new Promise(resolve => {
    img.onload = resolve;
    img.src = URL.createObjectURL(file);
  });

  for (const size of RESOLUTIONS) {
    // Create intermediate canvas for better downscaling
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d", { alpha: true });
    
    // Use larger intermediate size for better quality
    const intermediateSize = size * 2;
    tempCanvas.width = intermediateSize;
    tempCanvas.height = intermediateSize;
    
    // Apply high-quality settings
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    
    // First pass: scale to intermediate size
    tempCtx.drawImage(img, 0, 0, intermediateSize, intermediateSize);

    // Final canvas for output
    const finalCanvas = document.createElement("canvas");
    const finalCtx = finalCanvas.getContext("2d", { alpha: true });
    finalCanvas.width = size;
    finalCanvas.height = size;
    
    // Apply high-quality settings again
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';
    
    // Second pass: scale to final size
    finalCtx.drawImage(tempCanvas, 0, 0, size, size);

    // Convert to high-quality PNG
    const blob = await new Promise(resolve => 
      finalCanvas.toBlob(resolve, "image/png", 1.0)
    );
    
    fileFolder.file(`${filename}_${size}px.png`, blob);
  }
  URL.revokeObjectURL(img.src);
}

// Handle GIF resizing
async function resizeGif(file, filename, fileFolder) {
  const gif = await createGifFromFile(file);

  for (const size of RESOLUTIONS) {
    const resizedGifBlob = await resizeGifToSize(gif, size);
    // Add resized GIF to the folder
    fileFolder.file(`${filename}_${size}px.gif`, resizedGifBlob);
  }
}

// Create a GIF object
async function createGifFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Resize GIF to a specific size
async function resizeGifToSize(gif, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; // Enable smoothing for better image quality
  ctx.imageSmoothingQuality = 'high'; // Set smoothing quality to 'high' for better results
  ctx.drawImage(gif, 0, 0, gif.width, gif.height, 0, 0, size, size);

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/gif");
  });
}

// Trigger file input when upload box is clicked
uploadBox.addEventListener("click", () => {
  fileInput.click();
});
