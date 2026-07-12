'use strict';

/**
 * Minimal Multer storage engine for Cloudinary SDK v2.
 * Replaces multer-storage-cloudinary, whose v4 peer dependency only supports
 * Cloudinary v1 and prevents clean production installs with `npm ci`.
 */
class CloudinaryStorage {
  constructor({ cloudinary, params = {} }) {
    if (!cloudinary?.uploader?.upload_stream) {
      throw new TypeError('A configured Cloudinary v2 client is required');
    }
    this.cloudinary = cloudinary;
    this.params = params;
  }

  async _handleFile(req, file, callback) {
    try {
      const configured = typeof this.params === 'function'
        ? await this.params(req, file)
        : this.params;
      const options = { ...(configured || {}) };

      const upload = this.cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) return callback(error);
        callback(null, {
          path: result.secure_url || result.url,
          filename: result.public_id,
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
        });
      });

      file.stream.on('error', (error) => upload.destroy(error));
      file.stream.pipe(upload);
    } catch (error) {
      callback(error);
    }
  }

  _removeFile(_req, file, callback) {
    if (!file?.public_id) return callback(null);
    this.cloudinary.uploader.destroy(
      file.public_id,
      { resource_type: file.resource_type || 'image' },
      (error) => callback(error || null)
    );
  }
}

module.exports = { CloudinaryStorage };
