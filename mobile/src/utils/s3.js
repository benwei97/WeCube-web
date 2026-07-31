/* global process */
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

const createSignedS3Upload = httpsCallable(functions, "createSignedS3Upload");

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getFileExtension(fileName = "", contentType = "") {
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName === "jpg" ? "jpeg" : fromName;
  }

  return contentType.split("/")[1] || "jpeg";
}

function getImageType(asset) {
  const mimeType = asset.mimeType || "";
  if (SUPPORTED_IMAGE_TYPES.has(mimeType)) return mimeType;

  const uri = asset.uri || "";
  if (uri.toLowerCase().endsWith(".png")) return "image/png";
  if (uri.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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

  const contentType = getImageType(asset);
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }

  const fileName = asset.fileName || asset.uri.split("/").pop() || "listing-photo.jpg";
  const fileSize = asset.fileSize || 1;
  const { data } = await createSignedS3Upload({
    uploadType: "listing",
    listingId,
    fileName,
    contentType,
    fileExtension: getFileExtension(fileName, contentType),
    fileSize,
  });

  const { uploadUrl, s3Key } = data || {};
  if (!uploadUrl || !s3Key) {
    throw new Error("Failed to prepare image upload.");
  }

  const imageResponse = await fetch(asset.uri);
  const imageBlob = await imageResponse.blob();
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: imageBlob,
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
