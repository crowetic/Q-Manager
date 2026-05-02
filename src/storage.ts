// @ts-nocheck
import {
  base64ToUint8Array,
  objectToBase64,
  uint8ArrayToObject,
} from "./utils";
import { privateServices, services } from "./constants";
import { requestQortal } from "./qapp/request";

const DB_NAME = "FileSystemDB";
const DB_VERSION = 2;
const STORE_NAME = "fileSystemQManager";
const PRIVATE_RESOURCE_INDEX_STORE = "privateResourceIndex";
const LOCAL_STORAGE_PREFIX = "q-manager-filesystem-v1";
const PRIVATE_INDEX_LOCAL_STORAGE_PREFIX = "q-manager-private-index-v1";
const PRIVATE_INDEX_LOCAL_MAX_BYTES = Math.floor(4.75 * 1024 * 1024);

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

const QDN_FILESYSTEM_IDENTIFIER = "q-manager-filesystem-v1";

export const getQdnFileSystemIdentifier = () => QDN_FILESYSTEM_IDENTIFIER;

const isValidPrivateResourceIndex = (data) => {
  return (
    data &&
    typeof data === "object" &&
    typeof data.entries === "object" &&
    data.entries !== null
  );
};

const getNow = () => Date.now();

const toStorageRecord = (fileSystemQManager, updatedAt = getNow()) => ({
  version: STORAGE_RECORD_VERSION,
  updatedAt,
  data: fileSystemQManager,
});

const toPrivateIndexRecord = (privateResourceIndex, updatedAt = getNow()) => ({
  version: 1,
  updatedAt,
  data: privateResourceIndex,
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

const parsePrivateIndexRecord = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  if (isValidPrivateResourceIndex(raw?.data)) {
    return {
      data: raw.data,
      updatedAt: Number(raw.updatedAt) || 0,
    };
  }

  if (isValidPrivateResourceIndex(raw)) {
    return {
      data: raw,
      updatedAt: Number(raw.updatedAt || raw._updatedAt) || 0,
    };
  }

  return null;
};

const getResourceField = (resource, keys) => {
  for (const key of keys) {
    if (resource?.[key] !== undefined && resource?.[key] !== null) {
      return resource[key];
    }
  }
  return undefined;
};

const buildResourcePropertyPayloads = (resource) => {
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

export const fetchQdnResourceProperties = async (resource) => {
  if (!resource?.service || !resource?.identifier) return null;
  if (typeof requestQortal !== "function") return null;

  const payloads = buildResourcePropertyPayloads(resource);

  for (const payload of payloads) {
    try {
      const response = await requestQortal(payload);
      if (response === undefined || response === null) continue;
      return response;
    } catch (error) {}
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
      if (!db.objectStoreNames.contains(PRIVATE_RESOURCE_INDEX_STORE)) {
        db.createObjectStore(PRIVATE_RESOURCE_INDEX_STORE, { keyPath: "name" });
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

const getPrivateIndexLocalStorageKey = (name) =>
  `${PRIVATE_INDEX_LOCAL_STORAGE_PREFIX}:${name}`;

const getPrivateIndexRecordFromLocalStorage = (name, fallbackNames = []) => {
  const lookupNames = [name, ...(Array.isArray(fallbackNames) ? fallbackNames : [])].filter(
    Boolean
  );
  if (lookupNames.length === 0) return null;

  for (const lookupName of lookupNames) {
    try {
      const key = getPrivateIndexLocalStorageKey(lookupName);
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const parsed = JSON.parse(stored);
      const record = parsePrivateIndexRecord(parsed);
      if (record) return record;
    } catch (error) {
      console.error("Error reading private index from localStorage:", error);
    }
  }

  return null;
};

export const getPrivateResourceIndexFromLocalStorage = (name, fallbackNames = []) => {
  const record = getPrivateIndexRecordFromLocalStorage(name, fallbackNames);
  return record?.data || null;
};

const savePrivateIndexToLocalStorage = (
  privateResourceIndex,
  name,
  updatedAt = getNow()
) => {
  if (!name) return;

  try {
    const serialized = JSON.stringify(
      toPrivateIndexRecord(privateResourceIndex, updatedAt)
    );
    if (serialized.length > PRIVATE_INDEX_LOCAL_MAX_BYTES) {
      localStorage.removeItem(getPrivateIndexLocalStorageKey(name));
      return;
    }
    localStorage.setItem(getPrivateIndexLocalStorageKey(name), serialized);
  } catch (error) {
    console.error("Error saving private index to localStorage:", error);
  }
};

export const savePrivateResourceIndexToDB = async (
  privateResourceIndex,
  name,
  updatedAt = getNow()
) => {
  if (!name) throw new Error("Name is required to save private index.");

  try {
    const db = await initializeDB();
    const transaction = db.transaction(PRIVATE_RESOURCE_INDEX_STORE, "readwrite");
    const store = transaction.objectStore(PRIVATE_RESOURCE_INDEX_STORE);

    store.put({
      name,
      ...toPrivateIndexRecord(privateResourceIndex, updatedAt),
    });

    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error("Error saving private index to IndexedDB:", error);
    return false;
  }
};

const getPrivateIndexRecordFromDB = async (name, fallbackNames = []) => {
  const lookupNames = [name, ...(Array.isArray(fallbackNames) ? fallbackNames : [])].filter(
    Boolean
  );
  if (lookupNames.length === 0) return null;

  try {
    const db = await initializeDB();

    for (const lookupName of lookupNames) {
      const transaction = db.transaction(PRIVATE_RESOURCE_INDEX_STORE, "readonly");
      const store = transaction.objectStore(PRIVATE_RESOURCE_INDEX_STORE);
      const record = await new Promise((resolve, reject) => {
        const request = store.get(lookupName);

        request.onsuccess = (event) => {
          if (event.target.result) {
            resolve(parsePrivateIndexRecord(event.target.result));
          } else {
            resolve(null);
          }
        };
        request.onerror = (event) => reject(event.target.error);
      });

      if (record) return record;
    }
  } catch (error) {
    console.error("Error retrieving private index from IndexedDB:", error);
    return null;
  }

  return null;
};

export const getPrivateResourceIndexFromDB = async (name, fallbackNames = []) => {
  const record = await getPrivateIndexRecordFromDB(name, fallbackNames);
  return record?.data || null;
};

export const savePrivateResourceIndexEverywhere = async (
  privateResourceIndex,
  name
) => {
  if (!name) throw new Error("Name is required to save private index.");
  const updatedAt = getNow();

  const dbSaved = await savePrivateResourceIndexToDB(
    privateResourceIndex,
    name,
    updatedAt
  );

  if (dbSaved) {
    savePrivateIndexToLocalStorage(privateResourceIndex, name, updatedAt);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("q-manager-private-index-changed", {
          detail: { name, updatedAt, source: "indexeddb" },
        })
      );
    }
    return {
      updatedAt,
      primary: "indexeddb",
      fallbackUsed: false,
    };
  }

  savePrivateIndexToLocalStorage(privateResourceIndex, name, updatedAt);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("q-manager-private-index-changed", {
        detail: { name, updatedAt, source: "localstorage" },
      })
    );
  }
  return {
    updatedAt,
    primary: "localstorage",
    fallbackUsed: true,
  };
};

export const getPersistedPrivateResourceIndex = async (name, fallbackNames = []) => {
  if (!name) return null;

  const dbRecord = await getPrivateIndexRecordFromDB(name, fallbackNames);
  const localRecord = getPrivateIndexRecordFromLocalStorage(name, fallbackNames);

  if (dbRecord?.data && localRecord?.data) {
    const dbUpdatedAt = Number(dbRecord.updatedAt) || 0;
    const localUpdatedAt = Number(localRecord.updatedAt) || 0;

    if (localUpdatedAt > dbUpdatedAt) {
      await savePrivateResourceIndexToDB(
        localRecord.data,
        name,
        localUpdatedAt || getNow()
      );
      return localRecord.data;
    }

    savePrivateIndexToLocalStorage(dbRecord.data, name, dbUpdatedAt || getNow());
    return dbRecord.data;
  }

  if (dbRecord?.data) {
    const synchronizedAt = Number(dbRecord.updatedAt) || getNow();
    savePrivateIndexToLocalStorage(dbRecord.data, name, synchronizedAt);
    return dbRecord.data;
  }

  if (localRecord?.data) {
    const synchronizedAt = Number(localRecord.updatedAt) || getNow();
    await savePrivateResourceIndexToDB(localRecord.data, name, synchronizedAt);
    return localRecord.data;
  }

  return null;
};

export const upsertPrivateResourceIndexEntry = async (name, entry) => {
  if (!name) throw new Error("Name is required to update private index.");
  if (!entry || typeof entry !== "object") return null;

  const existingIndex =
    (await getPersistedPrivateResourceIndex(name)) || { entries: {} };
  const nextEntries = { ...(existingIndex.entries || {}) };
  const key =
    entry.resourceKey ||
    entry.entryKey ||
    entry.key ||
    [
      entry?.qortalName || name,
      entry?.service || "",
      entry?.identifier || "",
      entry?.group || entry?.groupId || 0,
    ].join("|");

  nextEntries[key] = {
    ...(nextEntries[key] || {}),
    ...entry,
    key,
    updatedAt: getNow(),
  };

  const nextIndex = {
    version: 1,
    updatedAt: getNow(),
    entries: nextEntries,
  };

  await savePrivateResourceIndexEverywhere(nextIndex, name);
  return nextIndex;
};

export const getPrivateResourceIndexEntry = async (name, resourceKey) => {
  if (!name || !resourceKey) return null;
  const index = await getPersistedPrivateResourceIndex(name);
  return index?.entries?.[resourceKey] || null;
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
  privateResourceIndex,
  activePublishName,
}) => {
  if (!fileSystemQManager) {
    throw new Error("No filesystem data available to publish");
  }
  if (!activePublishName) {
    throw new Error("Qortal name is required to publish filesystem");
  }

  // Always include the private index in the QDN backup so another node can
  // load the complete local state (filesystem + private index) from QDN.
  const payload = {
    version: 1,
    publishedAt: getNow(),
    publishedBy: activePublishName,
    fileSystem: {
      public: fileSystemQManager.public,
      private: fileSystemQManager.private,
      group: fileSystemQManager.group || {},
    },
    privateResourceIndex: privateResourceIndex || { entries: {} },
  };
  const plainData64 = await objectToBase64(payload);
  const encryptedData = await requestQortal({
    action: "ENCRYPT_DATA",
    data64: plainData64,
  });

  if (!encryptedData) {
    throw new Error("Failed to encrypt filesystem data");
  }

  return requestQortal({
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

  const decryptedData = await requestQortal({
    action: "DECRYPT_DATA",
    encryptedData,
  });

  if (!decryptedData) {
    throw new Error("Could not decrypt filesystem data");
  }

  const decryptedBytes = base64ToUint8Array(decryptedData);
  const parsed = uint8ArrayToObject(decryptedBytes);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("QDN filesystem data is invalid");
  }

  // Handle both new v1 structure (filesystem + private index) and legacy structure
  if (parsed?.fileSystem) {
    return {
      public: parsed.fileSystem.public,
      private: parsed.fileSystem.private,
      group: parsed.fileSystem.group || {},
      ...(parsed?.privateResourceIndex ? { privateResourceIndex: parsed.privateResourceIndex } : {}),
      _publishedAt: parsed.publishedAt,
      _publishedBy: parsed.publishedBy,
    };
  }

  // Legacy format - directly has public/private/group
  if (isValidFileSystemQManager(parsed)) {
    return {
      public: parsed.public,
      private: parsed.private,
      group: parsed.group || {},
    };
  }

  throw new Error("QDN filesystem data is invalid");
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
  const encryptionType = getResourceField(resource, [
    "encryptionType",
    "encryption",
    "type",
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
    ...(encryptionType ? { encryptionType } : {}),
    groupId: Number(groupId) || 0,
    ...(sizeInBytes !== undefined ? { sizeInBytes } : {}),
  };
};

const hydrateDiscoveredResourceFromProperties = async (resource) => {
  if (!resource?.service || !resource?.identifier) return resource;
  if (
    resource?.filename &&
    resource?.mimeType &&
    resource?.sizeInBytes !== undefined &&
    resource?.encryptionType
  ) {
    return resource;
  }
  const properties = await fetchQdnResourceProperties(resource);

  if (!properties || typeof properties !== "object") return resource;

  const filename = getResourceField(properties, ["filename", "fileName"]);
  const mimeType = getResourceField(properties, [
    "mimeType",
    "mime",
    "contentType",
    "mediaType",
  ]);
  const encryptionType = getResourceField(properties, [
    "encryptionType",
    "encryption",
    "type",
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
  if (encryptionType && !next.encryptionType) {
    next.encryptionType = encryptionType;
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
