/**
 * imageLoader.js - Premium Image Loading Utility
 * Features:
 *   ✓ Converts relative URLs to absolute
 *   ✓ Handles CORS for canvas drawing
 *   ✓ Fallback image support
 *   ✓ Image optimization
 *   ✓ Error handling with retries
 */

/**
 * Get full image URL from relative or absolute path
 * @param {string} imagePath - Relative or absolute image path
 * @param {string} baseUrl - Optional base URL (defaults to window.location.origin)
 * @returns {string} Full image URL
 */
export function getFullImageUrl(imagePath, baseUrl = null) {
    if (!imagePath) return null;
  
    // Already a full URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
  
    // Use provided base URL or window location
    const base = baseUrl || window.location.origin;
    
    // Add leading slash if missing
    const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
    
    return `${base}${path}`;
  }
  
  /**
   * Load image for canvas drawing
   * @param {string} src - Image source (relative or absolute URL)
   * @param {Object} options - Loading options
   * @returns {Promise<HTMLImageElement>} Loaded image
   */
  export async function loadImageForCanvas(src, options = {}) {
    const {
      maxRetries = 2,
      timeout = 10000,
      crossOrigin = 'anonymous',
    } = options;
  
    if (!src) {
      throw new Error('No image source provided');
    }
  
    const fullUrl = getFullImageUrl(src);
    let lastError = null;
  
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await loadImage(fullUrl, { timeout, crossOrigin });
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
    }
  
    throw new Error(`Failed to load image after ${maxRetries + 1} attempts: ${fullUrl}`);
  }
  
  /**
   * Internal image loading function
   * @private
   */
  function loadImage(src, { timeout = 10000, crossOrigin = 'anonymous' }) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      // Set CORS attribute for canvas drawing
      img.crossOrigin = crossOrigin;
      
      // Setup timeout
      const timeoutId = setTimeout(() => {
        img.src = ''; // Cancel loading
        reject(new Error(`Image loading timeout (${timeout}ms)`));
      }, timeout);
      
      // Success handler
      img.onload = () => {
        clearTimeout(timeoutId);
        resolve(img);
      };
      
      // Error handler
      img.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to load image from: ${src}`));
      };
      
      // Start loading
      img.src = src;
    });
  }
  
  /**
   * Load image with fallback
   * @param {string} src - Primary image source
   * @param {string} fallbackSrc - Fallback image source
   * @returns {Promise<HTMLImageElement>}
   */
  export async function loadImageWithFallback(src, fallbackSrc) {
    try {
      return await loadImageForCanvas(src);
    } catch (primaryError) {
      console.warn('Primary image failed, trying fallback:', primaryError);
      
      if (!fallbackSrc) {
        throw primaryError;
      }
      
      try {
        return await loadImageForCanvas(fallbackSrc);
      } catch (fallbackError) {
        console.error('Both images failed:', { primaryError, fallbackError });
        throw fallbackError;
      }
    }
  }
  
  /**
   * Pre-load multiple images in parallel
   * @param {string[]} sources - Array of image sources
   * @returns {Promise<HTMLImageElement[]>}
   */
  export async function preloadImages(sources) {
    return Promise.allSettled(
      sources.map(src => loadImageForCanvas(src))
    ).then(results =>
      results
        .map((result, i) => {
          if (result.status === 'fulfilled') return result.value;
          console.warn(`Failed to preload image ${i}:`, result.reason);
          return null;
        })
        .filter(Boolean)
    );
  }
  
  /**
   * Optimize image for canvas (resize if too large)
   * @param {HTMLImageElement} img - Source image
   * @param {number} maxWidth - Maximum width
   * @param {number} maxHeight - Maximum height
   * @returns {HTMLCanvasElement} Optimized image canvas
   */
  export function optimizeImageForCanvas(img, maxWidth = 2000, maxHeight = 2000) {
    let { width, height } = img;
    
    if (width <= maxWidth && height <= maxHeight) {
      return img; // Already optimal
    }
    
    // Calculate new dimensions
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    const newWidth = Math.round(width * ratio);
    const newHeight = Math.round(height * ratio);
    
    // Create optimized canvas
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    
    return canvas;
  }
  
  /**
   * Get image dimensions without loading for display
   * @param {string} src - Image source
   * @returns {Promise<{width: number, height: number}>}
   */
  export async function getImageDimensions(src) {
    const img = await loadImageForCanvas(src);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }
  
  /**
   * Validate image URL is accessible
   * @param {string} src - Image source
   * @returns {Promise<boolean>}
   */
  export async function validateImageUrl(src) {
    try {
      await loadImageForCanvas(src, { maxRetries: 0 });
      return true;
    } catch {
      return false;
    }
  }
  
  export default {
    getFullImageUrl,
    loadImageForCanvas,
    loadImageWithFallback,
    preloadImages,
    optimizeImageForCanvas,
    getImageDimensions,
    validateImageUrl,
  };