/* global process */
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const createSignedS3Upload = httpsCallable(functions, "createSignedS3Upload");
const deleteS3Objects = httpsCallable(functions, "deleteS3Objects");

async function prepareImage(asset) {
  // Picker metadata can describe JPEG while the bytes are still HEIC.
  const format = asset.mimeType === "image/png" ? SaveFormat.PNG : SaveFormat.JPEG;
  const context = ImageManipulator.manipulate(asset.uri);
  let image;
  let result;
  try {
    image = await context.renderAsync();
    result = await image.saveAsync({ format, compress: 0.85 });
  } finally {
    image?.release();
    context.release();
  }
  const response = await fetch(result.uri);
  const blob = await response.blob();
  const fileName = `${(asset.fileName || "photo").replace(/\.[^.]+$/, "")}.${format}`;
  return { blob, fileName, fileSize: blob.size, contentType: `image/${format}`, fileExtension: format };
}

export function getS3PublicUrl(s3Key) {
  if (!s3Key) return null;

  const publicBaseUrl = process.env.EXPO_PUBLIC_S3_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${s3Key}`;
  }

  const bucketName = process.env.EXPO_PUBLIC_S3_BUCKET_NAME;
  const region = process.env.EXPO_PUBLIC_AWS_REGION;
  return `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
}

export async function uploadImageAssetToS3(asset, listingId) {
  if (!asset?.uri) {
    throw new Error("Select an image to upload.");
  }

  const { blob, contentType, fileName, fileSize, fileExtension } = await prepareImage(asset);
  const { data } = await createSignedS3Upload({
    uploadType: "listing",
    listingId,
    fileName,
    contentType,
    fileExtension,
    fileSize,
  });

  const { uploadUrl, s3Key } = data || {};
  if (!uploadUrl || !s3Key) {
    throw new Error("Failed to prepare image upload.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed with status ${uploadResponse.status}.`);
  }

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: fileName,
    size: fileSize,
    type: contentType,
    s3Key,
    uploadedAt: new Date(),
  };
}

export async function uploadAvatarAssetToS3(asset, userId) {
  if (!asset?.uri || !userId) {
    throw new Error("Select an avatar image to upload.");
  }

  const { blob, contentType, fileName, fileSize, fileExtension } = await prepareImage(asset);
  const { data } = await createSignedS3Upload({
    uploadType: "avatar",
    userId,
    fileName,
    contentType,
    fileExtension,
    fileSize,
  });

  const { uploadUrl, s3Key } = data || {};
  if (!uploadUrl || !s3Key) {
    throw new Error("Failed to prepare avatar upload.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Avatar upload failed with status ${uploadResponse.status}.`);
  }

  return {
    s3Key,
    url: getS3PublicUrl(s3Key),
  };
}

export async function deleteMultipleImages(s3Keys) {
  const filteredKeys = (s3Keys || []).filter(Boolean);
  if (!filteredKeys.length) return;

  await deleteS3Objects({ s3Keys: filteredKeys });
}
