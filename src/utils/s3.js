import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 client
const s3Client = new S3Client({
  region: import.meta.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
});

// Debug logging
console.log('S3 Config:', {
  region: import.meta.env.VITE_AWS_REGION,
  bucketName: import.meta.env.VITE_S3_BUCKET_NAME,
  hasAccessKey: !!import.meta.env.VITE_AWS_ACCESS_KEY_ID,
  hasSecretKey: !!import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
});

/**
 * Upload a file to S3 bucket
 * @param {File} file - The file to upload
 * @param {string} listingId - Listing ID for organizing files
 * @returns {Promise<string>} The S3 key (path) of the uploaded file
 */
export async function uploadImageToS3(file, listingId) {
  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop();
  const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

  // Organize files by listing only
  const s3Key = `listings/${listingId}/${fileName}`;

  // Convert File to ArrayBuffer for browser compatibility
  const fileBuffer = await file.arrayBuffer();

  const uploadParams = {
    Bucket: import.meta.env.VITE_S3_BUCKET_NAME,
    Key: s3Key,
    Body: new Uint8Array(fileBuffer),
    ContentType: file.type,
    // ACL removed - bucket configured to not allow ACLs
    Metadata: {
      'original-name': file.name,
      'listing-id': listingId,
    },
  };

  try {
    console.log('Uploading file:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      s3Key,
      bucket: import.meta.env.VITE_S3_BUCKET_NAME
    });

    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);

    console.log(`File uploaded successfully: ${s3Key}`, result);
    return s3Key;
  } catch (error) {
    console.error('Detailed S3 upload error:', {
      error,
      errorMessage: error.message,
      errorCode: error.Code,
      errorName: error.name,
      uploadParams
    });
    throw new Error(`Failed to upload ${file.name}: ${error.message}`);
  }
}

export function getS3PublicUrl(s3Key) {
  if (!s3Key) {
    return null;
  }

  const publicBaseUrl = import.meta.env.VITE_S3_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${s3Key}`;
  }

  const bucketName = import.meta.env.VITE_S3_BUCKET_NAME;
  const region = import.meta.env.VITE_AWS_REGION;
  return `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
}

export async function uploadAvatarToS3(file, userId) {
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop();
  const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
  const s3Key = `avatars/${userId}/${fileName}`;
  const fileBuffer = await file.arrayBuffer();

  const uploadParams = {
    Bucket: import.meta.env.VITE_S3_BUCKET_NAME,
    Key: s3Key,
    Body: new Uint8Array(fileBuffer),
    ContentType: file.type,
    Metadata: {
      'original-name': file.name,
      'user-id': userId,
    },
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    return {
      s3Key,
      url: getS3PublicUrl(s3Key),
    };
  } catch (error) {
    console.error('Detailed S3 avatar upload error:', {
      error,
      errorMessage: error.message,
      errorCode: error.Code,
      errorName: error.name,
      uploadParams,
    });
    throw new Error(`Failed to upload avatar: ${error.message}`);
  }
}

/**
 * Upload multiple images to S3
 * @param {Array<File>} files - Array of files to upload
 * @param {string} listingId - Listing ID
 * @returns {Promise<Array<string>>} Array of S3 keys
 */
export async function uploadMultipleImages(files, listingId) {
  const uploadPromises = files.map(file => uploadImageToS3(file, listingId));

  try {
    const s3Keys = await Promise.all(uploadPromises);
    return s3Keys;
  } catch (error) {
    console.error('Error uploading multiple files:', error);
    throw error;
  }
}

/**
 * Delete a single image from S3 bucket
 * @param {string} s3Key - The S3 key (path) of the file to delete
 * @returns {Promise<void>}
 */
export async function deleteImageFromS3(s3Key) {
  const deleteParams = {
    Bucket: import.meta.env.VITE_S3_BUCKET_NAME,
    Key: s3Key,
  };

  try {
    console.log('Deleting file from S3:', s3Key);

    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);

    console.log(`File deleted successfully: ${s3Key}`);
  } catch (error) {
    console.error('Detailed S3 delete error:', {
      error,
      errorMessage: error.message,
      s3Key
    });
    throw new Error(`Failed to delete ${s3Key}: ${error.message}`);
  }
}

/**
 * Delete multiple images from S3
 * @param {Array<string>} s3Keys - Array of S3 keys to delete
 * @returns {Promise<void>}
 */
export async function deleteMultipleImages(s3Keys) {
  const deletePromises = s3Keys.map(s3Key => deleteImageFromS3(s3Key));

  try {
    await Promise.all(deletePromises);
    console.log(`Successfully deleted ${s3Keys.length} files from S3`);
  } catch (error) {
    console.error('Error deleting multiple files from S3:', error);
    throw error;
  }
}
