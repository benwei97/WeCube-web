import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const DEFAULT_ENV_PATH = ".env";
const DEFAULT_COMPETITIONS_PATH = "scripts/seed/competitions.json";
const DEFAULT_FUNCTIONS_REGION = "us-central1";
const DEFAULT_SEED_EMAIL_DOMAIN = "wecube-seed.test";
const DEFAULT_LISTINGS_PER_SELLER = 5;
const DEFAULT_COMPETITION_LIMIT = 25;
const UPLOAD_RETRY_COUNT = 4;
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 900;
const WCA_API_BASE = "https://www.worldcubeassociation.org/api/v0";
const UNITED_STATES_COUNTRY_CODE = "US";

const sellers = [
  { firstName: "Maya", lastName: "Chen", city: "Los Angeles, CA" },
  { firstName: "Ethan", lastName: "Park", city: "San Jose, CA" },
  { firstName: "Sofia", lastName: "Rivera", city: "Austin, TX" },
  { firstName: "Noah", lastName: "Kim", city: "Seattle, WA" },
  { firstName: "Ava", lastName: "Patel", city: "New York, NY" },
];

const listings = [
  {
    title: "GAN 12 MagLev UV",
    puzzleType: "3x3",
    condition: "like-new",
    price: 42,
    shippingCost: 7.5,
    colors: ["#ffffff", "#1d4ed8", "#ef4444", "#f97316", "#22c55e", "#facc15"],
    description:
      "Lightly used GAN 12 MagLev UV with a fast, airy feel. Comes tensioned for light turning and has only minor cosmetic wear from normal solves.",
    fulfillment: "shipping-local",
  },
  {
    title: "MoYu RS3M 2020",
    puzzleType: "3x3",
    condition: "used",
    price: 8,
    shippingCost: 5,
    colors: ["#fafafa", "#2563eb", "#dc2626", "#ea580c", "#16a34a", "#eab308"],
    description:
      "Reliable budget magnetic 3x3. Great backup cube or first speedcube. Magnets feel even and the cube is broken in.",
    fulfillment: "shipping",
  },
  {
    title: "X-Man Tornado V3 Flagship",
    puzzleType: "3x3",
    condition: "like-new",
    price: 24,
    shippingCost: 6.75,
    colors: ["#f8fafc", "#1e40af", "#b91c1c", "#fb923c", "#15803d", "#fde047"],
    description:
      "Smooth Tornado V3 Flagship with adjustable magnets and tensions. Clean stickers/colors and a quieter feel than most modern 3x3s.",
    fulfillment: "shipping-local",
  },
  {
    title: "YJ MGC 4x4",
    puzzleType: "4x4",
    condition: "used",
    price: 13,
    shippingCost: 7.25,
    colors: ["#f9fafb", "#1d4ed8", "#e11d48", "#f97316", "#22c55e", "#fde047"],
    description:
      "Solid magnetic 4x4 with stable outer layers and smooth inner layers. Good for practice or someone getting into bigger cubes.",
    fulfillment: "shipping",
  },
  {
    title: "MoYu WRM 2021 MagLev",
    puzzleType: "3x3",
    condition: "like-new",
    price: 19,
    shippingCost: 6,
    colors: ["#ffffff", "#2563eb", "#ef4444", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Fast WRM 2021 MagLev with a snappy feel. Set up with medium tensions and light lube. Includes original box.",
    fulfillment: "local",
  },
  {
    title: "GAN 356 XS",
    puzzleType: "3x3",
    condition: "used",
    price: 18,
    shippingCost: 6,
    colors: ["#ffffff", "#1e3a8a", "#dc2626", "#ea580c", "#15803d", "#eab308"],
    description:
      "Older flagship GAN 356 XS, still turns well and feels very light. Some scuffs on the plastic but fully functional.",
    fulfillment: "shipping-local",
  },
  {
    title: "QiYi MS Pyraminx",
    puzzleType: "Pyraminx",
    condition: "used",
    price: 6,
    shippingCost: 4.5,
    colors: ["#f8fafc", "#2563eb", "#ef4444", "#16a34a", "#facc15", "#f97316"],
    description:
      "Budget magnetic pyraminx with a smooth clicky feel. Good for learning pyraminx or as a casual event cube.",
    fulfillment: "shipping",
  },
  {
    title: "YJ MGC Megaminx",
    puzzleType: "Megaminx",
    condition: "like-new",
    price: 17,
    shippingCost: 8.25,
    colors: ["#f8fafc", "#2563eb", "#ef4444", "#fb923c", "#22c55e", "#fde047"],
    description:
      "Lightly used MGC Megaminx. Turns smoothly, ridges are clean, and it has been stored in a cube bag.",
    fulfillment: "shipping-local",
  },
  {
    title: "MoYu AoSu WRM 4x4",
    puzzleType: "4x4",
    condition: "like-new",
    price: 31,
    shippingCost: 7.75,
    colors: ["#ffffff", "#1d4ed8", "#dc2626", "#f97316", "#16a34a", "#eab308"],
    description:
      "Premium 4x4 with a compact feel and strong stability. Great for someone who wants a serious main without paying full retail.",
    fulfillment: "shipping",
  },
  {
    title: "Clock Bundle",
    puzzleType: "Clock",
    condition: "used",
    price: 20,
    shippingCost: 8,
    colors: ["#e5e7eb", "#111827", "#f97316", "#2563eb", "#facc15", "#ffffff"],
    description:
      "Two clock puzzles for practice and parts. Both are usable; one is smoother, the other is better as a backup.",
    fulfillment: "local",
  },
  {
    title: "DaYan TengYun V2 M",
    puzzleType: "3x3",
    condition: "used",
    price: 15,
    shippingCost: 6,
    colors: ["#f8fafc", "#1d4ed8", "#dc2626", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Very quiet 3x3 with a soft turning feel. Nice for practice sessions where you do not want a loud cube.",
    fulfillment: "shipping-local",
  },
  {
    title: "GAN 11 M Pro",
    puzzleType: "3x3",
    condition: "like-new",
    price: 35,
    shippingCost: 7,
    colors: ["#ffffff", "#2563eb", "#ef4444", "#f97316", "#22c55e", "#fde047"],
    description:
      "Clean GAN 11 M Pro with accessories and original box. Has the classic light GAN feel and strong corner cutting.",
    fulfillment: "shipping",
  },
  {
    title: "MoYu RS3M Super Ball-Core",
    puzzleType: "3x3",
    condition: "like-new",
    price: 16,
    shippingCost: 5.75,
    colors: ["#f9fafb", "#1d4ed8", "#e11d48", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Good condition RS3M Super with ball-core. Stable, quick, and a strong value option for a modern magnetic 3x3.",
    fulfillment: "shipping-local",
  },
  {
    title: "QiYi Valk 5 M",
    puzzleType: "5x5",
    condition: "used",
    price: 22,
    shippingCost: 8.5,
    colors: ["#ffffff", "#2563eb", "#dc2626", "#f97316", "#16a34a", "#fde047"],
    description:
      "Used Valk 5 M with a smooth, controlled feel. A few marks on the plastic but no performance issues.",
    fulfillment: "shipping",
  },
  {
    title: "Accessory Bundle",
    puzzleType: "Accessories",
    condition: "new",
    price: 10,
    shippingCost: 4.99,
    colors: ["#111827", "#64748b", "#22c55e", "#facc15", "#ef4444", "#ffffff"],
    description:
      "Small bundle with cube stands, a screwdriver, and a few unopened lube samples. Useful for a newer cuber building a kit.",
    fulfillment: "shipping",
  },
  {
    title: "MoYu WeiLong GTS3 M",
    puzzleType: "3x3",
    condition: "used",
    price: 12,
    shippingCost: 5.5,
    colors: ["#ffffff", "#1d4ed8", "#dc2626", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Classic ridged GTS3 M. Still quick and stable, with stronger magnets than many newer cubes.",
    fulfillment: "local",
  },
  {
    title: "YJ MGC Square-1",
    puzzleType: "Square-1",
    condition: "like-new",
    price: 14,
    shippingCost: 5.75,
    colors: ["#f8fafc", "#2563eb", "#ef4444", "#f97316", "#16a34a", "#fde047"],
    description:
      "Magnetic Square-1 in great shape. Good slice feel and clean layers. Lightly used for a few practice sessions.",
    fulfillment: "shipping-local",
  },
  {
    title: "GAN 251 M Leap",
    puzzleType: "2x2",
    condition: "like-new",
    price: 21,
    shippingCost: 5,
    colors: ["#ffffff", "#2563eb", "#dc2626", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Premium magnetic 2x2 with a fast, light feel. Great condition and includes the original box.",
    fulfillment: "shipping",
  },
  {
    title: "Cubing Starter Bundle",
    puzzleType: "Bundles",
    condition: "used",
    price: 28,
    shippingCost: 9,
    colors: ["#f9fafb", "#1d4ed8", "#ef4444", "#f97316", "#16a34a", "#fde047"],
    description:
      "Starter bundle with 2x2, 3x3, pyraminx, and skewb. Good for someone trying multiple events at once.",
    fulfillment: "shipping-local",
  },
  {
    title: "MoYu RS Skewb M",
    puzzleType: "Skewb",
    condition: "used",
    price: 7,
    shippingCost: 4.75,
    colors: ["#f8fafc", "#2563eb", "#dc2626", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Affordable magnetic skewb with a stable feel. Has some normal wear but turns well.",
    fulfillment: "local",
  },
  {
    title: "DianSheng Solar S 6x6",
    puzzleType: "6x6",
    condition: "like-new",
    price: 26,
    shippingCost: 9.5,
    colors: ["#ffffff", "#2563eb", "#ef4444", "#f97316", "#22c55e", "#fde047"],
    description:
      "Modern magnetic 6x6 with a surprisingly compact feel. Lightly used and kept clean.",
    fulfillment: "shipping",
  },
  {
    title: "MoYu AoFu WRM 7x7",
    puzzleType: "7x7",
    condition: "used",
    price: 33,
    shippingCost: 10.5,
    colors: ["#f8fafc", "#1d4ed8", "#dc2626", "#fb923c", "#16a34a", "#facc15"],
    description:
      "Large cube main candidate. Used but stable, with smooth outer layers and controllable inner layers.",
    fulfillment: "shipping-local",
  },
  {
    title: "Tornado V4 Pioneer",
    puzzleType: "3x3",
    condition: "new",
    price: 29,
    shippingCost: 6.75,
    colors: ["#ffffff", "#2563eb", "#ef4444", "#f97316", "#16a34a", "#fde047"],
    description:
      "Opened only to test turns. Very smooth and quiet with a modern flagship feel. Selling because I prefer my current main.",
    fulfillment: "shipping",
  },
  {
    title: "GAN Mirror M",
    puzzleType: "Other",
    condition: "like-new",
    price: 11,
    shippingCost: 5.25,
    colors: ["#e5e7eb", "#9ca3af", "#facc15", "#ffffff", "#374151", "#111827"],
    description:
      "Magnetic mirror cube in excellent condition. Fun shape mod for casual solving and collection display.",
    fulfillment: "shipping-local",
  },
  {
    title: "Speedcube Display Set",
    puzzleType: "Accessories",
    condition: "new",
    price: 18,
    shippingCost: 6.25,
    colors: ["#111827", "#4b5563", "#9ca3af", "#ffffff", "#facc15", "#22c55e"],
    description:
      "Set of display stands and small storage cases for keeping mains organized. New and unused.",
    fulfillment: "shipping",
  },
];

const meetupLocations = [
  {
    label: "Los Angeles, CA",
    location: { city: "Los Angeles", region: "CA", country: "United States", latitude: 34.0522, longitude: -118.2437 },
  },
  {
    label: "San Jose, CA",
    location: { city: "San Jose", region: "CA", country: "United States", latitude: 37.3382, longitude: -121.8863 },
  },
  {
    label: "Austin, TX",
    location: { city: "Austin", region: "TX", country: "United States", latitude: 30.2672, longitude: -97.7431 },
  },
  {
    label: "Seattle, WA",
    location: { city: "Seattle", region: "WA", country: "United States", latitude: 47.6062, longitude: -122.3321 },
  },
  {
    label: "New York, NY",
    location: { city: "New York", region: "NY", country: "United States", latitude: 40.7128, longitude: -74.006 },
  },
];

const fallbackCompetitions = [
  {
    id: "seed-bay-area-open-2026",
    name: "Bay Area Open 2026",
    city: "San Jose",
    country: "United States",
    latitude: 37.3382,
    longitude: -121.8863,
    displayName: "Bay Area Open 2026",
    dateRange: "Aug 15-16, 2026",
    startDate: "2026-08-15",
    endDate: "2026-08-16",
  },
  {
    id: "seed-socal-summer-2026",
    name: "SoCal Summer 2026",
    city: "Los Angeles",
    country: "United States",
    latitude: 34.0522,
    longitude: -118.2437,
    displayName: "SoCal Summer 2026",
    dateRange: "Sep 5, 2026",
    startDate: "2026-09-05",
    endDate: "2026-09-05",
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    write: false,
    envPath: DEFAULT_ENV_PATH,
    competitionsPath: DEFAULT_COMPETITIONS_PATH,
    emailDomain: process.env.SEED_EMAIL_DOMAIN || DEFAULT_SEED_EMAIL_DOMAIN,
    password: process.env.SEED_USER_PASSWORD || "",
    listingsPerSeller: DEFAULT_LISTINGS_PER_SELLER,
    competitionLimit: DEFAULT_COMPETITION_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--env") {
      options.envPath = args[index + 1];
      index += 1;
    } else if (arg === "--competitions") {
      options.competitionsPath = args[index + 1];
      index += 1;
    } else if (arg === "--email-domain") {
      options.emailDomain = args[index + 1];
      index += 1;
    } else if (arg === "--password") {
      options.password = args[index + 1];
      index += 1;
    } else if (arg === "--listings-per-seller") {
      options.listingsPerSeller = Number(args[index + 1]);
      index += 1;
    } else if (arg === "--competition-limit") {
      options.competitionLimit = Number(args[index + 1]);
      index += 1;
    }
  }

  return options;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(resolve(process.cwd(), filePath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readEnvFile(envPath) {
  const file = await readFile(resolve(process.cwd(), envPath), "utf8");
  return file.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return acc;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      return acc;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    acc[key] = rawValue.replace(/^["']|["']$/g, "");
    return acc;
  }, {});
}

function getFirebaseConfig(env) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  const missingKeys = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase env values: ${missingKeys.join(", ")}`);
  }

  return config;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) {
    return "";
  }

  if (!endDate || endDate === startDate) {
    return startDate;
  }

  return `${startDate} to ${endDate}`;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCompetition(competition) {
  const id = competition.id || competition.competitionId || "";
  const name = competition.name || competition.displayName || id;
  const startDate = competition.startDate || competition.start_date || null;
  const endDate = competition.endDate || competition.end_date || startDate;

  return {
    id,
    name,
    city: competition.city || competition.venueCity || "",
    country: competition.country || competition.countryIso2 || competition.country_iso2 || "",
    latitude:
      typeof competition.latitude === "number"
        ? competition.latitude
        : Number(competition.latitude) || null,
    longitude:
      typeof competition.longitude === "number"
        ? competition.longitude
        : Number(competition.longitude) || null,
    displayName: competition.displayName || name,
    dateRange:
      competition.dateRange ||
      competition.date_range ||
      formatDateRange(startDate, endDate),
    startDate,
    endDate,
  };
}

function isUnitedStatesCompetition(competition) {
  return (
    competition?.country_iso2 === UNITED_STATES_COUNTRY_CODE ||
    competition?.countryIso2 === UNITED_STATES_COUNTRY_CODE ||
    competition?.country === UNITED_STATES_COUNTRY_CODE
  );
}

async function loadSeedCompetitions(filePath) {
  const parsed = await readJsonFile(filePath);
  const source = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.competitions)
      ? parsed.competitions
      : null;

  if (!source || source.length === 0) {
    return null;
  }

  const competitions = source
    .filter(isUnitedStatesCompetition)
    .map(normalizeCompetition)
    .filter((competition) => competition.id && competition.name);

  if (competitions.length === 0) {
    throw new Error(`No valid competitions found in ${filePath}.`);
  }

  return competitions;
}

async function fetchOfficialWcaCompetitions(limit) {
  const startDate = getTodayIsoDate();
  const competitions = [];
  let page = 1;

  while (competitions.length < limit && page <= 10) {
    const url = `${WCA_API_BASE}/competitions?sort=start_date&start=${startDate}&page=${page}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`WCA API request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    data
      .filter(isUnitedStatesCompetition)
      .map(normalizeCompetition)
      .filter((competition) => competition.id && competition.name)
      .forEach((competition) => competitions.push(competition));

    if (data.length < 25) {
      break;
    }

    page += 1;
  }

  return competitions.slice(0, limit);
}

async function getSeedCompetitions(options) {
  const localCompetitions = await loadSeedCompetitions(options.competitionsPath);
  if (localCompetitions) {
    console.log(`Loaded competitions from ${options.competitionsPath}.`);
    return localCompetitions;
  }

  try {
    const officialCompetitions = await fetchOfficialWcaCompetitions(
      options.competitionLimit
    );
    if (officialCompetitions.length > 0) {
      console.log("Loaded upcoming competitions from the official WCA API.");
      return officialCompetitions;
    }
  } catch (error) {
    console.warn(`Unable to fetch WCA competitions: ${error.message}`);
  }

  console.warn("Using fallback seed competitions.");
  return fallbackCompetitions;
}

function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.concat([typeBuffer, data]);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(chunk), 8 + data.length);
  return result;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function fillRect(buffer, width, x, y, rectWidth, rectHeight, color) {
  const [r, g, b] = hexToRgb(color);
  for (let row = Math.max(0, y); row < Math.min(IMAGE_HEIGHT, y + rectHeight); row += 1) {
    for (let col = Math.max(0, x); col < Math.min(width, x + rectWidth); col += 1) {
      const offset = row * (width * 4 + 1) + 1 + col * 4;
      buffer[offset] = r;
      buffer[offset + 1] = g;
      buffer[offset + 2] = b;
      buffer[offset + 3] = 255;
    }
  }
}

function createSeedCubePng(listing, variantIndex) {
  const raw = Buffer.alloc(IMAGE_HEIGHT * (IMAGE_WIDTH * 4 + 1));
  const background = variantIndex % 2 === 0 ? "#f1f5f9" : "#e2e8f0";

  for (let row = 0; row < IMAGE_HEIGHT; row += 1) {
    raw[row * (IMAGE_WIDTH * 4 + 1)] = 0;
    fillRect(raw, IMAGE_WIDTH, 0, row, IMAGE_WIDTH, 1, background);
  }

  fillRect(raw, IMAGE_WIDTH, 150, 110, 900, 680, "#cbd5e1");
  fillRect(raw, IMAGE_WIDTH, 195, 155, 810, 590, "#111827");

  const stickerSize = 150;
  const gap = 24;
  const startX = 270;
  const startY = 190;
  const palette = listing.colors;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const paletteIndex = (row * 3 + col + variantIndex) % palette.length;
      fillRect(
        raw,
        IMAGE_WIDTH,
        startX + col * (stickerSize + gap),
        startY + row * (stickerSize + gap),
        stickerSize,
        stickerSize,
        palette[paletteIndex]
      );
    }
  }

  fillRect(raw, IMAGE_WIDTH, 745, 220, 90, 410, "#334155");
  fillRect(raw, IMAGE_WIDTH, 835, 250, 80, 350, "#475569");

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(IMAGE_WIDTH, 0);
  ihdr.writeUInt32BE(IMAGE_HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadBuffer({ createSignedUpload, buffer, listingId, fileName, contentType }) {
  const extension = fileName.split(".").pop();
  let lastError = null;

  for (let attempt = 1; attempt <= UPLOAD_RETRY_COUNT; attempt += 1) {
    try {
      const { data } = await createSignedUpload({
        uploadType: "listing",
        listingId,
        fileName,
        contentType,
        fileExtension: extension,
        fileSize: buffer.length,
      });

      const response = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: buffer,
      });

      if (response.ok) {
        return data.s3Key;
      }

      lastError = new Error(`S3 upload failed for ${fileName}: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < UPLOAD_RETRY_COUNT) {
      const delayMs = 500 * attempt;
      console.warn(
        `Upload attempt ${attempt} failed for ${fileName}; retrying in ${delayMs}ms.`
      );
      await new Promise((resolveDelay) => {
        setTimeout(resolveDelay, delayMs);
      });
    }
  }

  throw lastError;
}

async function ensureSeedUser({ auth, db, email, password, firstName, lastName, write }) {
  if (!write) {
    console.log(`[dry-run] ensure user ${email}`);
    return { uid: `dry-run-${email}` };
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", credential.user.uid), {
      email,
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
    });
    return credential.user;
  } catch (error) {
    if (error.code !== "auth/email-already-in-use") {
      throw error;
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  }
}

function getFulfillmentPayload(listing, sellerIndex, listingIndex, seedCompetitions) {
  const meetup = meetupLocations[sellerIndex % meetupLocations.length];
  const competition = seedCompetitions[listingIndex % seedCompetitions.length];
  const hasShipping = listing.fulfillment.includes("shipping");
  const hasLocal = listing.fulfillment.includes("local");
  const hasCompetition = listingIndex % 5 === 0;

  return {
    shippingAvailable: hasShipping,
    shippingIncluded: hasShipping && listingIndex % 4 === 0,
    shippingCost: hasShipping && listingIndex % 4 !== 0 ? listing.shippingCost : 0,
    localMeetupAvailable: hasLocal,
    meetupLocationLabel: hasLocal ? meetup.label : "",
    meetupLocation: hasLocal ? meetup.location : null,
    competitionMeetupAvailable: hasCompetition,
    competitions: hasCompetition ? [competition] : [],
    meetupCompetitionTags: hasCompetition
      ? [{
          id: competition.id,
          name: competition.name,
          city: competition.city,
          country: competition.country,
          latitude: competition.latitude,
          longitude: competition.longitude,
          displayName: competition.displayName,
          dateRange: competition.dateRange,
        }]
      : [],
  };
}

async function listingExists(db, listingId) {
  const snapshot = await getDocs(
    query(collection(db, "listings"), where("listingId", "==", listingId))
  );
  return !snapshot.empty;
}

async function createSeedListing({
  db,
  createSignedUpload,
  sellerUser,
  sellerIndex,
  listing,
  listingIndex,
  sellerListingIndex,
  options,
  seedCompetitions,
}) {
  const listingId = `seed_${sellerIndex + 1}_${sellerListingIndex + 1}`;
  const email = sellers[sellerIndex].email;

  if (!options.write) {
    console.log(`[dry-run] create listing ${listingId}: ${listing.title} for ${email}`);
    return;
  }

  if (await listingExists(db, listingId)) {
    console.log(`Skipped existing listing ${listingId}: ${listing.title}`);
    return;
  }

  const imageCount = 1 + (listingIndex % 3);
  const photos = [];
  for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
    const buffer = createSeedCubePng(listing, imageIndex);
    const name = `${listingId}-${imageIndex + 1}.png`;
    const s3Key = await uploadBuffer({
      createSignedUpload,
      buffer,
      listingId,
      fileName: name,
      contentType: "image/png",
    });
    photos.push({
      id: `${listingId}_photo_${imageIndex + 1}`,
      name,
      size: buffer.length,
      type: "image/png",
      s3Key,
      uploadedAt: new Date(),
    });
  }

  const fulfillment = getFulfillmentPayload(
    listing,
    sellerIndex,
    listingIndex,
    seedCompetitions
  );
  await addDoc(collection(db, "listings"), {
    title: listing.title,
    price: listing.price,
    description: listing.description,
    condition: listing.condition,
    puzzleType: listing.puzzleType,
    photos,
    ...fulfillment,
    status: "active",
    createdAt: new Date(Date.now() - listingIndex * 60 * 60 * 1000),
    soldAt: null,
    userId: sellerUser.uid,
    listingId,
  });

  console.log(`Created listing ${listingId}: ${listing.title}`);
}

async function main() {
  const options = parseArgs();
  if (options.write && !options.password) {
    throw new Error("Set SEED_USER_PASSWORD or pass --password before using --write.");
  }

  if (!Number.isInteger(options.listingsPerSeller) || options.listingsPerSeller < 1) {
    throw new Error("--listings-per-seller must be a positive integer.");
  }

  sellers.forEach((seller, index) => {
    seller.email = `seller${index + 1}@${options.emailDomain}`;
  });

  const env = await readEnvFile(options.envPath);
  const app = initializeApp(getFirebaseConfig(env));
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(
    app,
    env.VITE_FIREBASE_FUNCTIONS_REGION || DEFAULT_FUNCTIONS_REGION
  );
  const createSignedUpload = httpsCallable(functions, "createSignedS3Upload");
  const seedCompetitions = await getSeedCompetitions(options);

  console.log(options.write ? "Seeding listings..." : "Dry run only. Pass --write to create data.");
  console.log(`Project: ${env.VITE_FIREBASE_PROJECT_ID}`);
  console.log(`Sellers: ${sellers.length}`);
  console.log(`Listings per seller: ${options.listingsPerSeller}`);
  console.log(`Competitions loaded: ${seedCompetitions.length}`);
  if (!options.write) {
    console.log(
      `Competition sample: ${seedCompetitions
        .slice(0, 5)
        .map((competition) => `${competition.name} (${competition.city}, ${competition.country})`)
        .join("; ")}`
    );
  }

  for (let sellerIndex = 0; sellerIndex < sellers.length; sellerIndex += 1) {
    const seller = sellers[sellerIndex];
    const sellerUser = await ensureSeedUser({
      auth,
      db,
      email: seller.email,
      password: options.password,
      firstName: seller.firstName,
      lastName: seller.lastName,
      write: options.write,
    });

    for (let offset = 0; offset < options.listingsPerSeller; offset += 1) {
      const listingIndex = sellerIndex * options.listingsPerSeller + offset;
      const listing = listings[listingIndex % listings.length];
      await createSeedListing({
        db,
        createSignedUpload,
        sellerUser,
        sellerIndex,
        listing,
        listingIndex,
        sellerListingIndex: offset,
        options,
        seedCompetitions,
      });
    }

    if (options.write) {
      await signOut(auth);
    }
  }

  console.log("Seed workflow complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
