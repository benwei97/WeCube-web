import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";

const createSignedS3Upload = httpsCallable(functions, "createSignedS3Upload");
const deleteS3Objects = httpsCallable(functions, "deleteS3Objects");

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getFileExtension(file) {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName === "jpg" ? "jpeg" : fromName;
  }

  return file.type?.split("/")[1] || "png";
}

function assertImageFile(file) {
  if (!file) {
    throw new Error("Select an image to upload.");
  }

  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }
}

async function uploadWithSignedUrl(file, uploadRequest) {
  assertImageFile(file);

  const { data } = await createSignedS3Upload(uploadRequest);
  const { uploadUrl, s3Key } = data || {};

  if (!uploadUrl || !s3Key) {
    throw new Error("Failed to prepare image upload.");
  }

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed with status ${response.status}.`);
  }

  return s3Key;
}

/**
 * Upload a file to S3 bucket
 * @param {File} file - The file to upload
 * @param {string} listingId - Listing ID for organizing files
 * @returns {Promise<string>} The S3 key (path) of the uploaded file
 */
export async function uploadImageToS3(file, listingId) {
  try {
    return await uploadWithSignedUrl(file, {
      uploadType: "listing",
      listingId,
      fileName: file.name,
      contentType: file.type,
      fileExtension: getFileExtension(file),
      fileSize: file.size,
    });
  } catch (error) {
    console.error("S3 listing image upload error:", error);
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
  try {
    const s3Key = await uploadWithSignedUrl(file, {
      uploadType: "avatar",
      userId,
      fileName: file.name,
      contentType: file.type,
      fileExtension: getFileExtension(file),
      fileSize: file.size,
    });

    return {
      s3Key,
      url: getS3PublicUrl(s3Key),
    };
  } catch (error) {
    console.error("S3 avatar upload error:", error);
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
  if (!s3Key) return;

  try {
    await deleteS3Objects({ s3Keys: [s3Key] });
  } catch (error) {
    console.error("S3 delete error:", error);
    throw new Error(`Failed to delete ${s3Key}: ${error.message}`);
  }
}

/**
 * Delete multiple images from S3
 * @param {Array<string>} s3Keys - Array of S3 keys to delete
 * @returns {Promise<void>}
 */
export async function deleteMultipleImages(s3Keys) {
  const filteredKeys = (s3Keys || []).filter(Boolean);
  if (filteredKeys.length === 0) return;

  try {
    await deleteS3Objects({ s3Keys: filteredKeys });
  } catch (error) {
    console.error("Error deleting multiple files from S3:", error);
    throw error;
  }
}
