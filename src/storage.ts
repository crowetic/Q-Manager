// @ts-nocheck
import {
  base64ToUint8Array,
  objectToBase64,
  uint8ArrayToObject,
} from "./utils";
import { privateServices, services } from "./constants";

const DB_NAME = "FileSystemDB";
const DB_VERSION = 1;
const STORE_NAME = "fileSystemQManager";
const LOCAL_STORAGE_PREFIX = "q-manager-filesystem-v1";

const QDN_STRUCTURE_IDENTIFIER = "q-manager-filesystem-v1";
const QDN_STRUCTURE_FILENAME = "q-manager-filesystem-v1.txt";
const LEGACY_QDN_BACKUP_IDENTIFIER = "qmgr-db-backup";
const STORAGE_RECORD_VERSION = 2;

const getLocalStorageKey = (address) => `${LOCAL_STORAGE_PREFIX}:${address}`;

const isValidFileSystemQManager = (data) => {
  return (
    data &&
    typeof data === "object" &&
    Array.isArray(data.public) &&
    Array.isArray(data.private) &&
    data.group !== undefined
  );
};

const getNow = () => Date.now();

const toStorageRecord = (fileSystemQManager, updatedAt = getNow()) => ({
  version: STORAGE_RECORD_VERSION,
  updatedAt,
  data: fileSystemQManager,
});

const parseFileSystemRecord = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  if (isValidFileSystemQManager(raw?.data)) {
    return {
      data: raw.data,
      updatedAt: Number(raw.updatedAt) || 0,
    };
  }

  if (isValidFileSystemQManager(raw)) {
    return {
      data: raw,
      updatedAt: Number(raw.updatedAt || raw._updatedAt) || 0,
    };
  }

  return null;
};

const initializeDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "address" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

export const saveFileSystemQManagerToLocalStorage = (
  fileSystemQManager,
  address,
  updatedAt = getNow()
) => {
  if (!address) return;

  try {
    const key = getLocalStorageKey(address);
    localStorage.setItem(
      key,
      JSON.stringify(toStorageRecord(fileSystemQManager, updatedAt))
    );
  } catch (error) {
    console.error("Error saving fileSystemQManager to localStorage:", error);
  }
};

const getFileSystemQManagerRecordFromLocalStorage = (address) => {
  if (!address) return null;

  try {
    const key = getLocalStorageKey(address);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parseFileSystemRecord(parsed);
  } catch (error) {
    console.error("Error reading fileSystemQManager from localStorage:", error);
    return null;
  }
};

export const getFileSystemQManagerFromLocalStorage = (address) => {
  const record = getFileSystemQManagerRecordFromLocalStorage(address);
  return record?.data || null;
};

export const saveFileSystemQManagerToDB = async (
  fileSystemQManager,
  address,
  updatedAt = getNow()
) => {
  if (!address) throw new Error("Address is required to save filesystem.");

  try {
    const db = await initializeDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.put({
      address,
      ...toStorageRecord(fileSystemQManager, updatedAt),
    });

    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error("Error saving fileSystemQManager to IndexedDB:", error);
    return false;
  }
};

const getFileSystemQManagerRecordFromDB = async (address) => {
  if (!address) return null;

  try {
    const db = await initializeDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(address);

      request.onsuccess = (event) => {
        if (event.target.result) {
          resolve(parseFileSystemRecord(event.target.result));
        } else {
          resolve(null);
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error("Error retrieving fileSystemQManager from IndexedDB:", error);
    return null;
  }
};

export const getFileSystemQManagerFromDB = async (address) => {
  const record = await getFileSystemQManagerRecordFromDB(address);
  return record?.data || null;
};

export const saveFileSystemQManagerEverywhere = async (
  fileSystemQManager,
  address
) => {
  if (!address) throw new Error("Address is required to save filesystem.");
  const updatedAt = getNow();

  const dbSaved = await saveFileSystemQManagerToDB(
    fileSystemQManager,
    address,
    updatedAt
  );

  // Keep localStorage as a backup snapshot and fallback path.
  if (dbSaved) {
    saveFileSystemQManagerToLocalStorage(fileSystemQManager, address, updatedAt);
    return {
      updatedAt,
      primary: "indexeddb",
      fallbackUsed: false,
    };
  }

  saveFileSystemQManagerToLocalStorage(fileSystemQManager, address, updatedAt);
  return {
    updatedAt,
    primary: "localstorage",
    fallbackUsed: true,
  };
};

export const getPersistedFileSystemQManager = async (address) => {
  if (!address) return null;

  const dbRecord = await getFileSystemQManagerRecordFromDB(address);
  const localRecord = getFileSystemQManagerRecordFromLocalStorage(address);

  if (dbRecord?.data && localRecord?.data) {
    const dbUpdatedAt = Number(dbRecord.updatedAt) || 0;
    const localUpdatedAt = Number(localRecord.updatedAt) || 0;

    // Prefer the newer snapshot. If equal/unknown, keep IndexedDB as source of truth.
    if (localUpdatedAt > dbUpdatedAt) {
      await saveFileSystemQManagerToDB(
        localRecord.data,
        address,
        localUpdatedAt || getNow()
      );
      return localRecord.data;
    }

    saveFileSystemQManagerToLocalStorage(
      dbRecord.data,
      address,
      dbUpdatedAt || getNow()
    );
    return dbRecord.data;
  }

  if (dbRecord?.data) {
    const synchronizedAt = Number(dbRecord.updatedAt) || getNow();
    saveFileSystemQManagerToLocalStorage(
      dbRecord.data,
      address,
      synchronizedAt
    );
    return dbRecord.data;
  }

  // IndexedDB unavailable/empty: fallback to local backup and heal DB opportunistically.
  if (localRecord?.data) {
    const synchronizedAt = Number(localRecord.updatedAt) || getNow();
    await saveFileSystemQManagerToDB(localRecord.data, address, synchronizedAt);
    return localRecord.data;
  }

  return null;
};

export const publishFileSystemQManagerToQDN = async ({
  fileSystemQManager,
}) => {
  if (!fileSystemQManager) {
    throw new Error("No filesystem data available to publish");
  }

  const plainData64 = await objectToBase64(fileSystemQManager);
  const encryptedData = await qortalRequest({
    action: "ENCRYPT_DATA",
    data64: plainData64,
  });

  if (!encryptedData) {
    throw new Error("Failed to encrypt filesystem data");
  }

  return qortalRequest({
    action: "PUBLISH_QDN_RESOURCE",
    service: "DOCUMENT_PRIVATE",
    identifier: QDN_STRUCTURE_IDENTIFIER,
    filename: QDN_STRUCTURE_FILENAME,
    data64: encryptedData,
  });
};

export const importFileSystemQManagerFromQDN = async (name) => {
  if (!name) {
    throw new Error("Qortal name is required to import from QDN");
  }

  const response = await fetch(
    `/arbitrary/DOCUMENT_PRIVATE/${name}/${QDN_STRUCTURE_IDENTIFIER}?encoding=base64`
  );

  if (!response.ok) {
    throw new Error(`Could not fetch filesystem resource from QDN (${response.status})`);
  }

  const encryptedData = await response.text();
  if (!encryptedData) {
    throw new Error("No filesystem data found in QDN resource");
  }

  const decryptedData = await qortalRequest({
    action: "DECRYPT_DATA",
    encryptedData,
  });

  if (!decryptedData) {
    throw new Error("Could not decrypt filesystem data");
  }

  const decryptedBytes = base64ToUint8Array(decryptedData);
  const parsed = uint8ArrayToObject(decryptedBytes);
  if (!isValidFileSystemQManager(parsed)) {
    throw new Error("QDN filesystem data is invalid");
  }

  return parsed;
};

const normalizeResourceList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.resources)) return payload.resources;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const fetchResourcesFromEndpoint = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const json = await response.json();
    return normalizeResourceList(json);
  } catch (error) {
    return [];
  }
};

const getResourceField = (resource, keys) => {
  for (const key of keys) {
    if (resource?.[key] !== undefined && resource?.[key] !== null) {
      return resource[key];
    }
  }
  return undefined;
};

const isDeleteTombstoneResource = (resource) => {
  const rawSize = getResourceField(resource, [
    "size",
    "sizeInBytes",
    "dataSize",
    "createdSize",
    "totalSize",
  ]);
  const numericSize = Number(rawSize);
  if (!Number.isFinite(numericSize)) return false;
  return numericSize <= 1;
};

const normalizeDiscoveredResource = (resource, ownerName) => {
  const identifier = getResourceField(resource, [
    "identifier",
    "id",
    "resourceId",
  ]);
  if (!identifier || typeof identifier !== "string") return null;

  const identifierLower = identifier.toLowerCase();
  if (!identifierLower.includes("q-manager")) return null;
  if (identifier === QDN_STRUCTURE_IDENTIFIER) return null;
  if (identifier === LEGACY_QDN_BACKUP_IDENTIFIER) return null;
  if (isDeleteTombstoneResource(resource)) return null;

  const service = getResourceField(resource, ["service", "serviceName"]);
  if (!service || typeof service !== "string") return null;

  const qortalName = getResourceField(resource, ["name", "qortalName"]) || ownerName;
  if (!qortalName) return null;

  const filename = getResourceField(resource, ["filename", "fileName"]);
  const title = getResourceField(resource, ["title"]);
  const mimeType = getResourceField(resource, [
    "mimeType",
    "mime",
    "contentType",
    "mediaType",
  ]);
  const groupId = getResourceField(resource, ["groupId", "group", "groupid"]);
  const rawSize = getResourceField(resource, [
    "sizeInBytes",
    "size",
    "dataSize",
    "createdSize",
    "totalSize",
  ]);
  const parsedSize = Number(rawSize);
  const sizeInBytes =
    Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined;

  return {
    type: "file",
    name: filename || title || identifier,
    displayName: filename || title || identifier,
    ...(filename ? { filename } : {}),
    ...(title ? { title } : {}),
    identifier,
    service,
    qortalName,
    mimeType: mimeType || "application/octet-stream",
    groupId: Number(groupId) || 0,
    ...(sizeInBytes !== undefined ? { sizeInBytes } : {}),
  };
};

const buildGetResourcePropertiesPayloads = (resource) => {
  const basePayload = {
    action: "GET_QDN_RESOURCE_PROPERTIES",
    service: resource?.service,
    identifier: resource?.identifier,
  };
  const ownerName = resource?.qortalName || resource?.name;
  if (!ownerName) return [basePayload];
  return [
    { ...basePayload, name: ownerName },
    { ...basePayload, qortalName: ownerName },
    basePayload,
  ];
};

const hydrateDiscoveredResourceFromProperties = async (resource) => {
  if (!resource?.service || !resource?.identifier) return resource;
  if (resource?.filename) return resource;
  if (typeof qortalRequest !== "function") return resource;

  const payloads = buildGetResourcePropertiesPayloads(resource);
  let properties = null;

  for (const payload of payloads) {
    try {
      const response = await qortalRequest(payload);
      if (response === undefined || response === null) continue;
      properties = response;
      break;
    } catch (error) {}
  }

  if (!properties || typeof properties !== "object") return resource;

  const filename = getResourceField(properties, ["filename", "fileName"]);
  const mimeType = getResourceField(properties, [
    "mimeType",
    "mime",
    "contentType",
    "mediaType",
  ]);
  const rawSize = getResourceField(properties, [
    "sizeInBytes",
    "size",
    "dataSize",
    "createdSize",
    "totalSize",
  ]);
  const parsedSize = Number(rawSize);
  const sizeInBytes =
    Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined;

  const next = { ...resource };
  if (filename) {
    next.filename = filename;
    if (!next.displayName || next.displayName === next.identifier) {
      next.displayName = filename;
    }
    if (!next.name || next.name === next.identifier) {
      next.name = filename;
    }
  }
  if (mimeType && (!next.mimeType || next.mimeType === "application/octet-stream")) {
    next.mimeType = mimeType;
  }
  if (sizeInBytes !== undefined && next.sizeInBytes === undefined) {
    next.sizeInBytes = sizeInBytes;
  }

  return next;
};

export const discoverQManagerResourcesByName = async (name) => {
  if (!name) {
    throw new Error("Qortal name is required to discover published resources");
  }

  const encodedName = encodeURIComponent(name);
  const discoveredMap = new Map();

  const sharedQuery = "reverse=true&limit=0&offset=0&includemetadata=true";
  const broadEndpoints = [
    `/arbitrary/resources/search?name=${encodedName}&${sharedQuery}`,
    `/arbitrary/resources?name=${encodedName}&${sharedQuery}`,
  ];

  const broadResults = await Promise.all(
    broadEndpoints.map(fetchResourcesFromEndpoint)
  );

  for (const list of broadResults) {
    for (const resource of list) {
      const normalized = normalizeDiscoveredResource(resource, name);
      if (!normalized) continue;
      const key = `${normalized.service}|${normalized.identifier}|${normalized.qortalName}`;
      discoveredMap.set(key, normalized);
    }
  }

  if (discoveredMap.size === 0) {
    const allServices = Array.from(
      new Set([...services, ...privateServices].map((item) => item.name))
    );

    const serviceResults = await Promise.all(
      allServices.map((service) =>
        fetchResourcesFromEndpoint(
          `/arbitrary/resources/search?name=${encodedName}&service=${encodeURIComponent(
            service
          )}&${sharedQuery}`
        )
      )
    );

    for (const list of serviceResults) {
      for (const resource of list) {
        const normalized = normalizeDiscoveredResource(resource, name);
        if (!normalized) continue;
        const key = `${normalized.service}|${normalized.identifier}|${normalized.qortalName}`;
        discoveredMap.set(key, normalized);
      }
    }
  }

  const discoveredResources = Array.from(discoveredMap.values());
  if (discoveredResources.length === 0) {
    return discoveredResources;
  }

  const hydratedResources = await Promise.all(
    discoveredResources.map((resource) =>
      hydrateDiscoveredResourceFromProperties(resource)
    )
  );

  return hydratedResources;
};
