import {
  base64ToUint8Array,
  isPrivateGroupQManagerIdentifier,
  normalizeGroupId,
} from "./utils";

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

    return trimmed;
  }

  if (typeof value !== "object") {
    return "";
  }

  const candidateSources = [
    (value as Record<string, any>)?.key,
    (value as Record<string, any>)?.sharingKey,
    (value as Record<string, any>)?.data,
    (value as Record<string, any>)?.data64,
    (value as Record<string, any>)?.payload,
    (value as Record<string, any>)?.content,
    (value as Record<string, any>)?.metadata?.key,
    (value as Record<string, any>)?.metadata?.sharingKey,
    (value as Record<string, any>)?.metadata?.data,
    (value as Record<string, any>)?.metadata?.data64,
  ];

  for (const candidate of candidateSources) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const parsed = parseMaybeJson(trimmed);
    if (parsed) {
      const nested = extractSharingKeyFromDecryptResponse(parsed);
      if (nested) return nested;
    }

    return trimmed;
  }

  return "";
};

const resolvePrivateSharingKey = async ({
  file,
  requestQortal,
}: {
  file: Record<string, any>;
  requestQortal: RequestQortalFn;
}) => {
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

  const decryptAttempts = [
    {
      action: "DECRYPT_DATA",
      encryptedData,
      ...(typeof file?.publicKey === "string" && file.publicKey.trim()
        ? { publicKey: file.publicKey.trim() }
        : {}),
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
}: {
  file: Record<string, any>;
  requestQortal: RequestQortalFn;
  selectedType?: string | number;
  customFileName?: string;
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

  const resolvedKey = await resolvePrivateSharingKey({
    file,
    requestQortal,
  });

  await requestQortal({
    action: "CREATE_AND_COPY_EMBED_LINK",
    type,
    name: qortalName,
    identifier,
    service,
    encryptionType: "private",
    key: resolvedKey,
    mimeType: file?.mimeType,
    fileName,
  });
  return true;
};
