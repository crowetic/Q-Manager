// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Button,
  ButtonBase,
  Avatar,
  Box,
  Badge,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  AppBar,
  IconButton,
  Toolbar,
  Stack,
  Modal,
  Tabs,
  Tab,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Tooltip,
} from "@mui/material";
import { styled } from "@mui/system";
import { useDropzone } from "react-dropzone";
import { Label, PUBLISH_QDN_RESOURCE } from "./actions/PUBLISH_QDN_RESOURCE";
import { ShowAction, Transition } from "./ShowAction";
import { ContextMenuPinnedFiles } from "./ContextMenuPinnedFiles";
import { useModal } from "./useModal";
import {
  discoverQManagerResourcesByName,
  fetchQdnResourceProperties,
  getPersistedFileSystemQManager,
  getPersistedPrivateResourceIndex,
  importFileSystemQManagerFromQDN,
  publishFileSystemQManagerToQDN,
  saveFileSystemQManagerEverywhere,
  savePrivateResourceIndexEverywhere,
  upsertPrivateResourceIndexEntry,
} from "./storage";
import { SelectedFile } from "./File";
import { FileSystemBreadcrumbs } from "./FileSystemBreadcrumbs";
import { Spacer } from "./components/Spacer";
import FolderIcon from "@mui/icons-material/Folder";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import PublishIcon from "@mui/icons-material/Publish";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import {
  base64ToUint8Array,
  createImageThumbnailData64,
  handleImportClick,
  objectToBase64,
  resolvePreferredName,
  uint8ArrayToObject,
} from "./utils";
import { openToast } from "./components/openToast";
import { requestQortal } from "./qapp/request";
const initialFileSystem = [
  {
    type: "folder",
    name: "Root",
    children: [],
  },
];

const initialGroupFileSystem = {};
const RECOVERED_IMPORTS_FOLDER = "Recovered Imports";
const SHOW_THUMBNAILS_KEY = "q-manager-show-thumbnails";
const SHOW_PRIVATE_THUMBNAILS_KEY = "q-manager-show-private-thumbnails";
const AUTO_QDN_FILESYSTEM_SYNC_KEY = "q-manager-auto-qdn-filesystem-sync";
const MAX_TEXT_PREVIEW_CHARS = 120000;

const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "log",
  "js",
  "mjs",
  "cjs",
  "ts",
  "jsx",
  "tsx",
  "css",
  "html",
  "htm",
  "sh",
  "bat",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "go",
  "rs",
  "sol",
]);

const EXTRA_TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-sh",
  "application/sql",
]);

const getServiceName = (file) => {
  const candidates = [file?.service, file?.service?.name, file?.serviceName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return "";
};

const getResourcePreviewUrl = (file) => {
  const service = getServiceName(file);
  const qortalName =
    typeof file?.qortalName === "string" && file.qortalName.trim()
      ? file.qortalName
      : "";
  if (!service || !qortalName || !file?.identifier) return "";
  return `/arbitrary/${encodeURIComponent(service)}/${encodeURIComponent(
    qortalName
  )}/${encodeURIComponent(file.identifier)}`;
};

const isEncryptedResource = (file) => {
  const service = safeUpper(getServiceName(file));
  const identifier = safeLower(file?.identifier);
  const encryptionType = safeLower(file?.encryptionType);
  return (
    Boolean(file?.group || file?.groupId) ||
    encryptionType.includes("private") ||
    encryptionType.includes("group") ||
    service.includes("_PRIVATE") ||
    identifier.startsWith("p-") ||
    identifier.startsWith("pvt-") ||
    identifier.startsWith("grp-")
  );
};

const isGenericPrivateResourceLabel = (value) => {
  const normalized = safeLower(value).trim();
  if (!normalized) return true;
  return (
    normalized === "data" ||
    normalized === "file" ||
    normalized === "blob" ||
    normalized === "resource" ||
    normalized === "preview" ||
    normalized === "unknown" ||
    normalized === "untitled" ||
    normalized === "data.bin" ||
    normalized.startsWith("data.")
  );
};

const parseBase64Json = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    const decodedText = new TextDecoder("utf-8", { fatal: false }).decode(
      base64ToUint8Array(value)
    );
    return JSON.parse(decodedText);
  } catch (error) {}
  return null;
};

const extractBase64FromDataUrl = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/is);
  return match?.[1]?.trim() || "";
};

const parseJsonLikeString = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {}
  return parseBase64Json(trimmed);
};

const tryDecodeTextFromBase64 = (value) => {
  if (typeof value !== "string") return "";
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      base64ToUint8Array(value)
    );
  } catch (error) {
    return "";
  }
};

const isProbablyTextContent = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  let printableCount = 0;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code <= 126)
    ) {
      printableCount++;
    }
  }

  return printableCount / trimmed.length >= 0.8;
};

const unwrapDecryptedPayload = (value, depth = 0) => {
  if (depth > 4) {
    return {
      data64: typeof value === "string" ? value.trim() : "",
      metadata: {},
    };
  }

  if (value && typeof value === "object") {
    const nextValue =
      typeof value?.data === "string"
        ? value.data
        : typeof value?.data64 === "string"
          ? value.data64
          : typeof value?.content === "string"
            ? value.content
            : typeof value?.base64 === "string"
              ? value.base64
              : typeof value?.fileData === "string"
                ? value.fileData
                : "";
    const metadata =
      value?.metadata && typeof value.metadata === "object"
        ? value.metadata
        : {};

    if (!nextValue) {
      return {
        data64: "",
        metadata,
      };
    }

    const nested = unwrapDecryptedPayload(nextValue, depth + 1);
    return {
      data64: nested.data64,
      metadata: {
        ...metadata,
        ...(nested.metadata || {}),
      },
    };
  }

  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return {
      data64: "",
      metadata: {},
    };
  }

  const dataUrlBase64 = extractBase64FromDataUrl(rawValue);
  if (dataUrlBase64) {
    return unwrapDecryptedPayload(dataUrlBase64, depth + 1);
  }

  const jsonLike = parseJsonLikeString(rawValue);
  if (jsonLike && typeof jsonLike === "object") {
    return unwrapDecryptedPayload(jsonLike, depth + 1);
  }

  const decodedText = tryDecodeTextFromBase64(rawValue).trim();
  if (decodedText) {
    const nestedDataUrlBase64 = extractBase64FromDataUrl(decodedText);
    if (nestedDataUrlBase64) {
      return unwrapDecryptedPayload(nestedDataUrlBase64, depth + 1);
    }

    const nestedJsonLike = parseJsonLikeString(decodedText);
    if (nestedJsonLike && typeof nestedJsonLike === "object") {
      return unwrapDecryptedPayload(nestedJsonLike, depth + 1);
    }
  }

  return {
    data64: rawValue,
    metadata: {},
  };
};

const normalizeDecryptedPayload = (value) => unwrapDecryptedPayload(value);

const base64ToBlob = (base64, mimeType = "application/octet-stream") => {
  const bytes = base64ToUint8Array(base64);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
};

const decodeBase64Utf8 = (encodedText) => {
  const bytes = base64ToUint8Array(encodedText);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
};

const trimForTextPreview = (textValue) => {
  const fullText = textValue || "";
  if (fullText.length <= MAX_TEXT_PREVIEW_CHARS) {
    return fullText;
  }
  return `${fullText.slice(
    0,
    MAX_TEXT_PREVIEW_CHARS
  )}\n\n[Preview truncated to ${MAX_TEXT_PREVIEW_CHARS.toLocaleString()} characters]`;
};

const inferMimeTypeFromBase64 = (base64) => {
  try {
    const bytes = base64ToUint8Array(base64).slice(0, 24);
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return "image/gif";
    }
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return "application/pdf";
    }
  } catch (error) {}
  return "";
};

const inferPreviewKindFromMimeType = (mimeType) => {
  const normalized = safeLower(mimeType);
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized === "application/pdf" || normalized === "application/x-pdf")
    return "pdf";
  if (isTextLikeMimeType(normalized)) return "text";
  return "";
};

const fetchResourcePropertiesForPreview = async (resource) =>
  fetchQdnResourceProperties(resource);

const getPreviewPropertyValue = (source, keys = []) => {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
};

const findPrivateIndexEntry = (privateResourceIndex, file) => {
  const entries =
    privateResourceIndex?.entries &&
    typeof privateResourceIndex.entries === "object"
      ? privateResourceIndex.entries
      : null;
  if (!entries) return null;

  const service = getServiceName(file);
  const identifier = file?.identifier;
  const groupId = file?.group || file?.groupId || 0;
  const qortalName = file?.qortalName || file?.name || "";
  const candidateKeys = new Set([
    file?.resourceKey,
    file?.entryKey,
    file?.key,
    [qortalName, service, identifier, groupId].join("|"),
    [qortalName, service, identifier, 0].join("|"),
    [service, identifier, groupId].join("|"),
    [service, identifier, 0].join("|"),
  ]);

  for (const candidateKey of candidateKeys) {
    if (candidateKey && entries[candidateKey]) {
      return entries[candidateKey];
    }
  }

  const matchingEntries = Object.values(entries).filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const entryService = getServiceName(entry);
    const entryIdentifier = entry?.identifier;
    const entryGroupId = entry?.group || entry?.groupId || 0;
    return (
      entryService === service &&
      entryIdentifier === identifier &&
      Number(entryGroupId || 0) === Number(groupId || 0)
    );
  });

  if (matchingEntries.length === 0) return null;
  if (!qortalName) return matchingEntries[0] || null;

  const exactNameMatch = matchingEntries.find((entry) => {
    const entryName = entry?.qortalName || entry?.name || "";
    return entryName && entryName === qortalName;
  });

  return exactNameMatch || matchingEntries[0] || null;
};

const resolvePrivateResourceItem = (item, privateResourceIndex) => {
  if (!item || item.type !== "file") return item;

  const encrypted = isEncryptedResource(item);
  const privateIndexEntry = findPrivateIndexEntry(privateResourceIndex, item);
  if (!encrypted && !privateIndexEntry) return item;

  const sizeCandidates = [
    privateIndexEntry?.sizeInBytes,
    item?.sizeInBytes,
    item?.size,
    item?.fileSize,
    item?.dataSize,
    item?.createdSize,
    item?.totalSize,
  ];
  let resolvedSize = null;
  for (const candidate of sizeCandidates) {
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      resolvedSize = numericValue;
      break;
    }
  }

  const resolvedDisplayName =
    privateIndexEntry?.displayName ||
    privateIndexEntry?.filename ||
    item?.displayName ||
    item?.name ||
    item?.filename ||
    "";

  const resolvedFilename =
    privateIndexEntry?.filename ||
    resolvedDisplayName ||
    item?.name ||
    item?.filename ||
    "";
  const resolvedQortalName =
    privateIndexEntry?.qortalName || item?.qortalName || "";

  return {
    ...item,
    ...(resolvedQortalName ? { qortalName: resolvedQortalName } : {}),
    ...(resolvedDisplayName ? { displayName: resolvedDisplayName } : {}),
    ...(resolvedFilename ? { filename: resolvedFilename } : {}),
    ...(privateIndexEntry?.mimeType
      ? { mimeType: privateIndexEntry.mimeType }
      : {}),
    ...(resolvedSize !== null ? { sizeInBytes: resolvedSize } : {}),
    ...(privateIndexEntry?.encryptionType || item?.encryptionType
      ? {
          encryptionType:
            privateIndexEntry?.encryptionType || item?.encryptionType,
        }
      : {}),
    ...(privateIndexEntry?.sharingKey || item?.sharingKey || item?.key
      ? {
          sharingKey:
            privateIndexEntry?.sharingKey || item?.sharingKey || item?.key,
        }
      : {}),
    ...(privateIndexEntry?.key ? { key: privateIndexEntry.key } : {}),
    ...(privateIndexEntry?.publicKey || item?.publicKey
      ? { publicKey: privateIndexEntry?.publicKey || item?.publicKey }
      : {}),
    ...(privateIndexEntry?.thumbnailData64 || item?.thumbnailData64
      ? {
          thumbnailData64:
            privateIndexEntry?.thumbnailData64 || item?.thumbnailData64,
          thumbnailMimeType:
            privateIndexEntry?.thumbnailMimeType ||
            item?.thumbnailMimeType ||
            privateIndexEntry?.mimeType ||
            item?.mimeType ||
            "image/jpeg",
        }
      : {}),
    ...(privateIndexEntry?.group !== undefined ||
    privateIndexEntry?.groupId !== undefined ||
    item?.group !== undefined ||
    item?.groupId !== undefined
      ? {
          group:
            privateIndexEntry?.group ??
            privateIndexEntry?.groupId ??
            item?.group ??
            item?.groupId,
          groupId:
            privateIndexEntry?.groupId ??
            privateIndexEntry?.group ??
            item?.groupId ??
            item?.group,
        }
      : {}),
  };
};

const sanitizePreviewMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") return {};
  const safe = {};
  const filename = getPreviewPropertyValue(metadata, [
    "filename",
    "fileName",
    "displayName",
    "name",
  ]);
  const mimeType = getPreviewPropertyValue(metadata, [
    "mimeType",
    "mime",
    "contentType",
    "mediaType",
  ]);
  const sizeInBytes = getPreviewPropertyValue(metadata, [
    "sizeInBytes",
    "size",
    "dataSize",
    "createdSize",
    "totalSize",
  ]);
  const title = getPreviewPropertyValue(metadata, ["title"]);
  const groupId = getPreviewPropertyValue(metadata, ["groupId", "group"]);
  const encryptionType = getPreviewPropertyValue(metadata, [
    "encryptionType",
    "encryption",
  ]);
  const previewKind = getPreviewPropertyValue(metadata, ["previewKind"]);

  if (filename) safe.filename = filename;
  if (filename && !safe.displayName) safe.displayName = filename;
  if (mimeType) safe.mimeType = mimeType;
  if (title) safe.title = title;
  if (sizeInBytes !== undefined && sizeInBytes !== null) {
    const parsedSize = Number(sizeInBytes);
    if (Number.isFinite(parsedSize) && parsedSize >= 0) {
      safe.sizeInBytes = parsedSize;
    }
  }
  if (groupId !== undefined && groupId !== null) {
    const parsedGroupId = Number(groupId);
    if (Number.isFinite(parsedGroupId)) {
      safe.groupId = parsedGroupId;
    }
  }
  if (encryptionType) safe.encryptionType = encryptionType;
  if (previewKind) safe.previewKind = previewKind;
  return safe;
};

const buildPreviewHints = (file, properties, privateIndexEntry) => {
  const mimeType = getPreviewPropertyValue(file, ["mimeType"]);
  const propertyMimeType = getPreviewPropertyValue(properties, [
    "mimeType",
    "mime",
    "contentType",
    "mediaType",
  ]);
  const indexMimeType = getPreviewPropertyValue(privateIndexEntry, [
    "mimeType",
  ]);
  const filename = getFileNameForInference(file);
  const propertyFilename = getPreviewPropertyValue(properties, [
    "filename",
    "fileName",
    "displayName",
    "name",
  ]);
  const indexFilename = getPreviewPropertyValue(privateIndexEntry, [
    "filename",
    "displayName",
    "name",
  ]);
  const encryptionType =
    getPreviewPropertyValue(file, ["encryptionType"]) ||
    getPreviewPropertyValue(properties, ["encryptionType", "encryption"]) ||
    getPreviewPropertyValue(privateIndexEntry, ["encryptionType"]);
  const sharingKey =
    getPreviewPropertyValue(file, ["sharingKey", "key"]) ||
    getPreviewPropertyValue(properties, ["sharingKey", "key"]) ||
    getPreviewPropertyValue(privateIndexEntry, ["sharingKey", "key"]);
  const publicKey =
    getPreviewPropertyValue(file, ["publicKey"]) ||
    getPreviewPropertyValue(properties, ["publicKey"]) ||
    getPreviewPropertyValue(privateIndexEntry, ["publicKey"]);
  const groupId =
    getPreviewPropertyValue(file, ["groupId", "group"]) ||
    getPreviewPropertyValue(properties, ["groupId", "group"]) ||
    getPreviewPropertyValue(privateIndexEntry, ["groupId", "group"]);

  const encrypted = isEncryptedResource(file);
  const resolvedMimeType = encrypted
    ? indexMimeType || mimeType || propertyMimeType || ""
    : mimeType || propertyMimeType || indexMimeType || "";
  const resolvedFilename = encrypted
    ? indexFilename || filename || propertyFilename || ""
    : filename || propertyFilename || indexFilename || "";

  return {
    mimeType: resolvedMimeType,
    filename: resolvedFilename,
    displayName: resolvedFilename,
    encryptionType: encryptionType || "",
    sharingKey: sharingKey || "",
    publicKey: publicKey || "",
    groupId: Number(groupId) || 0,
    previewKind:
      inferPreviewKindFromMimeType(resolvedMimeType) ||
      inferPreviewKindFromMimeType(propertyMimeType) ||
      inferPreviewKindFromMimeType(indexMimeType) ||
      "",
  };
};

const cachePrivatePreviewHints = async (
  file,
  accountAddress,
  hints,
  privateIndexEntry = null
) => {
  if (!accountAddress || !isEncryptedResource(file)) return;
  if (!hints || typeof hints !== "object") return;

  const filenameCandidates = [
    hints?.filename,
    hints?.displayName,
    file?.name,
    file?.filename,
    file?.displayName,
    privateIndexEntry?.filename,
    privateIndexEntry?.displayName,
  ].filter((candidate) => typeof candidate === "string" && candidate.trim());
  const resolvedFilename =
    filenameCandidates.find(
      (candidate) => !isGenericPrivateResourceLabel(candidate)
    ) || "";
  const resolvedSizeInBytes = (() => {
    const candidate = hints?.sizeInBytes ?? privateIndexEntry?.sizeInBytes;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  })();

  const hasCacheableHint =
    Boolean(hints?.mimeType) ||
    Boolean(resolvedFilename) ||
    Boolean(hints?.encryptionType) ||
    Boolean(hints?.sharingKey) ||
    Boolean(hints?.publicKey) ||
    resolvedSizeInBytes !== undefined;

  if (!hasCacheableHint) return;

  try {
    await upsertPrivateResourceIndexEntry(accountAddress, {
      resourceKey: [
        file?.qortalName || "",
        getServiceName(file) || "",
        file?.identifier || "",
        file?.group || file?.groupId || 0,
      ].join("|"),
      qortalName: file?.qortalName || "",
      service: getServiceName(file),
      identifier: file?.identifier,
      ...(resolvedFilename ? { filename: resolvedFilename } : {}),
      ...(resolvedFilename ? { displayName: resolvedFilename } : {}),
      mimeType: hints?.mimeType || file?.mimeType || "application/octet-stream",
      ...(resolvedSizeInBytes !== undefined
        ? { sizeInBytes: resolvedSizeInBytes }
        : {}),
      encryptionType: hints?.encryptionType || file?.encryptionType || "",
      ...(hints?.groupId
        ? { group: hints.groupId, groupId: hints.groupId }
        : {}),
      ...(hints?.sharingKey ? { sharingKey: hints.sharingKey } : {}),
      ...(hints?.publicKey ? { publicKey: hints.publicKey } : {}),
    });
  } catch (error) {}
};

const cachePrivatePreviewThumbnail = async (
  file,
  accountAddress,
  data64,
  mimeType,
  privateIndexEntry = null,
  options = {}
) => {
  if (!accountAddress || !isEncryptedResource(file)) return;
  if (!data64 || typeof data64 !== "string") return;
  const force = options?.force === true;
  const normalizedMimeType = inferPreviewKindFromMimeType(mimeType) === "image"
    ? mimeType
    : "";
  if (!normalizedMimeType) return;
  if (!force && privateIndexEntry?.thumbnailData64) return;

  try {
    const thumbnail = await createImageThumbnailData64(
      data64,
      normalizedMimeType,
      {
        maxWidth: 160,
        maxHeight: 160,
        outputMimeType: "image/jpeg",
        quality: 0.82,
      }
    );

    if (!thumbnail?.data64) return;

    await upsertPrivateResourceIndexEntry(accountAddress, {
      resourceKey: [
        file?.qortalName || "",
        getServiceName(file) || "",
        file?.identifier || "",
        file?.group || file?.groupId || 0,
      ].join("|"),
      qortalName: file?.qortalName || "",
      service: getServiceName(file),
      identifier: file?.identifier,
      thumbnailData64: thumbnail.data64,
      thumbnailMimeType: thumbnail.mimeType || "image/jpeg",
    });
  } catch (error) {}
};

const fetchResourceBase64 = async (file, signal) => {
  const previewUrl = getResourcePreviewUrl(file);
  if (!previewUrl) throw new Error("Preview unavailable for this file");
  const response = await fetch(`${previewUrl}?encoding=base64`, { signal });
  if (!response.ok) {
    throw new Error(`Could not fetch resource (${response.status})`);
  }
  return response.text();
};

const isUsableDecryptedPayload = (
  candidate,
  sourceData64,
  expectedKind = "",
  expectedMimeType = ""
) => {
  const normalized = normalizeDecryptedPayload(candidate?.data64 || candidate);
  const trimmed = normalized.data64?.trim();
  if (!trimmed) return false;
  if (trimmed === sourceData64?.trim()) return false;

  try {
    base64ToUint8Array(trimmed);
  } catch (error) {
    return false;
  }

  const detectedMimeType =
    normalized?.metadata?.mimeType ||
    inferMimeTypeFromBase64(trimmed) ||
    expectedMimeType ||
    "";
  const detectedKind =
    inferPreviewKindFromMimeType(detectedMimeType) ||
    inferPreviewKindFromMimeType(expectedMimeType) ||
    "";

  if (expectedKind && expectedKind !== "unknown") {
    if (expectedKind === "text") {
      return isProbablyTextContent(tryDecodeTextFromBase64(trimmed));
    }
    return detectedKind === expectedKind;
  }

  return Boolean(detectedKind || detectedMimeType);
};

const decryptResourcePayload = async (
  file,
  encryptedData,
  hints = {},
  accountPublicKey = ""
) => {
  const groupId = file?.group || file?.groupId || hints?.groupId;
  const sharingKey = file?.sharingKey || file?.key || hints?.sharingKey;
  const publicKey = file?.publicKey || hints?.publicKey || accountPublicKey;
  const expectedKind =
    hints?.previewKind || inferPreviewKindFromMimeType(hints?.mimeType) || "";
  const expectedMimeType = hints?.mimeType || "";

  const attempts = [];
  if (groupId) {
    attempts.push({
      action: "DECRYPT_QORTAL_GROUP_DATA",
      data64: encryptedData,
      groupId,
    });
  }

  attempts.push({
    action: "DECRYPT_DATA_WITH_SHARING_KEY",
    encryptedData,
    data64: encryptedData,
    ...(sharingKey ? { key: sharingKey } : {}),
    ...(publicKey ? { publicKey } : {}),
  });

  attempts.push({
    action: "DECRYPT_DATA",
    encryptedData,
    data64: encryptedData,
    ...(publicKey ? { publicKey } : {}),
  });

  for (const attempt of attempts) {
    try {
      const candidate = normalizeDecryptedPayload(await requestQortal(attempt));
      if (
        !isUsableDecryptedPayload(
          candidate,
          encryptedData,
          expectedKind,
          expectedMimeType
        )
      ) {
        continue;
      }
      return candidate;
    } catch (error) {}
  }

  throw new Error("Could not decrypt preview");
};

const fetchPreviewPayload = async (
  file,
  signal,
  accountAddress,
  accountPublicKey = "",
  options = {}
) => {
  const cacheThumbnail = options?.cacheThumbnail !== false;
  const data = await fetchResourceBase64(file, signal);
  if (!isEncryptedResource(file)) {
    return {
      data64: data,
      metadata: {},
    };
  }

  const properties = await fetchResourcePropertiesForPreview(file);
  const privateIndex = accountAddress
    ? await getPersistedPrivateResourceIndex(
        accountAddress,
        [file?.qortalName, file?.name].filter(Boolean)
      )
    : null;
  const privateIndexEntry = findPrivateIndexEntry(privateIndex, file);
  const hints = buildPreviewHints(file, properties, privateIndexEntry);
  await cachePrivatePreviewHints(
    file,
    accountAddress,
    hints,
    privateIndexEntry
  );

  const expectedKind =
    hints?.previewKind || inferPreviewKindFromMimeType(hints?.mimeType);
  const rawCandidate = normalizeDecryptedPayload(data);
  if (
    isUsableDecryptedPayload(rawCandidate, data, expectedKind, hints?.mimeType)
  ) {
    const rawPayload = {
      data64: rawCandidate.data64,
      metadata: sanitizePreviewMetadata({
        ...hints,
        ...(rawCandidate.metadata || {}),
      }),
    };
    await cachePrivatePreviewHints(
      file,
      accountAddress,
      {
        ...hints,
        ...(rawPayload.metadata || {}),
      },
      privateIndexEntry
    );
    const rawPayloadMimeType =
      rawPayload.metadata?.mimeType ||
      hints?.mimeType ||
      inferMimeTypeFromBase64(rawPayload.data64);
    if (
      cacheThumbnail &&
      inferPreviewKindFromMimeType(rawPayloadMimeType) === "image"
    ) {
      await cachePrivatePreviewThumbnail(
        file,
        accountAddress,
        rawPayload.data64,
        rawPayloadMimeType,
        privateIndexEntry,
        { force: true }
      );
    }
    return rawPayload;
  }

  const decrypted = await decryptResourcePayload(
    file,
    data,
    hints,
    accountPublicKey
  );
  await cachePrivatePreviewHints(
    file,
    accountAddress,
    {
      ...hints,
      ...(decrypted.metadata || {}),
    },
    privateIndexEntry
  );
  const decryptedPayloadMimeType =
    decrypted.metadata?.mimeType ||
    hints?.mimeType ||
    inferMimeTypeFromBase64(decrypted.data64);
  if (
    cacheThumbnail &&
    inferPreviewKindFromMimeType(decryptedPayloadMimeType) === "image"
  ) {
    await cachePrivatePreviewThumbnail(
      file,
      accountAddress,
      decrypted.data64,
      decryptedPayloadMimeType,
      privateIndexEntry,
      { force: true }
    );
  }
  return {
      data64: decrypted.data64,
      metadata: sanitizePreviewMetadata({
        ...hints,
      ...(decrypted.metadata || {}),
    }),
  };
};

const safeLower = (value) => {
  if (typeof value === "string") return value.toLowerCase();
  if (value === undefined || value === null) return "";
  try {
    return String(value).toLowerCase();
  } catch (error) {
    return "";
  }
};

const safeUpper = (value) => {
  if (typeof value === "string") return value.toUpperCase();
  if (value === undefined || value === null) return "";
  try {
    return String(value).toUpperCase();
  } catch (error) {
    return "";
  }
};

const getFileNameForInference = (file) => {
  const encrypted = isEncryptedResource(file);
  const candidates = encrypted
    ? [
        file?.name,
        file?.displayName,
        file?.filename,
        file?.title,
        file?.fetchedResourceProperties?.filename,
      ]
    : [
        file?.filename,
        file?.displayName,
        file?.name,
        file?.title,
        file?.fetchedResourceProperties?.filename,
      ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      (!encrypted || !isGenericPrivateResourceLabel(candidate))
    ) {
      return candidate;
    }
  }
  if (encrypted) {
    const fallbackCandidate = [
      file?.displayName,
      file?.filename,
      file?.name,
    ].find((candidate) => typeof candidate === "string" && candidate.trim());
    if (fallbackCandidate) return fallbackCandidate;
  }
  return "";
};

const getFileExtension = (file) => {
  const name = getFileNameForInference(file);
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return safeLower(parts.pop());
};

const inferMimeTypeFromExtension = (extension) => {
  const ext = safeLower(extension);
  if (!ext) return "";

  const extensionToMime = {
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    toml: "application/toml",
    ini: "text/plain",
    log: "text/plain",
    js: "application/javascript",
    mjs: "application/javascript",
    cjs: "application/javascript",
    ts: "application/typescript",
    jsx: "text/jsx",
    tsx: "text/tsx",
    css: "text/css",
    html: "text/html",
    htm: "text/html",
    sh: "application/x-sh",
    bat: "text/plain",
    py: "text/x-python",
    java: "text/x-java-source",
    c: "text/x-c",
    cpp: "text/x-c++",
    h: "text/x-c",
    hpp: "text/x-c++",
    go: "text/x-go",
    rs: "text/plain",
    sol: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
    pdf: "application/pdf",
    mp4: "video/mp4",
    webm: "video/webm",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
  };

  return extensionToMime[ext] || "";
};

const isTextLikeMimeType = (mimeType) => {
  const normalized = safeLower(mimeType);
  if (!normalized) return false;
  if (normalized.startsWith("text/")) return true;
  return EXTRA_TEXT_MIME_TYPES.has(normalized);
};

const inferPreviewKind = (file) => {
  const mime = safeLower(file?.mimeType);
  const service =
    safeUpper(getServiceName(file)) ||
    safeUpper(file?.service) ||
    safeUpper(file?.service?.name) ||
    safeUpper(file?.serviceName);
  const name = safeLower(getFileNameForInference(file));
  const extension = getFileExtension(file);
  const extensionMime = inferMimeTypeFromExtension(extension);
  const effectiveMime = mime || extensionMime;

  if (effectiveMime.startsWith("image/")) return "image";
  if (effectiveMime.startsWith("video/")) return "video";
  if (effectiveMime.startsWith("audio/")) return "audio";
  if (
    isTextLikeMimeType(effectiveMime) ||
    TEXT_PREVIEW_EXTENSIONS.has(extension)
  )
    return "text";

  if (effectiveMime === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    service.includes("IMAGE") ||
    service.includes("THUMBNAIL") ||
    /\.(png|jpg|jpeg|gif|webp|bmp|svg|avif)$/i.test(name)
  ) {
    return "image";
  }
  if (
    service.includes("VIDEO") ||
    /\.(mp4|webm|m4v|mov|mkv|avi)$/i.test(name)
  ) {
    return "video";
  }
  if (
    service.includes("AUDIO") ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)
  ) {
    return "audio";
  }

  return "unknown";
};

const getItemDisplayName = (item) => {
  if (!item) return "";
  if (item.type === "file") {
    return getPreferredFileDisplayName(item);
  }
  return item.name || "";
};

const getItemSizeBytes = (item) => {
  if (!item || item.type !== "file") return null;
  const candidates = [
    item?.sizeInBytes,
    item?.size,
    item?.fileSize,
    item?.dataSize,
    item?.createdSize,
    item?.totalSize,
  ];
  for (const candidate of candidates) {
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return numericValue;
    }
  }
  return null;
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  if (unitIndex < 0) return `${bytes} B`;
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unitIndex]}`;
};

const getNodeSelectionKey = (item) =>
  `${item?.type || ""}|${item?.name || ""}|${item?.identifier || ""}|${
    item?.service || ""
  }|${item?.group || 0}`;

const stableStringify = (value) => {
  if (value === undefined || typeof value === "function") return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const getPreferredFileDisplayName = (item) => {
  const displayName =
    typeof item?.displayName === "string" ? item.displayName : "";
  const name = typeof item?.name === "string" ? item.name : "";

  if (displayName && !isGenericPrivateResourceLabel(displayName)) {
    return displayName;
  }
  if (name && !isGenericPrivateResourceLabel(name)) {
    return name;
  }
  return displayName || name || "";
};

const getFileIdentity = (file) =>
  [
    file?.qortalName || "",
    getServiceName(file) || "",
    file?.identifier || "",
    file?.group || file?.groupId || 0,
  ].join("|");

const getFileSummaryName = (file) =>
  file?.displayName ||
  file?.filename ||
  file?.name ||
  file?.identifier ||
  "File";

const collectFileSystemEntries = (tree, scope, entries = []) => {
  const walk = (nodes, path = []) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node) continue;
      const nextPath = [...path, node.name || ""].filter(Boolean);
      if (node.type === "file") {
        entries.push({
          key: getFileIdentity(node) || `${scope}|${nextPath.join("/")}`,
          scope,
          label: `${scope}: ${getFileSummaryName(node)}`,
          serialized: stableStringify(node),
          size: getItemSizeBytes(node),
        });
      }
      if (Array.isArray(node.children)) {
        walk(node.children, nextPath);
      }
    }
  };
  walk(tree);
  return entries;
};

const collectFileSystemStructureEntries = (tree, scope, entries = []) => {
  const walk = (nodes, path = []) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node) continue;

      const nodeName = node.name || "";
      const nextPath = [...path, nodeName].filter(Boolean);
      const normalizedNode = (() => {
        if (!node || typeof node !== "object") return {};
        const { children, ...rest } = node;
        return rest;
      })();

      if (node.type === "folder") {
        const childDescriptors = Array.isArray(node.children)
          ? node.children.map((child) => ({
              type: child?.type || "",
              name: child?.name || "",
              identifier: child?.identifier || "",
              service: child?.service || "",
              group: child?.group || child?.groupId || 0,
            }))
          : [];

        entries.push({
          key: `${scope}|${nextPath.join("/") || nodeName || "root"}`,
          scope,
          label: `${scope}: ${nodeName || "Folder"}`,
          serialized: stableStringify({
            ...normalizedNode,
            children: childDescriptors,
          }),
          size: 0,
        });
      } else {
        entries.push({
          key: `${scope}|${nextPath.join("/") || nodeName || "root"}`,
          scope,
          label: `${scope}: ${getFileSummaryName(node)}`,
          serialized: stableStringify(normalizedNode),
          size: getItemSizeBytes(node),
        });
      }

      if (Array.isArray(node.children)) {
        walk(node.children, nextPath);
      }
    }
  };

  walk(tree);
  return entries;
};

const collectSnapshotEntries = (snapshot) => {
  const entries = [];
  collectFileSystemEntries(snapshot?.public, "public", entries);
  collectFileSystemEntries(snapshot?.private, "private", entries);
  const groups =
    snapshot?.group && !Array.isArray(snapshot.group) ? snapshot.group : {};
  for (const [groupId, tree] of Object.entries(groups)) {
    collectFileSystemEntries(tree, `group ${groupId}`, entries);
  }
  return entries;
};

const collectSnapshotStructureEntries = (snapshot) => {
  const entries = [];
  collectFileSystemStructureEntries(snapshot?.public, "public", entries);
  collectFileSystemStructureEntries(snapshot?.private, "private", entries);
  const groups =
    snapshot?.group && !Array.isArray(snapshot.group) ? snapshot.group : {};
  for (const [groupId, tree] of Object.entries(groups)) {
    collectFileSystemStructureEntries(tree, `group ${groupId}`, entries);
  }
  return entries;
};

const collectPrivateIndexEntries = (snapshot) => {
  const entries = [];
  const privateIndex =
    snapshot?.privateResourceIndex || snapshot?.privateIndex || null;
  const rawEntries =
    privateIndex?.entries && typeof privateIndex.entries === "object"
      ? privateIndex.entries
      : {};

  for (const [entryKey, entry] of Object.entries(rawEntries)) {
    if (!entry || typeof entry !== "object") continue;
    const { updatedAt, ...meaningfulEntry } = entry;
    const serialized = stableStringify(meaningfulEntry);
    const label =
      entry.displayName ||
      entry.filename ||
      entry.name ||
      entry.identifier ||
      entryKey;
    entries.push({
      key: entry.resourceKey || entry.key || entryKey,
      scope: "private index",
      label: `private index: ${label}`,
      serialized,
      size: serialized.length,
    });
  }

  return entries;
};

const normalizePrivateResourceIndexForComparison = (privateIndex) => {
  if (!privateIndex || typeof privateIndex !== "object") return null;
  const { updatedAt, ...rest } = privateIndex;
  const rawEntries =
    rest.entries && typeof rest.entries === "object" ? rest.entries : {};
  const normalizedEntries = {};

  for (const [entryKey, entry] of Object.entries(rawEntries)) {
    if (!entry || typeof entry !== "object") continue;
    const { updatedAt: entryUpdatedAt, ...meaningfulEntry } = entry;
    normalizedEntries[entryKey] = meaningfulEntry;
  }

  return {
    ...rest,
    entries: normalizedEntries,
  };
};

const normalizeQdnSyncPayloadForComparison = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  return {
    public: snapshot.public,
    private: snapshot.private,
    group: snapshot.group,
    ...(snapshot?.privateResourceIndex
      ? {
          privateResourceIndex: normalizePrivateResourceIndexForComparison(
            snapshot.privateResourceIndex
          ),
        }
      : {}),
  };
};

const summarizeFileSystemSnapshot = (snapshot) => {
  const entries = collectSnapshotEntries(snapshot);
  const totalBytes = entries.reduce(
    (sum, entry) => sum + (Number(entry.size) || 0),
    0
  );
  const groupCount =
    snapshot?.group && !Array.isArray(snapshot.group)
      ? Object.keys(snapshot.group).length
      : 0;
  return {
    files: entries.length,
    groups: groupCount,
    sizeLabel: entries.some((entry) => entry.size !== null)
      ? formatBytes(totalBytes)
      : "Unknown",
  };
};

const summarizePrivateIndexSnapshot = (snapshot) => {
  const entries = collectPrivateIndexEntries(snapshot);
  const totalBytes = entries.reduce(
    (sum, entry) => sum + (Number(entry.size) || 0),
    0
  );

  return {
    entries: entries.length,
    sizeLabel: entries.length > 0 ? formatBytes(totalBytes) : "Unknown",
  };
};

const diffEntries = (fromEntries, toEntries) => {
  const fromMap = new Map(fromEntries.map((entry) => [entry.key, entry]));
  const toMap = new Map(toEntries.map((entry) => [entry.key, entry]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const entry of toEntries) {
    const previous = fromMap.get(entry.key);
    if (!previous) {
      added.push(entry.label);
      continue;
    }
    if (previous.serialized !== entry.serialized) {
      changed.push(entry.label);
    }
  }

  for (const entry of fromEntries) {
    if (!toMap.has(entry.key)) {
      removed.push(entry.label);
    }
  }

  return {
    added,
    removed,
    changed,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
  };
};

const diffFileSystemSnapshots = (fromSnapshot, toSnapshot) =>
  diffEntries(
    collectSnapshotStructureEntries(fromSnapshot),
    collectSnapshotStructureEntries(toSnapshot)
  );

const diffPrivateIndexSnapshots = (fromSnapshot, toSnapshot) =>
  diffEntries(
    collectPrivateIndexEntries(fromSnapshot),
    collectPrivateIndexEntries(toSnapshot)
  );

const summarizeQdnSyncPayload = (snapshot) => ({
  fileSystem: summarizeFileSystemSnapshot(snapshot),
  privateIndex: summarizePrivateIndexSnapshot(snapshot),
});

const diffQdnSyncPayload = (fromSnapshot, toSnapshot) => {
  const fileSystem = diffFileSystemSnapshots(fromSnapshot, toSnapshot);
  const privateIndex = diffPrivateIndexSnapshots(fromSnapshot, toSnapshot);
  return {
    fileSystem,
    privateIndex,
    hasChanges: fileSystem.hasChanges || privateIndex.hasChanges,
  };
};

const formatChangeList = (items) => {
  if (!items.length) return "None";
  const visible = items.slice(0, 8);
  const suffix =
    items.length > visible.length
      ? `, +${items.length - visible.length} more`
      : "";
  return `${visible.join(", ")}${suffix}`;
};

const FilePreviewDialog = ({
  file,
  onClose,
  onHydrateMetadata,
  accountAddress,
  accountPublicKey,
}) => {
  const previewKind = inferPreviewKind(file);
  const previewUrl = getResourcePreviewUrl(file);
  const previewResourceKey = getFileIdentity(file);
  const encrypted = isEncryptedResource(file);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState("");
  const [resolvedPreviewKind, setResolvedPreviewKind] = useState("");
  const [resolvedMimeType, setResolvedMimeType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewErrorMessage, setPreviewErrorMessage] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [textPreviewError, setTextPreviewError] = useState("");
  const noMetadataPreviewMessage =
    "We do not have enough metadata for this file to preview it.";

  useEffect(() => {
    setPreviewError(false);
    setPreviewErrorMessage("");
  }, [previewResourceKey]);

  useEffect(() => {
    setTextPreview("");
    setTextPreviewError("");
    setTextPreviewLoading(false);
  }, [previewResourceKey, previewKind]);

  useEffect(() => {
    setResolvedPreviewUrl("");
    setResolvedPreviewKind("");
    setResolvedMimeType("");
    setPreviewLoading(false);

    if (!file || !previewUrl || !encrypted) {
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    let objectUrl = "";

    const loadEncryptedMedia = async () => {
      setPreviewLoading(true);
      setPreviewError(false);

      try {
        const payload = await fetchPreviewPayload(
          file,
          controller.signal,
          accountAddress,
          accountPublicKey
        );
        if (disposed) return;
        if (payload?.metadata && Object.keys(payload.metadata).length > 0) {
          onHydrateMetadata?.(payload.metadata);
        }
        const payloadMimeType =
          payload?.metadata?.mimeType ||
          file?.mimeType ||
          inferMimeTypeFromExtension(getFileExtension(file)) ||
          inferMimeTypeFromBase64(payload.data64);
        const payloadKind =
          inferPreviewKindFromMimeType(payloadMimeType) ||
          (previewKind !== "unknown" ? previewKind : "");
        setResolvedMimeType(payloadMimeType);
        setResolvedPreviewKind(payloadKind || "unknown");

        if (!payloadKind) {
          setPreviewError(true);
          setPreviewErrorMessage(noMetadataPreviewMessage);
          return;
        }

        if (payloadKind === "text") {
          setTextPreview(trimForTextPreview(decodeBase64Utf8(payload.data64)));
          return;
        }

        objectUrl = URL.createObjectURL(
          base64ToBlob(
            payload.data64,
            payloadMimeType || "application/octet-stream"
          )
        );
        setResolvedPreviewUrl(objectUrl);
      } catch (error) {
        if (!controller.signal.aborted && !disposed) {
          setPreviewError(true);
          setPreviewErrorMessage(
            error?.message || "Could not decrypt preview."
          );
        }
      } finally {
        if (!disposed) {
          setPreviewLoading(false);
        }
      }
    };

    loadEncryptedMedia();

    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    previewResourceKey,
    encrypted,
    previewUrl,
    accountAddress,
    accountPublicKey,
  ]);

  useEffect(() => {
    if (!file || encrypted || previewKind !== "text" || !previewUrl) {
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    const fetchTextPreview = async () => {
      setTextPreviewLoading(true);
      setTextPreviewError("");

      try {
        const payload = await fetchPreviewPayload(
          file,
          controller.signal,
          accountAddress,
          accountPublicKey
        );
        if (payload?.metadata && Object.keys(payload.metadata).length > 0) {
          onHydrateMetadata?.(payload.metadata);
        }
        const decoded = trimForTextPreview(decodeBase64Utf8(payload.data64));
        if (disposed) return;
        setTextPreview(decoded);
      } catch (base64Error) {
        if (controller.signal.aborted || disposed) return;
        try {
          const plainResponse = await fetch(previewUrl, {
            signal: controller.signal,
          });
          if (!plainResponse.ok) {
            throw new Error(`Text fetch failed (${plainResponse.status})`);
          }
          const plainText = await plainResponse.text();
          if (disposed) return;
          setTextPreview(trimForTextPreview(plainText));
        } catch (plainError) {
          if (controller.signal.aborted || disposed) return;
          setTextPreviewError(
            plainError?.message ||
              base64Error?.message ||
              "Could not load text preview"
          );
        }
      } finally {
        if (!disposed) {
          setTextPreviewLoading(false);
        }
      }
    };

    fetchTextPreview();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [previewResourceKey, encrypted, previewKind, previewUrl, accountAddress]);

  const mediaPreviewUrl = encrypted ? resolvedPreviewUrl : previewUrl;
  const effectivePreviewKind = encrypted
    ? resolvedPreviewKind || previewKind
    : previewKind;

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        style: {
          backgroundColor: "rgb(39, 40, 44)",
          color: "#ffffff",
        },
      }}
    >
      <DialogTitle>{getItemDisplayName(file) || "Preview"}</DialogTitle>
      <DialogContent>
        {!previewUrl && (
          <Typography>Preview unavailable for this file.</Typography>
        )}
        {!!previewUrl &&
          effectivePreviewKind === "image" &&
          !!mediaPreviewUrl &&
          !previewError && (
            <Box
              component="img"
              src={mediaPreviewUrl}
              onError={() => {
                setPreviewError(true);
                setPreviewErrorMessage("Could not render image preview.");
              }}
              sx={{
                width: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: "8px",
                backgroundColor: "rgba(0,0,0,0.2)",
              }}
            />
          )}
        {!!previewUrl && previewLoading && (
          <Typography sx={{ mb: "10px" }}>Decrypting preview...</Typography>
        )}
        {!!previewUrl && previewError && (
          <Typography color="error" sx={{ mb: "10px" }}>
            {previewErrorMessage || "Could not preview this resource inline."}
          </Typography>
        )}
        {!!previewUrl &&
          effectivePreviewKind === "pdf" &&
          !!mediaPreviewUrl &&
          !previewError && (
            <Box
              component="object"
              data={mediaPreviewUrl}
              type={resolvedMimeType || "application/pdf"}
              sx={{
                width: "100%",
                height: "70vh",
                maxHeight: "70vh",
                borderRadius: "8px",
                backgroundColor: "rgba(0,0,0,0.2)",
              }}
            >
              <Typography sx={{ p: 2 }}>Could not render PDF preview.</Typography>
            </Box>
          )}
        {!!previewUrl &&
          effectivePreviewKind === "video" &&
          !!mediaPreviewUrl &&
          !previewError && (
            <Box
              component="video"
              controls
              preload="metadata"
              onError={() => {
                setPreviewError(true);
                setPreviewErrorMessage("Could not render video preview.");
              }}
              src={mediaPreviewUrl}
              sx={{
                width: "100%",
                maxHeight: "70vh",
                borderRadius: "8px",
                backgroundColor: "rgba(0,0,0,0.2)",
              }}
            />
          )}
        {!!previewUrl &&
          effectivePreviewKind === "audio" &&
          !!mediaPreviewUrl &&
          !previewError && (
            <Box
              component="audio"
              controls
              preload="metadata"
              onError={() => {
                setPreviewError(true);
                setPreviewErrorMessage("Could not render audio preview.");
              }}
              src={mediaPreviewUrl}
              sx={{ width: "100%" }}
            />
          )}
        {!!previewUrl && effectivePreviewKind === "text" && (
          <>
            {textPreviewLoading && (
              <Typography>Loading text preview...</Typography>
            )}
            {!textPreviewLoading && !!textPreviewError && (
              <Typography>{textPreviewError}</Typography>
            )}
            {!textPreviewLoading && !textPreviewError && (
              <Box
                component="pre"
                sx={{
                  width: "100%",
                  maxHeight: "70vh",
                  overflow: "auto",
                  borderRadius: "8px",
                  backgroundColor: "rgba(0,0,0,0.28)",
                  padding: "12px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "13px",
                }}
              >
                {textPreview || "(File is empty)"}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const SortableItem = ({
  item,
  onClick,
  onSelect,
  removeFile,
  removeDirectory,
  rename,
  fileSystem,
  moveNode,
  currentPath,
  selected,
  onPreview,
  showThumbnails,
  showPrivateThumbnails,
  onHydrateMetadata,
  onTogglePin,
  accountAddress,
  accountPublicKey,
  privateThumbnailAttemptedRef,
}) => {
  const sortableId = getNodeSelectionKey(item);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: sortableId,
    });
  const clickTimeoutRef = useRef(null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [decryptedThumbnailUrl, setDecryptedThumbnailUrl] = useState("");
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const previewKind = inferPreviewKind(item);
  const encrypted = isEncryptedResource(item);
  const shouldShowThumbnail =
    item?.type === "file" &&
    (encrypted ? showPrivateThumbnails : showThumbnails);
  const thumbnailUrl =
    shouldShowThumbnail && !encrypted && previewKind === "image"
      ? getResourcePreviewUrl(item)
      : "";
  const privateThumbnailMimeType =
    item?.thumbnailMimeType || item?.mimeType || "image/jpeg";
  const cachedPrivateThumbnailUrl =
    shouldShowThumbnail && encrypted && item?.thumbnailData64
      ? `data:${privateThumbnailMimeType};base64,${item.thumbnailData64}`
      : "";

  useEffect(() => {
    setThumbnailError(false);
  }, [
    item?.identifier,
    item?.service,
    item?.qortalName,
    item?.thumbnailData64,
    item?.thumbnailMimeType,
    accountAddress,
    accountPublicKey,
    showThumbnails,
    showPrivateThumbnails,
  ]);

  useEffect(() => {
    setDecryptedThumbnailUrl("");
    setThumbnailLoading(false);

    if (!shouldShowThumbnail) return;
    if (!encrypted) return;
    if (cachedPrivateThumbnailUrl) return;

    const attemptedSet = privateThumbnailAttemptedRef?.current;
    const cacheKey = [
      getFileIdentity(item),
      accountPublicKey || "",
    ].join("|");
    if (attemptedSet?.has(cacheKey)) return;
    attemptedSet?.add(cacheKey);

    const controller = new AbortController();
    let disposed = false;

    const loadThumbnail = async () => {
      setThumbnailLoading(true);
      try {
        const payload = await fetchPreviewPayload(
          item,
          controller.signal,
          accountAddress,
          accountPublicKey,
          { cacheThumbnail: false }
        );
        if (disposed) return;
        const thumbnailMimeType =
          payload?.metadata?.mimeType ||
          item?.mimeType ||
          inferMimeTypeFromExtension(getFileExtension(item)) ||
          inferMimeTypeFromBase64(payload.data64);
        if (inferPreviewKindFromMimeType(thumbnailMimeType) !== "image") {
          return;
        }
        const thumbnail = await createImageThumbnailData64(
          payload.data64,
          thumbnailMimeType || "image/png",
          {
            maxWidth: 160,
            maxHeight: 160,
            outputMimeType: "image/jpeg",
            quality: 0.82,
          }
        );
        if (disposed || controller.signal.aborted) return;
        if (!thumbnail?.data64) return;
        await upsertPrivateResourceIndexEntry(accountAddress, {
          resourceKey: getFileIdentity(item),
          qortalName: item?.qortalName || "",
          service: getServiceName(item),
          identifier: item?.identifier,
          thumbnailData64: thumbnail.data64,
          thumbnailMimeType: thumbnail.mimeType || "image/jpeg",
        });
        setDecryptedThumbnailUrl(
          `data:${thumbnail.mimeType || "image/jpeg"};base64,${thumbnail.data64}`
        );
      } catch (error) {
        if (!controller.signal.aborted && !disposed) {
          setThumbnailError(true);
        }
      } finally {
        if (!disposed) {
          setThumbnailLoading(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    item?.identifier,
    item?.service,
    item?.qortalName,
    item?.mimeType,
    item?.thumbnailData64,
    shouldShowThumbnail,
    encrypted,
    accountAddress,
    accountPublicKey,
    cachedPrivateThumbnailUrl,
    privateThumbnailAttemptedRef,
  ]);

  const effectiveThumbnailUrl = encrypted
    ? cachedPrivateThumbnailUrl || decryptedThumbnailUrl
    : thumbnailUrl;

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    };
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px",
    marginBottom: "10px",
    borderRadius: "12px",
    cursor: "grab",
  };

  return (
    <ContextMenuPinnedFiles
      rename={rename}
      type={item?.type}
      removeFile={removeFile}
      removeDirectory={removeDirectory}
      fileSystem={fileSystem}
      currentPath={currentPath}
      moveNode={moveNode}
      item={item}
      onPreview={item?.type === "file" ? onPreview : undefined}
      onHydrateMetadata={item?.type === "file" ? onHydrateMetadata : undefined}
      pinned={Boolean(item?.pinned)}
      onTogglePin={item?.type === "file" ? onTogglePin : undefined}
    >
      <ButtonBase
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        sx={{
          ...style,
          position: "relative",
          minHeight: "132px",
          width: "122px",
          background:
            item.type === "folder"
              ? "linear-gradient(180deg, rgba(54,72,121,0.35) 0%, rgba(27,36,60,0.35) 100%)"
              : "linear-gradient(180deg, rgba(66,66,66,0.35) 0%, rgba(36,36,36,0.35) 100%)",
          border: selected
            ? "2px solid #59b2ff"
            : "1px solid rgba(132, 162, 214, 0.35)",
          boxShadow: selected
            ? "0 0 0 2px rgba(89,178,255,0.2), 0 8px 24px rgba(0,0,0,0.28)"
            : "0 8px 24px rgba(0,0,0,0.22)",
          "&:hover": {
            borderColor: "#6aaef4",
            transform: "translateY(-2px)",
          },
        }}
        onClick={(event) => {
          if (item?.type !== "file") {
            onClick?.(event);
            return;
          }
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
          }
          if (event?.shiftKey || event?.metaKey || event?.ctrlKey) {
            onSelect?.(event);
            return;
          }
          clickTimeoutRef.current = setTimeout(() => {
            onClick?.(event);
            clickTimeoutRef.current = null;
          }, 220);
        }}
        onDoubleClick={() => {
          if (item?.type !== "file") {
            return;
          }
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
          }
          onPreview?.();
        }}
      >
        {item?.type === "file" && (
          <Checkbox
            checked={selected}
            size="small"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect?.(event);
            }}
            sx={{
              position: "absolute",
              top: "2px",
              left: "2px",
              zIndex: 2,
              p: "2px",
              color: "#93b8e7",
              "&.Mui-checked": { color: "#59b2ff" },
              backgroundColor: "rgba(15, 17, 22, 0.42)",
              borderRadius: "6px",
            }}
          />
        )}
        {item?.type === "file" && Boolean(item?.pinned) && (
          <PushPinIcon
            sx={{
              position: "absolute",
              top: "6px",
              right: "6px",
              fontSize: "17px",
              color: "#7fc3ff",
              opacity: 0.92,
              zIndex: 2,
            }}
          />
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "8px",
            width: "100%",
            alignItems: "center",
          }}
        >
          <Avatar
            sx={{
              height: "48px",
              width: "48px",
              alignSelf: "center",
              backgroundColor:
                item.type === "folder"
                  ? "rgba(60,106,190,0.42)"
                  : "rgba(88,88,88,0.45)",
            }}
          >
            {item.type === "folder" ? (
              <FolderIcon sx={{ color: "#c9ddff" }} />
            ) : effectiveThumbnailUrl && !thumbnailError ? (
              <Box
                component="img"
                src={effectiveThumbnailUrl}
                onError={() => setThumbnailError(true)}
                sx={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "inherit",
                }}
              />
            ) : (
              <AttachFileIcon sx={{ color: "#f1f1f1" }} />
            )}
          </Avatar>
          <Typography
            sx={{
              width: "100%",
              wordBreak: "break-word",
              textWrap: "wrap",
              textAlign: "center",
              fontSize: "14px",
              lineHeight: "1.25",
              fontWeight: 500,
              color: "#f7f9ff",
            }}
          >
            {getItemDisplayName(item)}
          </Typography>
        </Box>
      </ButtonBase>
    </ContextMenuPinnedFiles>
  );
};

export const Manager = ({
  myAddress,
  groups,
  ownedNames = [],
  activeName = "",
  onChangeActiveName,
}) => {
  const [fileSystemPublic, setFileSystemPublic] = useState(null);
  const [fileSystemPrivate, setFileSystemPrivate] = useState(null);
  const [fileSystemGroup, setFileSystemGroup] = useState(
    initialGroupFileSystem
  );
  const [selectedGroup, setSelectedGroup] = useState(null);
  const publishNames = Array.isArray(myAddress?.names)
    ? myAddress.names.filter((item) => item?.name)
    : myAddress?.name?.name
      ? [myAddress.name]
      : [];
  const [activePublishName, setActivePublishName] = useState(
    myAddress?.name?.name || ""
  );

  const [mode, setMode] = useState("public");
  const [privateIndexRevision, setPrivateIndexRevision] = useState(0);
  const [privateResourceIndex, setPrivateResourceIndex] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePrivateIndexChanged = () => {
      setPrivateIndexRevision((prev) => prev + 1);
    };

    window.addEventListener(
      "q-manager-private-index-changed",
      handlePrivateIndexChanged
    );

    return () => {
      window.removeEventListener(
        "q-manager-private-index-changed",
        handlePrivateIndexChanged
      );
    };
  }, []);

  useEffect(() => {
    if (!myAddress?.address) {
      setPrivateResourceIndex(null);
      return undefined;
    }

    let disposed = false;
    const loadPrivateResourceIndex = async () => {
      try {
        const loadedIndex = await getPersistedPrivateResourceIndex(
          myAddress.address,
          [myAddress?.name?.name, activePublishName].filter(Boolean)
        );
        if (!disposed) {
          setPrivateResourceIndex(loadedIndex);
        }
      } catch (error) {
        if (!disposed) {
          setPrivateResourceIndex(null);
        }
      }
    };

    loadPrivateResourceIndex();

    return () => {
      disposed = true;
    };
  }, [
    myAddress?.address,
    myAddress?.name?.name,
    activePublishName,
    privateIndexRevision,
  ]);

  const [fileSystem, setFileSystem] = useMemo(() => {
    if (mode === "public") {
      return [fileSystemPublic, setFileSystemPublic];
    } else if (mode === "group") {
      if (selectedGroup) {
        const selectedGroupState =
          fileSystemGroup[selectedGroup] || initialFileSystem;
        const setSelectedGroupState = (newState) => {
          setFileSystemGroup((prev) => ({
            ...(prev || {}),
            [selectedGroup]: newState,
          }));
        };
        return [selectedGroupState, setSelectedGroupState];
      }
      return [fileSystemGroup, setFileSystemGroup];
    } else {
      return [fileSystemPrivate, setFileSystemPrivate];
    }
  }, [
    mode,
    fileSystemPublic,
    fileSystemPrivate,
    fileSystemGroup,
    selectedGroup,
  ]);

  const { isShow, onCancel, onOk, show, type } = useModal();
  const [newDirName, setNewDirName] = useState("");
  const [newName, setNewName] = useState("");
  const newDirInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [selectedFileKeys, setSelectedFileKeys] = useState([]);
  const selectionAnchorKeyRef = useRef("");
  const privateThumbnailAttemptedRef = useRef(new Set());
  const [showThumbnails, setShowThumbnails] = useState(() => {
    try {
      return localStorage.getItem(SHOW_THUMBNAILS_KEY) === "1";
    } catch (error) {
      return false;
    }
  });
  const [showPrivateThumbnails, setShowPrivateThumbnails] = useState(() => {
    try {
      return localStorage.getItem(SHOW_PRIVATE_THUMBNAILS_KEY) === "1";
    } catch (error) {
      return false;
    }
  });
  const [autoQdnFileSystemSync, setAutoQdnFileSystemSync] = useState(() => {
    try {
      return localStorage.getItem(AUTO_QDN_FILESYSTEM_SYNC_KEY) !== "0";
    } catch (error) {
      return true;
    }
  });
  const [qdnFileSystemLoadReady, setQdnFileSystemLoadReady] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveTargetPath, setBulkMoveTargetPath] = useState([]);
  const [qdnSyncPrompt, setQdnSyncPrompt] = useState(null);
  const [qdnBackupDirty, setQdnBackupDirty] = useState(false);
  const fileSystemLoadedRef = useRef(false);
  const skipNextQdnPublishPromptRef = useRef(true);
  const qdnPublishPromptRef = useRef(null);
  const lastQdnSyncedSnapshotRef = useRef("");
  const dismissedPublishSnapshotRef = useRef("");
  const checkedQdnLoadRef = useRef(false);

  const [currentPath, setCurrentPath] = useState(["Root"]);
  const [isOpenPublish, setIsOpenPublish] = useState(false);
  const currentFolder = useMemo(() => {
    if (!fileSystem) return "";
    let folder = fileSystem[0];
    for (const segment of currentPath.slice(1)) {
      folder = folder.children.find(
        (child) => child.name === segment && child.type === "folder"
      );
    }
    return folder;
  }, [currentPath, fileSystem]);

  useEffect(() => {
    if (!selectedGroup && groups?.length > 0) {
      setSelectedGroup(groups[0]?.groupId);
    }
  }, [groups]);

  useEffect(() => {
    if (!activePublishName && myAddress?.name?.name) {
      setActivePublishName(myAddress.name.name);
    }
  }, [activePublishName, myAddress?.name?.name]);

  useEffect(() => {
    if (isShow && type === "new-directory") {
      const timer = setTimeout(() => {
        newDirInputRef.current?.focus?.();
        newDirInputRef.current?.select?.();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isShow, type]);

  useEffect(() => {
    setSelectedFileKeys([]);
  }, [mode, selectedGroup]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_THUMBNAILS_KEY, showThumbnails ? "1" : "0");
    } catch (error) {}
  }, [showThumbnails]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SHOW_PRIVATE_THUMBNAILS_KEY,
        showPrivateThumbnails ? "1" : "0"
      );
    } catch (error) {}
  }, [showPrivateThumbnails]);

  useEffect(() => {
    try {
      localStorage.setItem(
        AUTO_QDN_FILESYSTEM_SYNC_KEY,
        autoQdnFileSystemSync ? "1" : "0"
      );
    } catch (error) {}
  }, [autoQdnFileSystemSync]);

  const showPublishNotice = (prompt) => {
    qdnPublishPromptRef.current = prompt;
    setQdnBackupDirty(true);
  };

  const openPublishPrompt = () => {
    if (!qdnPublishPromptRef.current) return;
    setQdnSyncPrompt(qdnPublishPromptRef.current);
  };

  const clearPublishNotice = () => {
    qdnPublishPromptRef.current = null;
    setQdnBackupDirty(false);
  };

  const handleNavigate = (folderName) => {
    setSelectedFileKeys([]);
    setCurrentPath((prev) => [...prev, folderName]);
  };

  const handleBack = () => {
    if (currentPath.length > 1) {
      setSelectedFileKeys([]);
      setCurrentPath((prev) => prev.slice(0, -1));
    }
  };

  useEffect(() => {
    if (!myAddress?.address) return;
    const fetchFileSystem = async () => {
      checkedQdnLoadRef.current = false;
      setQdnFileSystemLoadReady(false);
      setQdnSyncPrompt(null);
      setQdnBackupDirty(false);
      qdnPublishPromptRef.current = null;
      const data = await getPersistedFileSystemQManager(myAddress?.address);
      const currentPrivateResourceIndex = await getPersistedPrivateResourceIndex(
        myAddress?.address,
        [myAddress?.name?.name, activePublishName].filter(Boolean)
      ).catch(() => null);
      const loadedPayload =
        data?.private && data?.public
          ? {
              public: data.public,
              private: data.private,
              group:
                data?.group && !Array.isArray(data.group)
                  ? data.group
                  : initialGroupFileSystem,
            }
          : {
              public: initialFileSystem,
              private: initialFileSystem,
              group: initialGroupFileSystem,
            };
      if (currentPrivateResourceIndex) {
        loadedPayload.privateResourceIndex = currentPrivateResourceIndex;
      }
      setPrivateResourceIndex(currentPrivateResourceIndex);
      if (data?.private && data?.public) {
        setFileSystemPublic(data?.public);
        setFileSystemPrivate(data?.private);
        const groupData =
          data?.group && !Array.isArray(data.group)
            ? data.group
            : initialGroupFileSystem;
        setFileSystemGroup(groupData);
      } else {
        setFileSystemPublic(initialFileSystem);
        setFileSystemPrivate(initialFileSystem);
        setFileSystemGroup(initialGroupFileSystem);
      }
      fileSystemLoadedRef.current = true;
      setQdnFileSystemLoadReady(true);
    };
    fetchFileSystem();
  }, [myAddress?.address]);

  useEffect(() => {
    const qdnOwnerNameCandidate = activePublishName || myAddress?.name?.name;
    if (!qdnOwnerNameCandidate || !qdnFileSystemLoadReady || checkedQdnLoadRef.current) {
      return;
    }

    let disposed = false;
    checkedQdnLoadRef.current = true;
    const loadPublishedFileSystem = async () => {
      try {
        const qdnOwnerName =
          (await resolvePreferredName(
            activePublishName || myAddress?.name?.name,
            myAddress?.address
          )) || myAddress?.name?.name;
        if (!qdnOwnerName) return;

        const imported = await importFileSystemQManagerFromQDN(
          qdnOwnerName
        );
        if (disposed || !imported?.public || !imported?.private) return;

        const currentPrivateResourceIndex =
          await getPersistedPrivateResourceIndex(
            myAddress?.address,
            [myAddress?.name?.name, activePublishName].filter(Boolean)
          );

        const importedPayload = {
          public: imported.public,
          private: imported.private,
          group:
            imported?.group && !Array.isArray(imported.group)
              ? imported.group
              : initialGroupFileSystem,
          ...(imported?.privateResourceIndex
            ? { privateResourceIndex: imported.privateResourceIndex }
            : {}),
        };
        const currentPayload = {
          public: fileSystemPublic,
          private: fileSystemPrivate,
          group: fileSystemGroup,
          ...(currentPrivateResourceIndex
            ? { privateResourceIndex: currentPrivateResourceIndex }
            : {}),
        };
        const localSnapshot = stableStringify(
          normalizeQdnSyncPayloadForComparison(currentPayload)
        );
        const importedSnapshot = stableStringify(
          normalizeQdnSyncPayloadForComparison(importedPayload)
        );

        // If the dismissed snapshot matches local, the user already rejected this QDN state.
        // Update the baseline to local and don't show the prompt (prevents deleted files from re-adding).
        const dismissedSnapshot = dismissedPublishSnapshotRef.current;
        if (dismissedSnapshot && dismissedSnapshot === localSnapshot) {
          lastQdnSyncedSnapshotRef.current = localSnapshot;
          return;
        }

        lastQdnSyncedSnapshotRef.current = importedSnapshot;
        if (localSnapshot === importedSnapshot) {
          return;
        }

        const diff = diffQdnSyncPayload(currentPayload, importedPayload);
        setQdnSyncPrompt({
          type: "load",
          title: "Load Published Filesystem Backup?",
          intro:
            "A QDN backup was found that differs from the filesystem currently loaded in Q-Manager. This includes both the filesystem structure and the private resource index.",
          fromLabel: "Current local",
          toLabel: "Published QDN backup",
          fromSummary: summarizeQdnSyncPayload(currentPayload),
          toSummary: summarizeQdnSyncPayload(importedPayload),
          diff,
          confirmLabel: "Load backup",
          onConfirm: async () => {
            if (disposed) return;
            skipNextQdnPublishPromptRef.current = true;
            setFileSystemPublic(imported.public);
            setFileSystemPrivate(imported.private);
            setFileSystemGroup(importedPayload.group);
            setCurrentPath(["Root"]);
            // Restore the private resource index from QDN backup too
            if (importedPayload?.privateResourceIndex && myAddress?.address) {
              await savePrivateResourceIndexEverywhere(
                importedPayload.privateResourceIndex,
                myAddress.address
              ).catch((error) => {
                console.error(
                  "Failed to restore private resource index from QDN backup:",
                  error
                );
              });
            }
            clearPublishNotice();
            dismissedPublishSnapshotRef.current = importedSnapshot;
            setQdnSyncPrompt(null);
          },
          onCancel: () => {
            const localSnap = stableStringify(
              normalizeQdnSyncPayloadForComparison(currentPayload)
            );
            lastQdnSyncedSnapshotRef.current = localSnap;
            dismissedPublishSnapshotRef.current = localSnap;
            setQdnSyncPrompt(null);
          },
        });
      } catch (error) {}
    };

    loadPublishedFileSystem();

    return () => {
      disposed = true;
    };
  }, [
    myAddress?.name?.name,
    activePublishName,
    qdnFileSystemLoadReady,
    fileSystemPublic,
    fileSystemPrivate,
    fileSystemGroup,
  ]);

  useEffect(() => {
    if (fileSystemPublic && fileSystemPrivate && myAddress?.address) {
      const syncFilesystemState = async () => {
        const privateResourceIndex = await getPersistedPrivateResourceIndex(
          myAddress?.address,
          [myAddress?.name?.name, activePublishName].filter(Boolean)
        );

        const payload = {
          public: fileSystemPublic ?? [],
          private: fileSystemPrivate ?? [],
          group: fileSystemGroup || {},
          ...(privateResourceIndex ? { privateResourceIndex } : {}),
        };

        saveFileSystemQManagerEverywhere(payload, myAddress?.address).catch(
          (error) => {
            console.error(
              "Failed to persist Q-Manager filesystem state:",
              error
            );
          }
        );

        if (skipNextQdnPublishPromptRef.current) {
          skipNextQdnPublishPromptRef.current = false;
          return;
        }

        queueQdnPublishPrompt(payload);
      };

      syncFilesystemState();
    }
  }, [
    fileSystemPublic,
    fileSystemPrivate,
    fileSystemGroup,
    myAddress?.address,
    myAddress?.name?.name,
    activePublishName,
    autoQdnFileSystemSync,
    privateIndexRevision,
  ]);
  const addDirectoryToCurrent = (directoryName) => {
    if (!directoryName || currentPath.length === 0) return false;

    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
    const targetFolder = currentPath[currentPath.length - 1]; // Current directory
    const parents = currentPath.slice(0, -1); // Parent directories

    let currentNodes = updatedFileSystem;

    // Traverse the parent directories
    for (const parent of parents) {
      const parentNode = currentNodes.find(
        (node) => node.name === parent && node.type === "folder"
      );
      if (!parentNode) return false; // Parent folder not found
      currentNodes = parentNode.children; // Move deeper into the tree
    }

    // Find the current directory
    const currentFolderNode = currentNodes.find(
      (node) => node.name === targetFolder && node.type === "folder"
    );
    if (currentFolderNode) {
      currentFolderNode.children = currentFolderNode.children || [];

      // Ensure unique directory name
      const existingNames = currentFolderNode.children
        .filter((child) => child.type === "folder") // Only check against other folders
        .map((child) => child.name);
      const uniqueDirectoryName = ensureUniqueName(
        directoryName,
        existingNames
      );

      // Add the new directory
      currentFolderNode.children.push({
        type: "folder",
        name: uniqueDirectoryName,
        children: [],
      });

      setFileSystem(updatedFileSystem); // Update the state
      queueQdnPublishPrompt(
        buildQdnSyncPayload({ updatedTree: updatedFileSystem })
      );
      return true;
    }

    return false; // Current directory not found
  };

  const addNodeByPath = (pathArray = currentPath, newNode) => {
    if (pathArray.length === 0) return false;
    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid mutating state
    const target = pathArray[pathArray.length - 1]; // Last item is the target directory
    const parents = pathArray.slice(0, -1); // All but the last item are parent directories

    let currentNodes = updatedFileSystem;

    // Traverse through the parent directories
    for (const parent of parents) {
      const parentNode = currentNodes.find(
        (node) => node.name === parent && node.type === "folder"
      );
      if (!parentNode) return false; // Parent folder not found
      currentNodes = parentNode.children; // Move deeper into the tree
    }

    // Add the new node to the target directory
    const targetNode = currentNodes.find(
      (node) => node.name === target && node.type === "folder"
    );
    if (!targetNode) return false; // Target directory not found

    targetNode.children = targetNode.children || [];

    // Ensure unique name for the new node based on type
    const existingNames = targetNode.children
      .filter((child) => child.type === newNode.type) // Only check for conflicts within the same type
      .map((child) => child.name);

    const nextNode = { ...newNode };
    nextNode.name = ensureUniqueName(nextNode.name, existingNames);
    if (nextNode.type === "file" && !nextNode.displayName) {
      nextNode.displayName = nextNode.name;
    }

    targetNode.children.push(nextNode);
    setFileSystem(updatedFileSystem);
    queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree: updatedFileSystem }));

    return true;
  };

  const removeByNodePath = async (
    pathArray = currentPath,
    filename,
    nodes = fileSystem
  ) => {
    if (pathArray.length === 0) return false;
    try {
      await show("delete-file");
      const updatedFileSystem = JSON.parse(JSON.stringify(nodes)); // Deep copy to avoid mutating state
      const targetFolder = pathArray[pathArray.length - 1]; // Last item in the path is the target folder
      const parents = pathArray.slice(0, -1); // All but the last item are parent directories

      let currentNodes = updatedFileSystem;

      // Traverse through the parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) return false; // Parent folder not found
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the target folder
      const targetFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!targetFolderNode || !targetFolderNode.children) return false; // Target folder not found or has no children

      // Find and remove the file
      const fileIndex = targetFolderNode.children.findIndex(
        (child) => child.name === filename && child.type === "file"
      );
      if (fileIndex !== -1) {
        targetFolderNode.children.splice(fileIndex, 1); // Remove the file from the children array
        setFileSystem(updatedFileSystem);
        queueQdnPublishPrompt(
          buildQdnSyncPayload({ updatedTree: updatedFileSystem })
        );
        return true;
      }

      return false; // File not found
    } catch (error) {}
  };

  // Helper function to ensure unique filenames
  const ensureUniqueName = (name, existingNames) => {
    if (!existingNames.includes(name)) return name;

    const nameParts = name.split(".");
    const extension = nameParts.length > 1 ? `.${nameParts.pop()}` : ""; // Extract extension
    let baseName = nameParts.join(".");

    let copyNumber = 1;
    let newName = `${baseName}-copy${extension}`;
    while (existingNames.includes(newName)) {
      copyNumber++;
      newName = `${baseName}-copy${copyNumber}${extension}`;
    }

    return newName;
  };

  const cloneInitialFileSystem = () =>
    JSON.parse(JSON.stringify(initialFileSystem));

  const buildResourceKey = (file) =>
    `${file?.qortalName || ""}|${file?.service || ""}|${file?.identifier || ""}|${
      file?.group || 0
    }`;

  const collectResourceKeys = (nodes, collected = new Set()) => {
    if (!Array.isArray(nodes)) return collected;
    for (const node of nodes) {
      if (!node) continue;
      if (node.type === "file") {
        collected.add(buildResourceKey(node));
      }
      if (Array.isArray(node.children)) {
        collectResourceKeys(node.children, collected);
      }
    }
    return collected;
  };

  const mergeDiscoveredFilesIntoTree = (treeNodes, filesToAdd) => {
    const nextTree =
      Array.isArray(treeNodes) && treeNodes.length > 0
        ? JSON.parse(JSON.stringify(treeNodes))
        : cloneInitialFileSystem();

    if (!nextTree[0]) {
      nextTree[0] = { type: "folder", name: "Root", children: [] };
    }
    nextTree[0].children = nextTree[0].children || [];

    let recoveredFolder = nextTree[0].children.find(
      (child) =>
        child.type === "folder" && child.name === RECOVERED_IMPORTS_FOLDER
    );

    if (!recoveredFolder) {
      recoveredFolder = {
        type: "folder",
        name: RECOVERED_IMPORTS_FOLDER,
        children: [],
      };
      nextTree[0].children.push(recoveredFolder);
    }

    recoveredFolder.children = recoveredFolder.children || [];

    const existingResourceKeys = collectResourceKeys(nextTree);
    const existingNames = recoveredFolder.children
      .filter((child) => child.type === "file")
      .map((child) => child.name);

    let addedCount = 0;
    for (const file of filesToAdd) {
      const key = buildResourceKey(file);
      if (existingResourceKeys.has(key)) continue;

      const uniqueName = ensureUniqueName(
        file?.name || file?.identifier || "Recovered file",
        existingNames
      );
      existingNames.push(uniqueName);
      existingResourceKeys.add(key);

      recoveredFolder.children.push({
        ...file,
        type: "file",
        name: uniqueName,
        displayName: file?.displayName || uniqueName,
      });
      addedCount++;
    }

    return {
      nextTree,
      addedCount,
    };
  };

  const discoverAndImportPublishedQManagerFiles = async () => {
    const promise = (async () => {
      const ownerName = await resolvePreferredName(currentName, myAddress?.address);
      if (!ownerName) {
        throw new Error("Could not determine your Qortal name");
      }

      const discovered = await discoverQManagerResourcesByName(ownerName);
      if (!Array.isArray(discovered) || discovered.length === 0) {
        throw new Error("No previously published Q-Manager files were found");
      }

      const groupedByTarget = discovered.reduce(
        (acc, resource) => {
          const identifier = resource?.identifier || "";
          const groupFromIdentifier = /^grp-(\d+)-q-manager/i.exec(identifier);
          const inferredGroupId =
            Number(resource?.groupId) ||
            Number(groupFromIdentifier?.[1]) ||
            (identifier.startsWith("grp-") ? Number(selectedGroup) || 0 : 0) ||
            0;
          const normalizedResource = {
            type: "file",
            name: resource?.name || resource?.identifier,
            displayName:
              resource?.displayName ||
              resource?.filename ||
              resource?.name ||
              resource?.identifier,
            identifier,
            service: resource?.service,
            qortalName: resource?.qortalName || ownerName,
            mimeType: resource?.mimeType,
            sizeInBytes: resource?.sizeInBytes,
            ...(inferredGroupId > 0
              ? {
                  group: inferredGroupId,
                  groupName:
                    groups?.find(
                      (groupItem) => groupItem.groupId === inferredGroupId
                    )?.groupName || `Group ${inferredGroupId}`,
                }
              : {}),
          };

          if (inferredGroupId > 0) {
            if (!acc.group[inferredGroupId]) {
              acc.group[inferredGroupId] = [];
            }
            acc.group[inferredGroupId].push(normalizedResource);
            return acc;
          }

          const isPrivate =
            normalizedResource?.service?.includes("_PRIVATE") ||
            normalizedResource?.identifier?.startsWith("p-");

          if (isPrivate) {
            acc.private.push(normalizedResource);
          } else {
            acc.public.push(normalizedResource);
          }
          return acc;
        },
        { public: [], private: [], group: {} }
      );

      let totalAdded = 0;

      const publicMerge = mergeDiscoveredFilesIntoTree(
        fileSystemPublic,
        groupedByTarget.public
      );
      if (publicMerge.addedCount > 0) {
        setFileSystemPublic(publicMerge.nextTree);
        totalAdded += publicMerge.addedCount;
      }

      const privateMerge = mergeDiscoveredFilesIntoTree(
        fileSystemPrivate,
        groupedByTarget.private
      );
      if (privateMerge.addedCount > 0) {
        setFileSystemPrivate(privateMerge.nextTree);
        totalAdded += privateMerge.addedCount;
      }

      if (Object.keys(groupedByTarget.group).length > 0) {
        const nextGroupState =
          fileSystemGroup && !Array.isArray(fileSystemGroup)
            ? { ...fileSystemGroup }
            : {};

        for (const [groupIdKey, files] of Object.entries(
          groupedByTarget.group
        )) {
          const groupId = Number(groupIdKey);
          const currentGroupTree =
            nextGroupState[groupId] || cloneInitialFileSystem();
          const mergedGroup = mergeDiscoveredFilesIntoTree(
            currentGroupTree,
            files
          );
          if (mergedGroup.addedCount > 0) {
            nextGroupState[groupId] = mergedGroup.nextTree;
            totalAdded += mergedGroup.addedCount;
          }
        }

        setFileSystemGroup(nextGroupState);
      }

      if (totalAdded === 0) {
        throw new Error(
          "Previously published Q-Manager files were found, but they are already in your current structure"
        );
      }

      setCurrentPath(["Root"]);
      return { added: totalAdded };
    })();

    openToast(promise, {
      loading: "Finding and importing your published Q-Manager files...",
      success: "Published Q-Manager files imported",
      error: (err) => `Import failed: ${err?.error || err?.message || err}`,
    });

    return promise;
  };

  const renameByPath = async (item) => {
    try {
      const pathArray = currentPath; // Get the current path
      const oldName = item.name; // Original name of the item
      const oldDisplayName = getItemDisplayName(item);
      setNewName(oldDisplayName);
      const newNameInput = await show("rename"); // Prompt user for the new name
      const type = item.type; // Type of the item (file or folder)

      // Ensure the new name is not empty
      if (!newNameInput || newNameInput.trim() === "") return false;

      let newName = newNameInput.trim(); // Trim spaces
      const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
      const targetFolder = pathArray[pathArray.length - 1]; // Current directory
      const parents = pathArray.slice(0, -1); // Parent directories

      let currentNodes = updatedFileSystem;

      // Traverse through parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) return false; // Parent folder not found
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the target folder
      const currentFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!currentFolderNode || !currentFolderNode.children) return false; // Current directory not found or empty

      // Check for conflicts with the new name within the same type
      const existingNames = currentFolderNode.children
        .filter((child) => child.type === type)
        .map((child) => child.name);

      // Ensure a unique name if there is a conflict
      if (type === "folder" && existingNames.includes(newName)) {
        let copyIndex = 1;
        const baseName = newName.replace(/(-copy\d*)?$/, ""); // Remove any existing "-copy" suffix
        while (existingNames.includes(newName)) {
          newName = `${baseName}-copy${copyIndex}`;
          copyIndex++;
        }
      }

      // Find the target node by name and type
      const targetNode = currentFolderNode.children.find(
        (child) => child.name === oldName && child.type === type
      );
      if (targetNode) {
        if (type === "file") {
          targetNode.displayName = newName;
          setFileSystem(updatedFileSystem);
          queueQdnPublishPrompt(
            buildQdnSyncPayload({ updatedTree: updatedFileSystem })
          );
          return true;
        }
        targetNode.name = newName; // Update the name
        setFileSystem(updatedFileSystem); // Update the state
        queueQdnPublishPrompt(
          buildQdnSyncPayload({ updatedTree: updatedFileSystem })
        );
        return true;
      }

      return false; // File or folder not found
    } catch (error) {
      console.log("error", error);
    } finally {
      setNewName("");
    }
  };

  const updateByPath = async (item) => {
    try {
      const pathArray = currentPath; // Get the current path
      const name = item.name; // Original name of the item
      const type = item.type; // Type of the item (file or folder)

      const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
      const targetFolder = pathArray[pathArray.length - 1]; // Current directory
      const parents = pathArray.slice(0, -1); // Parent directories

      let currentNodes = updatedFileSystem;

      // Traverse through parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) {
          console.error("Parent folder not found");
          return false; // Parent folder not found
        }
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the target folder
      const currentFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!currentFolderNode || !currentFolderNode.children) {
        console.error("Current directory not found or empty");
        return false; // Current directory not found or empty
      }

      // Find the target node by name and type
      const targetNodeIndex = currentFolderNode.children.findIndex(
        (child) => child.name === name && child.type === type
      );

      if (targetNodeIndex !== -1) {
        // Update the node in the file system
        currentFolderNode.children[targetNodeIndex] = {
          ...currentFolderNode.children[targetNodeIndex],
          ...item,
        };

        setFileSystem(updatedFileSystem); // Update the state
        queueQdnPublishPrompt(
          buildQdnSyncPayload({ updatedTree: updatedFileSystem })
        );
        return true;
      }

      console.error("File or folder not found");
      return false; // File or folder not found
    } catch (error) {
      console.error("Error updating file system:", error);
      return false;
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) return;

    const activeKey = String(active?.id || "");
    const overKey = String(over?.id || "");
    if (!activeKey || activeKey === overKey) return;

    const activeItem = currentFolder?.children?.find(
      (item) => getNodeSelectionKey(item) === activeKey
    );
    if (!activeItem) return;

    const selectedKeys = new Set(selectedFileKeys);
    const draggedItems =
      activeItem?.type === "file" &&
      selectedKeys.has(activeKey) &&
      selectedVisibleFiles.length > 1
        ? currentFolder.children.filter(
            (item) =>
              item?.type === "file" && selectedKeys.has(getNodeSelectionKey(item))
          )
        : [activeItem];

    const nextTree = cloneFileSystemTree(fileSystem);
    const sourcePathArray = currentPath;

    const breadcrumbTargetPath = parseBreadcrumbDropTarget(overKey);
    if (breadcrumbTargetPath) {
      if (breadcrumbTargetPath.join("/") === sourcePathArray.join("/")) {
        return;
      }

      let movedAny = false;
      for (const node of draggedItems) {
        movedAny =
          moveNodeInTree(
            nextTree,
            node.name,
            node.type,
            sourcePathArray,
            breadcrumbTargetPath
          ) || movedAny;
      }

      if (movedAny) {
        setFileSystem(nextTree);
        queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree: nextTree }));
        clearSelection();
      }
      return;
    }

    const overItem = currentFolder?.children?.find(
      (item) => getNodeSelectionKey(item) === overKey
    );
    if (!overItem) return;

    if (overItem?.type === "folder") {
      const targetPathArray = [...currentPath, overItem.name];
      let movedAny = false;
      for (const node of draggedItems) {
        movedAny =
          moveNodeInTree(
            nextTree,
            node.name,
            node.type,
            sourcePathArray,
            targetPathArray
          ) || movedAny;
      }

      if (movedAny) {
        setFileSystem(nextTree);
        queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree: nextTree }));
        clearSelection();
      }
      return;
    }

    if (activeItem?.type === "file" && overItem?.type === "file") {
      const draggedNames = Array.from(
        new Set([...draggedItems.map((node) => node.name), overItem.name])
      );
      const created = createFolderFromDroppedFilesInTree(
        nextTree,
        draggedNames,
        sourcePathArray,
        currentPath,
        "New Folder"
      );
      if (created) {
        setFileSystem(nextTree);
        queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree: nextTree }));
        clearSelection();
      }
      return;
    }
  };

  const deleteFolderInCurrent = async (folderName) => {
    if (!folderName || currentPath.length === 0) return false;
    try {
      await show("delete-directory");
      const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
      const targetFolder = currentPath[currentPath.length - 1]; // Current directory
      const parents = currentPath.slice(0, -1); // Parent directories

      let currentNodes = updatedFileSystem;

      // Traverse the parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) return false; // Parent folder not found
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the current directory
      const currentFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!currentFolderNode || !currentFolderNode.children) return false; // Current directory not found or empty

      // Find and remove the folder by name
      const folderIndex = currentFolderNode.children.findIndex(
        (child) => child.name === folderName && child.type === "folder"
      );
      if (folderIndex !== -1) {
        currentFolderNode.children.splice(folderIndex, 1); // Remove the folder
        setFileSystem(updatedFileSystem); // Update the state
        queueQdnPublishPrompt(
          buildQdnSyncPayload({ updatedTree: updatedFileSystem })
        );
        return true;
      }

      return false; // Folder not found
    } catch (error) {}
  };

  const traverseToFolder = (pathArray, nodes) => {
    let currentNodes = nodes;

    for (const dir of pathArray) {
      if (!currentNodes || !Array.isArray(currentNodes)) {
        console.error(`Invalid currentNodes for dir: ${dir}`);
        return null;
      }

      const folder = currentNodes.find(
        (node) => node.name === dir && node.type === "folder"
      );

      if (!folder) {
        console.error(`Folder not found: ${dir}`);
        return null; // Folder not found
      }

      currentNodes = folder.children;
    }

    return currentNodes; // Returns the children array of the target folder
  };

  const setFileSystemAtPath = (pathArray, updatedTree) => {
    if (mode === "public") {
      setFileSystemPublic(updatedTree);
    } else if (mode === "private") {
      setFileSystemPrivate(updatedTree);
    } else {
      setFileSystemGroup((prev) => ({
        ...(prev || {}),
        [selectedGroup]: updatedTree,
      }));
    }
  };

  const buildQdnSyncPayload = ({
    updatedTree = null,
    publicTree = fileSystemPublic,
    privateTree = fileSystemPrivate,
    groupTree = fileSystemGroup,
    privateIndex = privateResourceIndex,
  } = {}) => ({
    public:
      mode === "public" && updatedTree ? updatedTree : publicTree ?? [],
    private:
      mode === "private" && updatedTree ? updatedTree : privateTree ?? [],
    group:
      mode === "group" && updatedTree
        ? {
            ...(
              groupTree && !Array.isArray(groupTree)
                ? groupTree
                : initialGroupFileSystem
            ),
            ...(selectedGroup !== null && selectedGroup !== undefined
              ? { [selectedGroup]: updatedTree }
              : {}),
          }
        : groupTree && !Array.isArray(groupTree)
          ? groupTree
          : initialGroupFileSystem,
    ...(privateIndex ? { privateResourceIndex: privateIndex } : {}),
  });

  const queueQdnPublishPrompt = (nextPayload) => {
    if (!nextPayload) return;
    const qdnOwnerName = activePublishName || myAddress?.name?.name;
    if (!qdnOwnerName) return;
    if (!fileSystemLoadedRef.current) return;

    const normalizedPayload = normalizeQdnSyncPayloadForComparison(nextPayload);
    const currentSnapshot = stableStringify(normalizedPayload);
    const baselineSnapshot = lastQdnSyncedSnapshotRef.current;
    if (
      currentSnapshot === baselineSnapshot ||
      currentSnapshot === dismissedPublishSnapshotRef.current
    ) {
      setQdnBackupDirty(false);
      qdnPublishPromptRef.current = null;
      return;
    }
    const baselinePayload = (() => {
      if (!baselineSnapshot) {
        return {
          public: [],
          private: [],
          group: {},
          privateResourceIndex: { entries: {} },
        };
      }
      try {
        return JSON.parse(baselineSnapshot);
      } catch (error) {
        return {
          public: [],
          private: [],
          group: {},
          privateResourceIndex: { entries: {} },
        };
      }
    })();
    const diff = diffQdnSyncPayload(baselinePayload, normalizedPayload);
    if (!diff.hasChanges) {
      setQdnBackupDirty(false);
      qdnPublishPromptRef.current = null;
      return;
    }

    showPublishNotice({
      type: "publish",
      title: "Publish Filesystem Backup Update?",
      intro:
        "Your local Q-Manager filesystem differs from the last QDN backup.",
      fromLabel: "Last QDN backup",
      toLabel: "Current local",
      fromSummary: summarizeQdnSyncPayload(baselinePayload),
      toSummary: summarizeQdnSyncPayload(normalizedPayload),
      diff,
      confirmLabel: "Publish update",
      onConfirm: async () => {
        try {
          const publishPromise = publishFileSystemQManagerToQDN({
            fileSystemQManager: {
              public: nextPayload.public,
              private: nextPayload.private,
              group: nextPayload.group,
            },
            privateResourceIndex: nextPayload.privateResourceIndex,
            activePublishName: qdnOwnerName,
          });

          openToast(publishPromise, {
            loading: "Publishing filesystem structure to QDN...",
            success: "Filesystem structure published to QDN",
            error: (err) =>
              `Publish failed: ${err?.error || err?.message || err}`,
          });
          await publishPromise;
          lastQdnSyncedSnapshotRef.current = currentSnapshot;
          dismissedPublishSnapshotRef.current = "";
          clearPublishNotice();
        } catch (error) {
          console.error("Failed to publish filesystem backup update:", error);
        } finally {
          setQdnSyncPrompt(null);
        }
      },
      onCancel: () => {
        dismissedPublishSnapshotRef.current = currentSnapshot;
        setQdnSyncPrompt(null);
      },
    });
  };

  const cloneFileSystemTree = (tree) => JSON.parse(JSON.stringify(tree || []));

  const getFolderNodeByPath = (tree, pathArray) => {
    if (
      !Array.isArray(tree) ||
      !Array.isArray(pathArray) ||
      pathArray.length === 0
    ) {
      return null;
    }

    let currentNodes = tree;
    let folderNode = null;

    for (const segment of pathArray) {
      folderNode = currentNodes.find(
        (node) => node?.type === "folder" && node?.name === segment
      );
      if (!folderNode) {
        return null;
      }
      currentNodes = Array.isArray(folderNode.children) ? folderNode.children : [];
    }

    return folderNode;
  };

  const moveNodeInTree = (
    tree,
    nodeName,
    nodeType,
    sourcePathArray,
    targetPathArray
  ) => {
    if (
      !Array.isArray(tree) ||
      !nodeName ||
      !nodeType ||
      !Array.isArray(sourcePathArray) ||
      !Array.isArray(targetPathArray) ||
      sourcePathArray.length === 0 ||
      targetPathArray.length === 0
    ) {
      return false;
    }

    if (nodeType === "folder") {
      const sourceItemPathKey = [...sourcePathArray, nodeName].join("/");
      const targetFolderKey = targetPathArray.join("/");
      if (
        targetFolderKey === sourceItemPathKey ||
        targetFolderKey.startsWith(`${sourceItemPathKey}/`)
      ) {
        return false;
      }
    }

    const sourceFolderNode = getFolderNodeByPath(tree, sourcePathArray);
    const targetFolderNode = getFolderNodeByPath(tree, targetPathArray);
    if (!sourceFolderNode || !targetFolderNode) {
      return false;
    }

    sourceFolderNode.children = sourceFolderNode.children || [];
    targetFolderNode.children = targetFolderNode.children || [];

    const sourceIndex = sourceFolderNode.children.findIndex(
      (node) => node?.name === nodeName && node?.type === nodeType
    );
    if (sourceIndex === -1) {
      return false;
    }

    const [nodeToMove] = sourceFolderNode.children.splice(sourceIndex, 1);
    const existingNames = targetFolderNode.children
      .filter((node) => node?.type === nodeType)
      .map((node) => node.name);
    const nextNode = {
      ...nodeToMove,
      name: ensureUniqueName(nodeToMove.name, existingNames),
    };

    if (nextNode.type === "file" && !nextNode.displayName) {
      nextNode.displayName = nextNode.name;
    }
    if (nextNode.type === "folder") {
      nextNode.children = Array.isArray(nextNode.children)
        ? nextNode.children
        : [];
    }

    targetFolderNode.children.push(nextNode);
    return true;
  };

  const createFolderFromDroppedFilesInTree = (
    tree,
    nodeNames,
    sourcePathArray,
    targetPathArray,
    folderName = "New Folder"
  ) => {
    if (
      !Array.isArray(tree) ||
      !Array.isArray(nodeNames) ||
      nodeNames.length === 0 ||
      !Array.isArray(sourcePathArray) ||
      !Array.isArray(targetPathArray)
    ) {
      return false;
    }

    const sourceFolderNode = getFolderNodeByPath(tree, sourcePathArray);
    const targetFolderNode = getFolderNodeByPath(tree, targetPathArray);
    if (!sourceFolderNode || !targetFolderNode) {
      return false;
    }

    sourceFolderNode.children = sourceFolderNode.children || [];
    targetFolderNode.children = targetFolderNode.children || [];

    const desiredNames = new Set(nodeNames);
    const nodesToMove = [];
    sourceFolderNode.children = sourceFolderNode.children.filter((node) => {
      if (node?.type !== "file" || !desiredNames.has(node.name)) {
        return true;
      }
      nodesToMove.push(node);
      return false;
    });

    if (nodesToMove.length === 0) {
      return false;
    }

    const existingFolderNames = targetFolderNode.children
      .filter((node) => node?.type === "folder")
      .map((node) => node.name);
    const nextFolderName = ensureUniqueName(folderName, existingFolderNames);
    targetFolderNode.children.push({
      type: "folder",
      name: nextFolderName,
      children: nodesToMove.map((node) => ({
        ...node,
        ...(node?.type === "file" && !node?.displayName
          ? { displayName: node.name }
          : {}),
      })),
    });

    return true;
  };

  const parseBreadcrumbDropTarget = (dropId) => {
    if (typeof dropId !== "string") return null;
    if (!dropId.startsWith("breadcrumb|")) return null;
    const encodedPath = dropId.slice("breadcrumb|".length);
    const pathArray = encodedPath.split("/").filter(Boolean);
    return pathArray.length > 0 ? pathArray : null;
  };

  const moveNodeByPath = (
    nodeName,
    nodeType,
    sourcePathArray,
    targetPathArray
  ) => {
    if (
      !nodeName ||
      !nodeType ||
      !Array.isArray(sourcePathArray) ||
      sourcePathArray.length === 0
    ) {
      console.error("Invalid parameters");
      return false;
    }
    if (!Array.isArray(targetPathArray) || targetPathArray.length === 0) {
      console.error("Invalid target path");
      return false;
    }
    if (!fileSystem || !Array.isArray(fileSystem)) {
      console.error("Current file system is not available");
      return false;
    }

    const sourceFolderKey = sourcePathArray.join("/");
    const targetFolderKey = targetPathArray.join("/");
    if (sourceFolderKey === targetFolderKey) {
      console.error("Source and target folders are the same");
      return false;
    }

    // Prevent moving a folder into itself or one of its descendants.
    if (nodeType === "folder") {
      const sourceItemPathKey = [...sourcePathArray, nodeName].join("/");
      if (
        targetFolderKey === sourceItemPathKey ||
        targetFolderKey.startsWith(`${sourceItemPathKey}/`)
      ) {
        console.error("Cannot move a folder into itself or one of its children");
        return false;
      }
    }

    const updatedTree = cloneFileSystemTree(fileSystem);
    const moved = moveNodeInTree(
      updatedTree,
      nodeName,
      nodeType,
      sourcePathArray,
      targetPathArray
    );
    if (!moved) {
      console.error("Node not found in source folder");
      return false;
    }

    setFileSystemAtPath(targetPathArray, updatedTree);
    queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree }));
    return true;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Set a distance to avoid triggering drag on small movements
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 10, // Also apply to touch
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const visibleItems = useMemo(() => {
    const baseItems = currentFolder?.children || [];
    if (mode !== "group") return baseItems;
    return baseItems.filter(
      (item) =>
        item.type === "folder" ||
        (item.type === "file" && item?.group === selectedGroup)
    );
  }, [currentFolder?.children, mode, selectedGroup]);

  const resolvedVisibleItems = useMemo(
    () =>
      visibleItems.map((item) =>
        resolvePrivateResourceItem(item, privateResourceIndex)
      ),
    [visibleItems, privateResourceIndex]
  );

  const selectedVisibleFiles = useMemo(() => {
    return resolvedVisibleItems.filter(
      (item) =>
        item?.type === "file" &&
        selectedFileKeys.includes(getNodeSelectionKey(item))
    );
  }, [resolvedVisibleItems, selectedFileKeys]);

  const visibleFileKeys = useMemo(
    () =>
      resolvedVisibleItems
        .filter((item) => item?.type === "file")
        .map((item) => getNodeSelectionKey(item)),
    [resolvedVisibleItems]
  );

  const selectedSizeSummary = useMemo(() => {
    let totalBytes = 0;
    let knownCount = 0;
    for (const item of selectedVisibleFiles) {
      const size = getItemSizeBytes(item);
      if (size === null) continue;
      totalBytes += size;
      knownCount++;
    }
    return {
      totalBytes,
      knownCount,
      unknownCount: selectedVisibleFiles.length - knownCount,
    };
  }, [selectedVisibleFiles]);

  const resolvedSelectedFile = useMemo(
    () =>
      selectedFile
        ? resolvePrivateResourceItem(selectedFile, privateResourceIndex)
        : null,
    [selectedFile, privateResourceIndex]
  );

  const resolvedPreviewFile = useMemo(
    () =>
      previewFile
        ? resolvePrivateResourceItem(previewFile, privateResourceIndex)
        : null,
    [previewFile, privateResourceIndex]
  );

  const setSelectionAnchor = (key) => {
    selectionAnchorKeyRef.current = key || "";
  };

  const selectFileRange = (item) => {
    if (item?.type !== "file") return;
    const key = getNodeSelectionKey(item);
    const anchorKey = selectionAnchorKeyRef.current;
    const anchorIndex = visibleFileKeys.indexOf(anchorKey);
    const targetIndex = visibleFileKeys.indexOf(key);

    if (anchorIndex === -1 || targetIndex === -1) {
      setSelectionAnchor(key);
      setSelectedFileKeys([key]);
      return;
    }

    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);
    const rangeKeys = visibleFileKeys.slice(startIndex, endIndex + 1);
    setSelectionAnchor(key);
    setSelectedFileKeys(rangeKeys);
  };

  const toggleSelectFile = (item, event = null) => {
    if (item?.type !== "file") return;
    const key = getNodeSelectionKey(item);

    if (event?.shiftKey) {
      event.preventDefault?.();
      event.stopPropagation?.();
      selectFileRange(item);
      return;
    }

    if (event?.metaKey || event?.ctrlKey) {
      event.preventDefault?.();
      event.stopPropagation?.();
      setSelectionAnchor(key);
      setSelectedFileKeys((prev) =>
        prev.includes(key)
          ? prev.filter((entry) => entry !== key)
          : [...prev, key]
      );
      return;
    }

    setSelectionAnchor(key);
    setSelectedFileKeys((prev) =>
      prev.includes(key)
        ? prev.filter((entry) => entry !== key)
        : [...prev, key]
    );
  };

  const togglePinByPath = (item) => {
    if (!item || item?.type !== "file") return;
    updateByPath({
      ...item,
      pinned: !item?.pinned,
    });
  };

  const clearSelection = () => {
    setSelectionAnchor("");
    setSelectedFileKeys([]);
  };

  const removeSelectedFromManager = () => {
    if (selectedVisibleFiles.length === 0) return;
    const selectedKeys = new Set(
      selectedVisibleFiles.map((item) => getNodeSelectionKey(item))
    );
    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem));
    let currentNodes = updatedFileSystem;

    for (const parent of currentPath.slice(0, -1)) {
      const parentNode = currentNodes.find(
        (node) => node.name === parent && node.type === "folder"
      );
      if (!parentNode) return;
      currentNodes = parentNode.children;
    }

    const targetFolder = currentNodes.find(
      (node) =>
        node.name === currentPath[currentPath.length - 1] &&
        node.type === "folder"
    );
    if (!targetFolder || !Array.isArray(targetFolder.children)) return;

    targetFolder.children = targetFolder.children.filter((child) => {
      if (child?.type !== "file") return true;
      return !selectedKeys.has(getNodeSelectionKey(child));
    });

    setFileSystem(updatedFileSystem);
    queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree: updatedFileSystem }));
    clearSelection();
  };

  const renderFolderTreeForBulkMove = (directories, path = []) => {
    return (directories || [])
      .filter((node) => node?.type === "folder")
      .map((dir) => {
        const fullPath = [...path, dir.name];
        const isSelectedTarget =
          fullPath.join("/") === bulkMoveTargetPath.join("/");
        const isCurrentPath = fullPath.join("/") === currentPath.join("/");

        return (
          <Box key={fullPath.join("/")}>
            <ButtonBase
              onClick={() => {
                if (isCurrentPath) return;
                setBulkMoveTargetPath(fullPath);
              }}
              sx={{
                width: "100%",
                justifyContent: "flex-start",
                px: "8px",
                py: "6px",
                borderRadius: "8px",
                opacity: isCurrentPath ? 0.6 : 1,
                backgroundColor: isSelectedTarget
                  ? "rgba(89,178,255,0.2)"
                  : "transparent",
              }}
            >
              <FolderIcon
                sx={{
                  mr: "8px",
                  color: isSelectedTarget ? "#74c6ff" : "#b6cff0",
                }}
              />
              <Typography sx={{ fontSize: "14px" }}>{dir.name}</Typography>
            </ButtonBase>
            {Array.isArray(dir.children) && dir.children.length > 0 && (
              <Box sx={{ pl: "16px" }}>
                {renderFolderTreeForBulkMove(dir.children, fullPath)}
              </Box>
            )}
          </Box>
        );
      });
  };

  const moveSelectedToPath = () => {
    if (selectedVisibleFiles.length === 0 || bulkMoveTargetPath.length === 0) {
      return;
    }

    const selectedKeys = new Set(
      selectedVisibleFiles.map((item) => getNodeSelectionKey(item))
    );

    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem));

    const traverseFolder = (pathArray) => {
      let nodes = updatedFileSystem;
      let folder = null;
      for (const part of pathArray) {
        folder = nodes.find(
          (node) => node.name === part && node.type === "folder"
        );
        if (!folder) return null;
        nodes = folder.children;
      }
      return folder;
    };

    const sourceFolder = traverseFolder(currentPath);
    const targetFolder = traverseFolder(bulkMoveTargetPath);
    if (!sourceFolder || !targetFolder) return;

    sourceFolder.children = sourceFolder.children || [];
    targetFolder.children = targetFolder.children || [];

    const movedNodes = [];
    sourceFolder.children = sourceFolder.children.filter((node) => {
      if (node?.type !== "file") return true;
      if (!selectedKeys.has(getNodeSelectionKey(node))) return true;
      movedNodes.push(node);
      return false;
    });

    for (const node of movedNodes) {
      const existingNames = targetFolder.children
        .filter((child) => child.type === node.type)
        .map((child) => child.name);
      node.name = ensureUniqueName(node.name, existingNames);
      targetFolder.children.push(node);
    }

    setFileSystem(updatedFileSystem);
    queueQdnPublishPrompt(buildQdnSyncPayload({ updatedTree: updatedFileSystem }));

    setShowBulkMoveModal(false);
    setBulkMoveTargetPath([]);
    clearSelection();
  };

  const isPrivateService = (service) => {
    return (
      typeof service === "string" && service.toUpperCase().includes("_PRIVATE")
    );
  };

  const isGroupResource = (file) => {
    return Boolean(file?.group || file?.groupId);
  };

  const isPrivateFile = (file) => {
    // Check encryptionType field (e.g., "private" or "group")
    const encryptionType =
      typeof file?.encryptionType === "string"
        ? file.encryptionType.toLowerCase()
        : "";
    if (encryptionType === "private" || encryptionType === "group") {
      return true;
    }
    // Also check if service name indicates private
    const service = getServiceName(file);
    if (
      typeof service === "string" &&
      service.toUpperCase().includes("_PRIVATE")
    ) {
      return true;
    }
    // Check identifier prefix
    const identifier = file?.identifier || "";
    if (typeof identifier === "string") {
      const idLower = identifier.toLowerCase();
      if (
        idLower.startsWith("p-") ||
        idLower.startsWith("pvt-") ||
        idLower.startsWith("grp-")
      ) {
        return true;
      }
    }
    return false;
  };

  const getPrivateServiceName = (file) => {
    const baseService = file.service?.toUpperCase() || "";
    const isAlreadyPrivate = baseService.includes("_PRIVATE");
    return isAlreadyPrivate ? baseService : `${baseService}_PRIVATE`;
  };

  const deleteSelectedFromQDN = async () => {
    if (selectedVisibleFiles.length === 0) return;
    const filesToDelete = [...selectedVisibleFiles];

    const accountPublicKey = myAddress?.publicKey || "";
    const myName = activePublishName || myAddress?.name?.name || "";

    const promise = (async () => {
      skipNextQdnPublishPromptRef.current = true;
      removeSelectedFromManager();

      const failures = [];

      for (const file of filesToDelete) {
        if (!file?.identifier || !file?.service) continue;

        if (isPrivateFile(file) || isPrivateService(file.service)) {
          // Private service type or encrypted file - need to publish encrypted data.
          const tombstonePayload = btoa("d");
          const sharingKey = file?.sharingKey || file?.key;
          const targetService = getPrivateServiceName(file) || file.service;

          // Try 1: ENCRYPT_DATA_WITH_SHARING_KEY uses the stored sharing key from private index entry
          // The Qortal Wallet looks up the sharing key internally using the resource's identifier
          // Note: ENCRYPT_DATA_WITH_SHARING_KEY uses `base64` param (not data64), and returns a raw base64 string
          try {
            console.log(
              "[DELETE] Try ENCRYPT_DATA_WITH_SHARING_KEY for",
              file.service,
              file.identifier
            );
            const encryptedResponse = await requestQortal({
              action: "ENCRYPT_DATA_WITH_SHARING_KEY",
              base64: tombstonePayload,
            });
            console.log(
              "[DELETE] ENCRYPT_DATA_WITH_SHARING_KEY response type:",
              typeof encryptedResponse,
              typeof encryptedResponse === "string"
                ? "raw string (length " + (encryptedResponse?.length || 0) + ")"
                : JSON.stringify(encryptedResponse)
            );
            // The response is a raw base64 string
            const encryptedData =
              typeof encryptedResponse === "string"
                ? encryptedResponse
                : encryptedResponse?.data64 || encryptedResponse?.encryptedData;
            if (encryptedData) {
              console.log(
                "[DELETE] Publishing to",
                targetService,
                file.identifier,
                "with encryptedData length",
                encryptedData.length
              );
              const publishResult = await requestQortal({
                action: "PUBLISH_QDN_RESOURCE",
                name: myName,
                service: targetService,
                identifier: file.identifier,
                data64: encryptedData,
                externalEncrypt: true,
              });
              console.log(
                "[DELETE] PUBLISH_QDN_RESOURCE response:",
                publishResult
              );
              if (publishResult?.identifier) continue;
            }
          } catch (error) {
            console.error(
              "[DELETE] ENCRYPT_DATA_WITH_SHARING_KEY failed for",
              file.service,
              file.identifier,
              error
            );
          }

          // Try 2: ENCRYPT_DATA uses account public key for standard private encryption
          // ENCRYPT_DATA uses `data64` param and returns a raw base64 string
          try {
            console.log(
              "[DELETE] Try ENCRYPT_DATA for",
              file.service,
              file.identifier,
              "publicKey:",
              accountPublicKey ? "set" : "MISSING"
            );
            const encryptParams = {
              action: "ENCRYPT_DATA",
              data64: tombstonePayload,
            };
            if (accountPublicKey) {
              encryptParams.publicKey = accountPublicKey;
            }
            const encryptedResponse = await requestQortal(encryptParams);
            console.log(
              "[DELETE] ENCRYPT_DATA response type:",
              typeof encryptedResponse,
              typeof encryptedResponse === "string"
                ? "raw string (length " + (encryptedResponse?.length || 0) + ")"
                : JSON.stringify(encryptedResponse)
            );
            // The response is a raw base64 string
            const encryptedData =
              typeof encryptedResponse === "string"
                ? encryptedResponse
                : encryptedResponse?.data64 || encryptedResponse?.encryptedData;
            if (encryptedData) {
              console.log(
                "[DELETE] Publishing to",
                targetService,
                file.identifier,
                "with encryptedData length",
                encryptedData.length
              );
              const publishResult = await requestQortal({
                action: "PUBLISH_QDN_RESOURCE",
                name: myName,
                service: targetService,
                identifier: file.identifier,
                data64: encryptedData,
                externalEncrypt: true,
              });
              console.log(
                "[DELETE] PUBLISH_QDN_RESOURCE response:",
                publishResult
              );
              if (publishResult?.identifier) continue;
            }
          } catch (error) {
            console.error(
              "[DELETE] ENCRYPT_DATA failed for",
              file.service,
              file.identifier,
              error
            );
          }

          failures.push(
            `${file.service}/${file.identifier} (encryption failed)`
          );
        } else if (isGroupResource(file)) {
          // Group resource - encrypt with group
          try {
            const tombstonePayload = btoa("d");
            const encryptedData = await requestQortal({
              action: "ENCRYPT_QORTAL_GROUP_DATA",
              data64: tombstonePayload,
              groupId: file.group || file.groupId,
            });
            if (encryptedData) {
              const publishResult = await requestQortal({
                action: "PUBLISH_QDN_RESOURCE",
                service: file.service,
                identifier: file.identifier,
                data64: encryptedData,
              });
              if (publishResult?.identifier) continue;
            }
          } catch (error) {
            console.error("Delete: group encryption publish failed:", error);
          }

          failures.push(
            `${file.service}/${file.identifier} (group encryption failed)`
          );
        } else {
          // Public service - raw data is fine
          try {
            const publishResult = await requestQortal({
              action: "PUBLISH_QDN_RESOURCE",
              service: file.service,
              identifier: file.identifier,
              data64: btoa("d"),
            });
            if (publishResult?.identifier) continue;
          } catch (error) {
            console.error("Delete: public publish failed:", error);
          }

          failures.push(
            `${file.service}/${file.identifier} (public publish failed)`
          );
        }
      }

      // Refresh the QDN snapshot by fetching directly from the QDN resource endpoint
      // so the diff sees the actual published state after the tombstone publish.
      let currentQdnState = null;
      try {
        const qdnOwnerName =
          (await resolvePreferredName(myName, myAddress?.address)) || myName;
        const response = await fetch(
          `/arbitrary/DOCUMENT_PRIVATE/${qdnOwnerName}/${QDN_STRUCTURE_IDENTIFIER}?encoding=base64`
        );
        if (response.ok) {
          const encryptedData = await response.text();
          const decryptedData = await requestQortal({
            action: "DECRYPT_DATA",
            encryptedData,
          });
          const decryptedBytes = base64ToUint8Array(decryptedData);
          currentQdnState = uint8ArrayToObject(decryptedBytes);
        }
      } catch (e) {
        // If we can't fetch QDN state, fall back to local state
        currentQdnState = {
          public: fileSystemPublic,
          private: fileSystemPrivate,
          group: fileSystemGroup,
        };
      }

      // Build synced snapshot using the QDN state we just fetched.
      // The QDN backup includes both filesystem and privateResourceIndex.
      // The diff compares each independently so filesystem deletions and
      // private index additions/removals are all shown accurately.
      //
      // After a file delete, the local private index still has the file's entries
      // (they're published separately to QDN). So we merge the local private index
      // into the snapshot so the diff sees private index entries as "unchanged"
      // on both sides. This is correct because the private index is managed locally
      // and the QDN backup only stores the filesystem structure.
      const localPrivateIndex = await getPersistedPrivateResourceIndex(
        myAddress?.address,
        [myAddress?.name?.name, activePublishName].filter(Boolean)
      ).catch(() => null);

      const syncedSnapshot = stableStringify(
        normalizeQdnSyncPayloadForComparison({
          public: currentQdnState?.public || fileSystemPublic,
          private: currentQdnState?.private || fileSystemPrivate,
          group: currentQdnState?.group || fileSystemGroup,
          ...(localPrivateIndex ? { privateResourceIndex: localPrivateIndex } : {}),
        })
      );

      if (failures.length > 0) {
        lastQdnSyncedSnapshotRef.current = syncedSnapshot;
        dismissedPublishSnapshotRef.current = syncedSnapshot;
        throw new Error(
          `Failed to publish tombstone for: ${failures.join(", ")}. ` +
            "The file was removed locally but the QDN publish may have failed. " +
            "Please try again."
        );
      }

      lastQdnSyncedSnapshotRef.current = syncedSnapshot;
      dismissedPublishSnapshotRef.current = syncedSnapshot;
    })();

    openToast(promise, {
      loading: "Deleting selected files from QDN...",
      success: "Selected files deleted from QDN",
      error: (err) => `Delete failed: ${err?.error || err?.message || err}`,
    });

    return promise;
  };

  if (!fileSystem) return null;

  return (
    <Box sx={{ padding: "8px" }}>
      <Box sx={{ width: "100%", bgcolor: "background.paper" }}>
        <Tabs
          value={mode}
          onChange={async (_, newValue) => {
            clearSelection();
            setCurrentPath(["Root"]);
            setMode(newValue);
          }}
          centered
        >
          <Tab label="public" value="public" />
          <Tab label="private" value="private" />
          <Tab label="groups" value="group" />
        </Tabs>
      </Box>
      <Spacer height="20px" />
      <Box
        sx={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <Typography
          sx={{
            fontSize: "20",
          }}
        >
          Q-Manager
        </Typography>
      </Box>
      <Box
        sx={{
          px: "18px",
          py: "6px",
          display: "flex",
          gap: "14px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Label>Publish name</Label>
          <Select
            size="small"
            value={activePublishName || myAddress?.name?.name || ""}
            onChange={(event) => setActivePublishName(event.target.value)}
            sx={{ width: "220px" }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#333333",
                  color: "#ffffff",
                },
              },
            }}
          >
            {publishNames.map((nameItem, index) => (
              <MenuItem
                key={`${nameItem?.name || "publish-name"}-${index}`}
                value={nameItem.name}
              >
                {nameItem.name}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>
      {mode === "group" && (
        <Box
          sx={{
            paddingLeft: "20px",
          }}
        >
          <Label>Select group</Label>
          <Select
            size="small"
            labelId="label-manager-groups"
            id="id-manager-groups"
            value={selectedGroup}
            displayEmpty
            onChange={(e) => {
              clearSelection();
              if (!selectedGroup && groups?.length > 0 && !e.target.value) {
                setCurrentPath(["Root"]);
                setSelectedGroup(groups[0]?.groupId);
                return;
              }
              setCurrentPath(["Root"]);
              setSelectedGroup(e.target.value);
            }}
            sx={{
              width: "300px",
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#333333", // Background of the dropdown
                  color: "#ffffff", // Text color
                },
              },
            }}
          >
            {groups?.map((group) => {
              return (
                <MenuItem key={group.groupId} value={group.groupId}>
                  {group?.groupName}
                </MenuItem>
              );
            })}
          </Select>
        </Box>
      )}
      <Box
        sx={{
          px: "18px",
          py: "6px",
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              size="small"
              checked={showThumbnails}
              onChange={(event) => setShowThumbnails(event.target.checked)}
            />
          }
          label={
            <Typography sx={{ fontSize: "14px" }}>
              Show public thumbnails
            </Typography>
          }
        />
        <FormControlLabel
          sx={{ m: 0, ml: "12px" }}
          control={
            <Checkbox
              size="small"
              checked={showPrivateThumbnails}
              onChange={(event) =>
                setShowPrivateThumbnails(event.target.checked)
              }
            />
          }
          label={
            <Typography sx={{ fontSize: "14px" }}>
              Show private thumbnails
            </Typography>
          }
        />
        <FormControlLabel
          sx={{ m: 0, ml: "12px" }}
          control={
            <Checkbox
              size="small"
              checked={autoQdnFileSystemSync}
              onChange={(event) =>
                setAutoQdnFileSystemSync(event.target.checked)
              }
            />
          }
          label={
            <Typography sx={{ fontSize: "14px" }}>
              Notify when backup is outdated
            </Typography>
          }
        />
        {autoQdnFileSystemSync &&
          qdnBackupDirty &&
          qdnPublishPromptRef.current && (
          <Tooltip title="QDN backup is out of date">
            <Badge
              color="error"
              badgeContent="!"
              overlap="circular"
              sx={{
                ml: "10px",
                "& .MuiBadge-badge": {
                  fontSize: "11px",
                  fontWeight: 700,
                  minWidth: "18px",
                  height: "18px",
                  borderRadius: "999px",
                },
              }}
            >
              <IconButton
                size="small"
                onClick={openPublishPrompt}
                sx={{
                  color: "#ffbf6e",
                  border: "1px solid rgba(255,191,110,0.35)",
                  backgroundColor: "rgba(255,191,110,0.08)",
                  ml: "2px",
                }}
              >
                <NotificationsActiveOutlinedIcon fontSize="small" />
              </IconButton>
            </Badge>
          </Tooltip>
        )}
      </Box>
      {mode === "group" && !selectedGroup ? (
        <></>
      ) : (
        <>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              position: "fixed",
              bottom: "0px",
              right: "0px",
              height: "60px",
              left: "0px",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingLeft: "20px",
              paddingBottom: "10px",
              backgroundColor: "rgb(39, 40, 44)",
              zIndex: 5,
              width: "100%",
            }}
          >
            {selectedVisibleFiles.length > 0 ? (
              <>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                  {selectedVisibleFiles.length} selected
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.75 }}>
                  {selectedSizeSummary.knownCount > 0
                    ? `Size: ${formatBytes(selectedSizeSummary.totalBytes)}${
                        selectedSizeSummary.unknownCount > 0
                          ? ` (${selectedSizeSummary.unknownCount} unknown)`
                          : ""
                      }`
                    : "Size: unknown"}
                </Typography>
                <ButtonBase
                  onClick={() => {
                    clearSelection();
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant="body2">Unselect</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={() => {
                    setBulkMoveTargetPath([]);
                    setShowBulkMoveModal(true);
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant="body2">Move</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={() => {
                    removeSelectedFromManager();
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant="body2">Remove</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={async () => {
                    try {
                      await deleteSelectedFromQDN();
                    } catch (error) {}
                  }}
                  sx={{
                    gap: "5px",
                    background: "#7b2f2f88",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant="body2">Delete from QDN</Typography>
                </ButtonBase>
              </>
            ) : (
              <>
                <Tooltip title="Settings">
                  <ButtonBase
                    aria-label="Settings"
                    onClick={async () => {
                      try {
                        await show("export-data");
                      } catch (error) {}
                    }}
                    sx={{
                      minWidth: "42px",
                      minHeight: "42px",
                      justifyContent: "center",
                      gap: "5px",
                      background: "#4444",
                      padding: "8px",
                      borderRadius: "8px",
                    }}
                  >
                    <SettingsOutlinedIcon sx={{ fontSize: "28px" }} />
                  </ButtonBase>
                </Tooltip>
                <ButtonBase
                  onClick={async () => {
                    try {
                      const dirname = await show("new-directory");
                      addDirectoryToCurrent(dirname);
                    } catch (error) {
                    } finally {
                      setNewDirName("");
                    }
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <CreateNewFolderIcon sx={{ fontSize: "28px" }} />
                  <Typography variant="body2">+Folder</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={() => {
                    setIsOpenPublish(true);
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <PublishIcon sx={{ fontSize: "28px" }} />
                  <Typography variant="body2">Publish files</Typography>
                </ButtonBase>
              </>
            )}
          </Stack>
          <Box
            sx={{
              display: "flex",
              gap: "15px",
              alignItems: "center",
              padding: "10px",
            }}
          >
            {/* <Button
          variant="contained"
          disabled={currentPath.length <= 1}
          onClick={handleBack}
          size="small"
        >
          Back
        </Button> */}
            <FileSystemBreadcrumbs
              currentPath={currentPath}
              setCurrentPath={setCurrentPath}
            />
          </Box>
          <Spacer height="5px" />
          <AppsContainer
            sx={{
              gap: "0px",
              justifyContent: "flex-start",
              width: "100%",
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={resolvedVisibleItems?.map((item) =>
                  getNodeSelectionKey(item)
                )}
              >
                {resolvedVisibleItems?.map((item) => (
                  <SortableItem
                    key={getNodeSelectionKey(item)}
                    item={item}
                    accountAddress={myAddress?.address}
                    accountPublicKey={myAddress?.publicKey}
                    privateResourceIndex={privateResourceIndex}
                    privateThumbnailAttemptedRef={privateThumbnailAttemptedRef}
                    fileSystem={fileSystem}
                    currentPath={currentPath}
                    selected={selectedFileKeys.includes(
                      getNodeSelectionKey(item)
                    )}
                    showThumbnails={showThumbnails}
                    showPrivateThumbnails={showPrivateThumbnails}
                    onSelect={(event) => toggleSelectFile(item, event)}
                    moveNode={moveNodeByPath}
                    onPreview={() => {
                      setPreviewFile(item);
                    }}
                    onHydrateMetadata={(metadata) => {
                      if (!metadata || Object.keys(metadata).length === 0)
                        return;
                      updateByPath({
                        ...item,
                        ...metadata,
                      });
                      setSelectedFile((prev) => {
                        if (!prev) return prev;
                        if (
                          getNodeSelectionKey(prev) !==
                          getNodeSelectionKey(item)
                        ) {
                          return prev;
                        }
                        return {
                          ...prev,
                          ...metadata,
                        };
                      });
                    }}
                    onTogglePin={() => {
                      togglePinByPath(item);
                    }}
                    rename={() => {
                      renameByPath(item);
                    }}
                    removeFile={() => {
                      removeByNodePath(undefined, item.name, undefined);
                    }}
                    removeDirectory={() => {
                      deleteFolderInCurrent(item.name);
                    }}
                    onClick={() => {
                      if (item.type === "folder") handleNavigate(item.name);
                      else setSelectedFile(item);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </AppsContainer>
        </>
      )}

      {isOpenPublish && (
        <ShowAction
          myName={activePublishName || myAddress?.name?.name}
          accountAddress={myAddress?.address}
          accountPublicKey={myAddress?.publicKey}
          addNodeByPath={addNodeByPath}
          handleClose={() => setIsOpenPublish(false)}
          selectedAction={{
            action: "PUBLISH_MULTIPLE_QDN_RESOURCES",
            files: [],
          }}
          mode={mode}
          groups={groups}
          selectedGroup={selectedGroup}
        />
      )}
      {isShow && (
        <Dialog
          open={isShow}
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-description"
          PaperProps={{
            style: {
              backgroundColor: "rgb(39, 40, 44)",
              color: "#27282c !important",
            },
          }}
        >
          {type === "delete-directory" && (
            <>
              <DialogContent>
                <Typography>
                  Are you sure you want to delete this directory
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button variant="contained" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={() => onOk(newDirName)}
                  autoFocus
                >
                  Confirm
                </Button>
              </DialogActions>
            </>
          )}
          {type === "delete-file" && (
            <>
              <DialogContent>
                <Typography>
                  Are you sure you want to delete this file
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button variant="contained" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={() => onOk(newDirName)}
                  autoFocus
                >
                  Confirm
                </Button>
              </DialogActions>
            </>
          )}

          {type === "new-directory" && (
            <>
              <DialogContent>
                <Label>Directory name</Label>
                <input
                  ref={newDirInputRef}
                  style={{
                    maxWidth: "100%",
                  }}
                  type="text"
                  className="custom-input"
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const trimmedName = newDirName.trim();
                    if (!trimmedName) return;
                    onOk(trimmedName);
                  }}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button variant="contained" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  disabled={!newDirName}
                  variant="contained"
                  onClick={() => onOk(newDirName)}
                >
                  Save
                </Button>
              </DialogActions>
            </>
          )}

          {type === "rename" && (
            <>
              <DialogContent>
                <Label>Rename</Label>
                <input
                  style={{
                    maxWidth: "100%",
                  }}
                  type="text"
                  className="custom-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button variant="contained" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  disabled={!newName}
                  variant="contained"
                  onClick={() => onOk(newName)}
                  autoFocus
                >
                  Save
                </Button>
              </DialogActions>
            </>
          )}
          {type === "export-data" && (
            <>
              <DialogContent>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={async () => {
                      try {
                        const privateResourceIndex =
                          await getPersistedPrivateResourceIndex(
                            myAddress?.address,
                            [myAddress?.name?.name, activePublishName].filter(
                              Boolean
                            )
                          );
                        const payload = {
                          public: fileSystemPublic,
                          private: fileSystemPrivate,
                          group: fileSystemGroup,
                          ...(privateResourceIndex
                            ? { privateResourceIndex }
                            : {}),
                        };
                        const data64 = await objectToBase64({
                          ...payload,
                        });

                        const encryptedData = await requestQortal({
                          action: "ENCRYPT_DATA",
                          data64,
                        });

                        const blob = new Blob([encryptedData], {
                          type: "text/plain",
                        });
                        const timestamp = new Date()
                          .toISOString()
                          .replace(/:/g, "-"); // Safe timestamp for filenames
                        const filename = `q-manager-backup-filesystem-${myAddress?.address}-${timestamp}.txt`;
                        await requestQortal({
                          action: "SAVE_FILE",
                          filename,
                          blob,
                        });
                      } catch (error) {}
                    }}
                  >
                    Export filesystem data to local disk
                  </Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      try {
                        const fileContent = await handleImportClick();
                        const decryptedData = await requestQortal({
                          action: "DECRYPT_DATA",
                          encryptedData: fileContent,
                        });
                        const decryptToUnit8ArraySubject =
                          base64ToUint8Array(decryptedData);
                        const responseData = uint8ArrayToObject(
                          decryptToUnit8ArraySubject
                        );
                        if (responseData?.public && responseData?.private) {
                          setFileSystemPublic(responseData?.public);
                          setFileSystemPrivate(responseData?.private);
                          const groupData =
                            responseData?.group &&
                            !Array.isArray(responseData.group)
                              ? responseData.group
                              : initialGroupFileSystem;
                          setFileSystemGroup(groupData);
                          setCurrentPath(["Root"]);
                          if (
                            responseData?.privateResourceIndex &&
                            myAddress?.address
                          ) {
                            await savePrivateResourceIndexEverywhere(
                              responseData.privateResourceIndex,
                              myAddress.address
                            ).catch((error) => {
                              console.error(
                                "Failed to save imported private resource index:",
                                error
                              );
                            });
                          }
                          clearPublishNotice();
                        }
                      } catch (error) {
                        console.log("error", error);
                      }
                    }}
                  >
                    Import filesystem
                  </Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      const privateResourceIndex =
                        await getPersistedPrivateResourceIndex(
                          myAddress?.address,
                          [myAddress?.name?.name, activePublishName].filter(
                            Boolean
                          )
                        );
                      const promise = publishFileSystemQManagerToQDN({
                        name: resolvedName,
                        address: myAddress?.address,
                        fileSystemQManager: {
                          public: fileSystemPublic,
                          private: fileSystemPrivate,
                          group: fileSystemGroup,
                        },
                        privateResourceIndex,
                        activePublishName:
                          activePublishName || myAddress?.name?.name,
                      });

                      openToast(promise, {
                        loading: "Publishing filesystem structure to QDN...",
                        success: "Filesystem structure published to QDN",
                        error: (err) =>
                          `Publish failed: ${err?.error || err?.message || err}`,
                      });
                      await promise;
                      lastQdnSyncedSnapshotRef.current = stableStringify(
                        normalizeQdnSyncPayloadForComparison({
                          public: fileSystemPublic,
                          private: fileSystemPrivate,
                          group: fileSystemGroup,
                          ...(privateResourceIndex
                            ? { privateResourceIndex }
                            : {}),
                        })
                      );
                      dismissedPublishSnapshotRef.current = "";
                      clearPublishNotice();
                    }}
                  >
                    Publish filesystem structure to QDN
                  </Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      const resolvedName = await resolvePreferredName(
                        currentName,
                        myAddress?.address
                      );
                      const promise = importFileSystemQManagerFromQDN(resolvedName);

                      openToast(promise, {
                        loading: "Importing filesystem structure from QDN...",
                        success: "Filesystem structure imported from QDN",
                        error: (err) =>
                          `Import failed: ${err?.error || err?.message || err}`,
                      });
                      const imported = await promise;

                      if (imported?.public && imported?.private) {
                        setFileSystemPublic(imported.public);
                        setFileSystemPrivate(imported.private);
                        const groupData =
                          imported?.group && !Array.isArray(imported.group)
                            ? imported.group
                            : initialGroupFileSystem;
                        setFileSystemGroup(groupData);
                        setCurrentPath(["Root"]);
                        clearPublishNotice();
                      }
                    }}
                  >
                    Import filesystem structure from QDN
                  </Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      try {
                        await discoverAndImportPublishedQManagerFiles();
                      } catch (error) {}
                    }}
                  >
                    Find previously published Q-Manager files
                  </Button>
                </Box>
              </DialogContent>
              <DialogActions>
                <Button variant="contained" onClick={onCancel}>
                  Close
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      )}
      <Modal
        open={showBulkMoveModal}
        onClose={() => {
          setShowBulkMoveModal(false);
          setBulkMoveTargetPath([]);
        }}
      >
        <Box
          sx={{
            width: 420,
            maxWidth: "95%",
            margin: "auto",
            marginTop: "10%",
            backgroundColor: "#27282c",
            border: "1px solid #3a3f50",
            borderRadius: "10px",
            boxShadow: 24,
            p: 3,
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          <Typography sx={{ fontSize: "18px", mb: 1 }}>
            Move {selectedVisibleFiles.length} selected file
            {selectedVisibleFiles.length === 1 ? "" : "s"}
          </Typography>
          <Typography sx={{ fontSize: "13px", opacity: 0.75, mb: 2 }}>
            Choose target folder
          </Typography>
          {renderFolderTreeForBulkMove(fileSystem)}
          <Box sx={{ mt: 2, display: "flex", gap: "10px" }}>
            <Button
              variant="contained"
              disabled={!bulkMoveTargetPath.length}
              onClick={moveSelectedToPath}
            >
              Move here
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setShowBulkMoveModal(false);
                setBulkMoveTargetPath([]);
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Modal>
      <Dialog
        open={!!qdnSyncPrompt}
        onClose={() => qdnSyncPrompt?.onCancel?.()}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          style: {
            backgroundColor: "rgb(39, 40, 44)",
            color: "#ffffff",
          },
        }}
      >
        <DialogTitle>{qdnSyncPrompt?.title}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "14px", mb: 2 }}>
            {qdnSyncPrompt?.intro}
          </Typography>
          <Box sx={{ display: "flex", gap: "12px", flexWrap: "wrap", mb: 2 }}>
            {[
              [qdnSyncPrompt?.fromLabel, qdnSyncPrompt?.fromSummary],
              [qdnSyncPrompt?.toLabel, qdnSyncPrompt?.toSummary],
            ].map(([label, summary], index) => (
              <Box
                key={`${label || "summary"}-${index}`}
                sx={{
                  flex: "1 1 220px",
                  border: "1px solid rgba(132, 162, 214, 0.35)",
                  borderRadius: "8px",
                  p: "10px",
                }}
              >
                <Typography sx={{ fontSize: "13px", opacity: 0.76 }}>
                  {label}
                </Typography>
                <Typography sx={{ fontSize: "14px" }}>
                  Filesystem files: {summary?.fileSystem?.files ?? 0}
                </Typography>
                <Typography sx={{ fontSize: "14px" }}>
                  Filesystem groups: {summary?.fileSystem?.groups ?? 0}
                </Typography>
                <Typography sx={{ fontSize: "14px" }}>
                  Filesystem size: {summary?.fileSystem?.sizeLabel || "Unknown"}
                </Typography>
                <Typography sx={{ fontSize: "14px", mt: 1 }}>
                  Private index entries: {summary?.privateIndex?.entries ?? 0}
                </Typography>
                <Typography sx={{ fontSize: "14px" }}>
                  Private index size:{" "}
                  {summary?.privateIndex?.sizeLabel || "Unknown"}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              border: "1px solid rgba(132, 162, 214, 0.35)",
              borderRadius: "8px",
              p: "10px",
            }}
          >
            <Typography sx={{ fontSize: "14px", mb: 1 }}>
              Detected changes
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.76, mb: 0.5 }}>
              Filesystem
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.86 }}>
              Added:{" "}
              {formatChangeList(qdnSyncPrompt?.diff?.fileSystem?.added || [])}
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.86 }}>
              Removed:{" "}
              {formatChangeList(qdnSyncPrompt?.diff?.fileSystem?.removed || [])}
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.86 }}>
              Changed:{" "}
              {formatChangeList(qdnSyncPrompt?.diff?.fileSystem?.changed || [])}
            </Typography>
            <Typography
              sx={{ fontSize: "13px", opacity: 0.76, mt: 1, mb: 0.5 }}
            >
              Private index
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.86 }}>
              Added:{" "}
              {formatChangeList(qdnSyncPrompt?.diff?.privateIndex?.added || [])}
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.86 }}>
              Removed:{" "}
              {formatChangeList(
                qdnSyncPrompt?.diff?.privateIndex?.removed || []
              )}
            </Typography>
            <Typography sx={{ fontSize: "13px", opacity: 0.86 }}>
              Changed:{" "}
              {formatChangeList(
                qdnSyncPrompt?.diff?.privateIndex?.changed || []
              )}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => qdnSyncPrompt?.onCancel?.()}
          >
            Not now
          </Button>
          <Button
            variant="contained"
            onClick={() => qdnSyncPrompt?.onConfirm?.()}
            autoFocus
          >
            {qdnSyncPrompt?.confirmLabel || "Continue"}
          </Button>
        </DialogActions>
      </Dialog>

      {resolvedSelectedFile && (
        <SelectedFile
          groups={groups}
          mode={mode}
          selectedFile={resolvedSelectedFile}
          accountAddress={myAddress?.address}
          accountPublicKey={myAddress?.publicKey}
          setSelectedFile={setSelectedFile}
          updateByPath={updateByPath}
          myName={activePublishName || myAddress?.name?.name}
          selectedGroup={selectedGroup}
          addNodeByPath={addNodeByPath}
        />
      )}
      {resolvedPreviewFile && (
        <FilePreviewDialog
          file={resolvedPreviewFile}
          accountAddress={myAddress?.address}
          accountPublicKey={myAddress?.publicKey}
          onHydrateMetadata={(metadata) => {
            if (!metadata || Object.keys(metadata).length === 0) return;
            updateByPath({
              ...resolvedPreviewFile,
              ...metadata,
            });
            setPreviewFile((prev) => (prev ? { ...prev, ...metadata } : prev));
            setSelectedFile((prev) => {
              if (!prev) return prev;
              if (
                getNodeSelectionKey(prev) !== getNodeSelectionKey(previewFile)
              ) {
                return prev;
              }
              return { ...prev, ...metadata };
            });
          }}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </Box>
  );
};

export const AppsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  width: "90%",
  justifyContent: "space-evenly",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "flex-start",
  alignSelf: "center",
  paddingBottom: "50px",
}));
