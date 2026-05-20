import {
  base64ToUint8Array,
  isPrivateGroupQManagerIdentifier,
  normalizeGroupId,
} from "./utils";
import {
  getPrivateResourceIndexEntry,
  upsertPrivateResourceIndexEntry,
} from "./storage";

type RequestQortalFn = (payload: Record<string, any>) => Promise<any>;

const safeLower = (value: unknown): string => {
  if (typeof value === "string") return value.toLowerCase();
  if (value === undefined || value === null) return "";
  try {
    return String(value).toLowerCase();
  } catch (error) {
    return "";
  }
};

const isEncryptedResourceNode = (node: Record<string, any> | null | undefined) => {
  const service = safeLower(node?.service);
  const encryptionType = safeLower(node?.encryptionType);
  const identifier = safeLower(node?.identifier);

  return (
    encryptionType.includes("private") ||
    isPrivateGroupQManagerIdentifier(identifier) ||
    service.includes("_PRIVATE") ||
    identifier.startsWith("p-") ||
    identifier.startsWith("pvt-")
  );
};

export const inferEmbedTypeFromMimeType = (mimeType: unknown): string => {
  const normalized = safeLower(mimeType);
  return normalized.startsWith("image/") ? "IMAGE" : "ATTACHMENT";
};

export const getDefaultEmbedFileName = (
  file: Record<string, any> | null | undefined
): string => {
  const candidates = [
    file?.displayName,
    file?.filename,
    file?.fileName,
    file?.name,
    file?.title,
    file?.identifier,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Untitled";
};

const getFileOwnerName = (file: Record<string, any> | null | undefined): string => {
  const candidates = [file?.qortalName, file?.name, file?.ownerName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

const parseMaybeJson = (value: string): Record<string, any> | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (error) {}

  try {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(
      base64ToUint8Array(trimmed)
    );
    return JSON.parse(decoded);
  } catch (error) {}

  return null;
};

const isValidSharingKeyValue = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  try {
    return base64ToUint8Array(trimmed).length === 32;
  } catch (error) {
    return false;
  }
};

const extractSharingKeyFromDecryptResponse = (
  value: unknown
): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const parsed = parseMaybeJson(trimmed);
    if (parsed) {
      return extractSharingKeyFromDecryptResponse(parsed);
    }

    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  const candidateSources = [
    (value as Record<string, any>)?.key,
    (value as Record<string, any>)?.sharingKey,
    (value as Record<string, any>)?.data,
    (value as Record<string, any>)?.result,
    (value as Record<string, any>)?.payload,
    (value as Record<string, any>)?.content,
    (value as Record<string, any>)?.metadata?.key,
    (value as Record<string, any>)?.metadata?.sharingKey,
    (value as Record<string, any>)?.metadata?.data,
    (value as Record<string, any>)?.metadata?.result,
    (value as Record<string, any>)?.metadata?.payload,
    (value as Record<string, any>)?.metadata?.content,
  ];

  for (const candidate of candidateSources) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const parsed = parseMaybeJson(trimmed);
    if (
      parsed &&
      typeof parsed.data === "string" &&
      typeof parsed.key === "string" &&
      Object.keys(parsed).length <= 3 &&
      isValidSharingKeyValue(parsed.key)
    ) {
      return parsed.key.trim();
    }
  }

  const nestedSources = [
    (value as Record<string, any>)?.data,
    (value as Record<string, any>)?.result,
    (value as Record<string, any>)?.payload,
    (value as Record<string, any>)?.content,
    (value as Record<string, any>)?.metadata,
  ];

  for (const nestedSource of nestedSources) {
    if (!nestedSource || typeof nestedSource !== "object") continue;
    const nested = extractSharingKeyFromDecryptResponse(nestedSource);
    if (nested) return nested;
  }

  return "";
};

const normalizeBase64Payload = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const parsed = parseMaybeJson(trimmed);
    if (
      parsed &&
      typeof parsed.data === "string" &&
      typeof parsed.key === "string" &&
      Object.keys(parsed).length <= 3 &&
      isValidSharingKeyValue(parsed.key)
    ) {
      return parsed.data.trim();
    }

    return trimmed;
  }

  if (typeof value !== "object") {
    return "";
  }

  const candidateSources = [
    (value as Record<string, any>)?.data64,
    (value as Record<string, any>)?.data,
    (value as Record<string, any>)?.encryptedData,
    (value as Record<string, any>)?.payload,
    (value as Record<string, any>)?.content,
    (value as Record<string, any>)?.result,
  ];

  for (const candidate of candidateSources) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const parsed = parseMaybeJson(trimmed);
    if (
      parsed &&
      typeof parsed.data === "string" &&
      typeof parsed.key === "string" &&
      Object.keys(parsed).length <= 3 &&
      isValidSharingKeyValue(parsed.key)
    ) {
      return parsed.data.trim();
    }

    return trimmed;
  }

  const nestedSources = [
    (value as Record<string, any>)?.data,
    (value as Record<string, any>)?.result,
    (value as Record<string, any>)?.payload,
    (value as Record<string, any>)?.content,
  ];

  for (const nestedSource of nestedSources) {
    if (!nestedSource || typeof nestedSource !== "object") continue;
    const nested = normalizeBase64Payload(nestedSource);
    if (nested) return nested;
  }

  return "";
};

const fetchEncryptedPrivateResourceBase64 = async (file: Record<string, any>) => {
  const service = typeof file?.service === "string" ? file.service : "";
  const identifier = typeof file?.identifier === "string" ? file.identifier : "";
  const qortalName = getFileOwnerName(file);
  if (!service || !identifier || !qortalName) {
    throw new Error("Could not determine encrypted resource fields");
  }

  const response = await fetch(
    `/arbitrary/${encodeURIComponent(service)}/${encodeURIComponent(
      qortalName
    )}/${encodeURIComponent(identifier)}?encoding=base64`
  );
  if (!response.ok) {
    throw new Error("Could not fetch encrypted resource");
  }

  const encryptedData = await response.text();
  if (!encryptedData) {
    throw new Error("Could not load encrypted resource");
  }

  return encryptedData;
};

const decryptPrivateResourceBase64 = async ({
  file,
  requestQortal,
  encryptedData,
  accountPublicKey = "",
}: {
  file: Record<string, any>;
  requestQortal: RequestQortalFn;
  encryptedData: string;
  accountPublicKey?: string;
}) => {
  const sharingKey = typeof file?.sharingKey === "string" ? file.sharingKey : "";
  const publicKey =
    typeof file?.publicKey === "string" && file.publicKey.trim()
      ? file.publicKey.trim()
      : accountPublicKey.trim();
  const attempts = [
    {
      action: "DECRYPT_DATA_WITH_SHARING_KEY",
      encryptedData,
      data64: encryptedData,
      ...(sharingKey ? { key: sharingKey } : {}),
      ...(publicKey ? { publicKey } : {}),
    },
    {
      action: "DECRYPT_DATA",
      encryptedData,
      data64: encryptedData,
      ...(publicKey ? { publicKey } : {}),
    },
    {
      action: "DECRYPT_DATA",
      encryptedData,
      data64: encryptedData,
    },
  ];

  for (const attempt of attempts) {
    try {
      const decryptedResponse = await requestQortal(attempt);
      const plainData64 = normalizeBase64Payload(decryptedResponse);
      if (plainData64) {
        return plainData64;
      }
    } catch (error) {}
  }

  throw new Error("Could not decrypt this private file");
};

const persistPrivateResourceSharingKey = async ({
  file,
  sharingKey,
  accountAddress,
  accountPublicKey = "",
}: {
  file: Record<string, any>;
  sharingKey: string;
  accountAddress?: string;
  accountPublicKey?: string;
}) => {
  const normalizedAccountAddress = typeof accountAddress === "string" ? accountAddress.trim() : "";
  if (!normalizedAccountAddress || !sharingKey) {
    return;
  }

  const service = getServiceName(file);
  const identifier = typeof file?.identifier === "string" ? file.identifier.trim() : "";
  const qortalName = getFileOwnerName(file);
  if (!service || !identifier || !qortalName) {
    return;
  }

  await upsertPrivateResourceIndexEntry(normalizedAccountAddress, {
    resourceKey: [qortalName, service, identifier, file?.group || file?.groupId || 0].join("|"),
    qortalName,
    service,
    identifier,
    filename: getDefaultEmbedFileName(file),
    displayName: getDefaultEmbedFileName(file),
    mimeType: file?.mimeType || "application/octet-stream",
    sizeInBytes: Number(file?.sizeInBytes || file?.size || 0) || 0,
    encryptionType: file?.encryptionType || "private",
    ...(accountPublicKey ? { publicKey: accountPublicKey } : {}),
    sharingKey,
    ...(file?.thumbnailData64
      ? {
          thumbnailData64: file.thumbnailData64,
          thumbnailMimeType: file.thumbnailMimeType || "image/jpeg",
        }
      : {}),
  });
};

const resolveKnownPrivateSharingKey = async ({
  file,
  accountAddress,
}: {
  file: Record<string, any>;
  accountAddress?: string;
}) => {
  const directCandidates = [file?.sharingKey, file?.key];
  for (const candidate of directCandidates) {
    if (isValidSharingKeyValue(candidate)) {
      return candidate.trim();
    }
  }

  const normalizedAccountAddress =
    typeof accountAddress === "string" ? accountAddress.trim() : "";
  if (!normalizedAccountAddress) {
    return "";
  }

  const resourceKey =
    typeof file?.resourceKey === "string" && file.resourceKey.trim()
      ? file.resourceKey.trim()
      : typeof file?.entryKey === "string" && file.entryKey.trim()
        ? file.entryKey.trim()
        : [getFileOwnerName(file), getServiceName(file), file?.identifier || "", file?.group || file?.groupId || 0].join("|");

  if (!resourceKey) {
    return "";
  }

  const privateIndexEntry = await getPrivateResourceIndexEntry(
    normalizedAccountAddress,
    resourceKey
  );
  const indexedKey = privateIndexEntry?.sharingKey || privateIndexEntry?.key || "";
  return isValidSharingKeyValue(indexedKey) ? indexedKey.trim() : "";
};

const republishPrivateResourceWithSharingKey = async ({
  file,
  requestQortal,
  accountAddress,
  accountPublicKey = "",
}: {
  file: Record<string, any>;
  requestQortal: RequestQortalFn;
  accountAddress?: string;
  accountPublicKey?: string;
}) => {
  const encryptedData = await fetchEncryptedPrivateResourceBase64(file);
  const plainData64 = await decryptPrivateResourceBase64({
    file,
    requestQortal,
    encryptedData,
    accountPublicKey,
  });

  const encryptedResponse = await requestQortal({
    action: "ENCRYPT_DATA_WITH_SHARING_KEY",
    data64: plainData64,
  });
  const normalizedEncrypted = normalizeEncryptedSharingKeyResponse(
    encryptedResponse
  );

  if (!normalizedEncrypted.data64 || !normalizedEncrypted.sharingKey) {
    throw new Error("Could not re-encrypt this private file");
  }

  const service = typeof file?.service === "string" ? file.service : "";
  const identifier = typeof file?.identifier === "string" ? file.identifier : "";
  const qortalName = getFileOwnerName(file);
  if (!service || !identifier || !qortalName) {
    throw new Error("Could not determine encrypted resource fields");
  }

  const publishResult = await requestQortal({
    action: "PUBLISH_QDN_RESOURCE",
    name: qortalName,
    service,
    identifier,
    data64: normalizedEncrypted.data64,
    externalEncrypt: true,
  });
  if (!publishResult?.identifier) {
    throw new Error("Unable to republish this private file");
  }

  await persistPrivateResourceSharingKey({
    file,
    sharingKey: normalizedEncrypted.sharingKey,
    accountAddress,
    accountPublicKey: normalizedEncrypted.publicKey || accountPublicKey,
  });

  return normalizedEncrypted.sharingKey;
};

const resolvePrivateSharingKey = async ({
  file,
  requestQortal,
  accountAddress,
  accountPublicKey = "",
}: {
  file: Record<string, any>;
  requestQortal: RequestQortalFn;
  accountAddress?: string;
  accountPublicKey?: string;
}) => {
  const knownSharingKey = await resolveKnownPrivateSharingKey({
    file,
    accountAddress,
  });
  if (knownSharingKey) {
    return knownSharingKey;
  }

  const encryptedData = await fetchEncryptedPrivateResourceBase64(file);
  const publicKey =
    typeof file?.publicKey === "string" && file.publicKey.trim()
      ? file.publicKey.trim()
      : accountPublicKey.trim();

  const decryptAttempts = [
    {
      action: "DECRYPT_DATA",
      encryptedData,
      ...(publicKey ? { publicKey } : {}),
    },
    {
      action: "DECRYPT_DATA",
      encryptedData,
    },
  ];

  for (const attempt of decryptAttempts) {
    try {
      const decryptedResponse = await requestQortal(attempt);
      const resolvedKey = extractSharingKeyFromDecryptResponse(
        decryptedResponse
      );
      if (resolvedKey) {
        return resolvedKey;
      }
    } catch (error) {}
  }

  throw new Error("Could not determine the sharing key for this private file");
};

export const copyEmbedLinkForFile = async ({
  file,
  requestQortal,
  selectedType,
  customFileName,
  accountAddress,
  accountPublicKey,
}: {
  file: Record<string, any>;
  requestQortal: RequestQortalFn;
  selectedType?: string | number;
  customFileName?: string;
  accountAddress?: string;
  accountPublicKey?: string;
}) => {
  if (!file || typeof file !== "object") {
    throw new Error("Please select a file");
  }
  if (typeof requestQortal !== "function") {
    throw new Error("Embed link request is unavailable");
  }

  const service = typeof file?.service === "string" ? file.service : "";
  const identifier = typeof file?.identifier === "string" ? file.identifier : "";
  const qortalName = getFileOwnerName(file);
  if (!service || !identifier || !qortalName) {
    throw new Error("Could not determine embed link fields");
  }

  const fileName =
    typeof customFileName === "string" && customFileName.trim()
      ? customFileName.trim()
      : getDefaultEmbedFileName(file);
  const type =
    typeof selectedType === "string" && selectedType.trim()
      ? selectedType.trim()
      : inferEmbedTypeFromMimeType(file?.mimeType);
  const groupId = normalizeGroupId(file?.groupId ?? file?.group);
  const encrypted = isEncryptedResourceNode(file);

  if (groupId) {
    await requestQortal({
      action: "CREATE_AND_COPY_EMBED_LINK",
      type,
      name: qortalName,
      identifier,
      service,
      mimeType: file?.mimeType,
      fileName,
      groupId,
      ...(encrypted ? { encryptionType: "group" } : {}),
    });
    return true;
  }

  if (!encrypted) {
    await requestQortal({
      action: "CREATE_AND_COPY_EMBED_LINK",
      type,
      name: qortalName,
      identifier,
      service,
      mimeType: file?.mimeType,
      fileName,
    });
    return true;
  }

  let privateSharingKey = "";
  try {
    privateSharingKey = await resolvePrivateSharingKey({
      file,
      requestQortal,
      accountAddress,
      accountPublicKey,
    });
  } catch (error) {
    privateSharingKey = await republishPrivateResourceWithSharingKey({
      file,
      requestQortal,
      accountAddress,
      accountPublicKey,
    });
  }

  await persistPrivateResourceSharingKey({
    file,
    sharingKey: privateSharingKey,
    accountAddress,
    accountPublicKey,
  });

  await requestQortal({
    action: "CREATE_AND_COPY_EMBED_LINK",
    type,
    name: qortalName,
    identifier,
    service,
    encryptionType: "private",
    key: privateSharingKey,
    mimeType: file?.mimeType,
    fileName,
  });
  return true;
};
